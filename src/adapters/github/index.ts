import { readdir, readFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { Dispatch, Execution, Observation, type PipelinePlan, type Sample, type Workload } from '../../contracts/index.js';
import { Budget, Store } from '../records/store.js';
import { slot } from '../records/concurrency.js';
import { atomic, command, digest, json, now, pause, readJson } from '../../util.js';

export interface DispatchRequest { correlation: string; commit: string; ref: string; pair: number; side: 'baseline' | 'candidate'; group: 'cold' | 'warm'; cacheKey: string; expectedCacheHit: boolean; patchDigest: string; prime?: boolean | undefined }
export interface GitHubTransport { api(endpoint: string): Promise<any>; dispatch(repository: string, workflow: string, ref: string, fields: Record<string, string>): Promise<void>; download(repository: string, run: number, destination: string): Promise<void>; cancel(repository: string, run: number): Promise<void> }
export class GhTransport implements GitHubTransport {
  async api(endpoint: string) { return JSON.parse(await command('gh', ['api', endpoint])); }
  async dispatch(repository: string, workflow: string, ref: string, fields: Record<string, string>) { await command('gh', ['workflow', 'run', workflow, '--repo', repository, '--ref', ref, ...Object.entries(fields).flatMap(([key, value]) => ['-f', `${key}=${value}`])]); }
  async download(repository: string, run: number, destination: string) { await command('gh', ['run', 'download', String(run), '--repo', repository, '--dir', destination], { timeout: 120000 }); }
  async cancel(repository: string, run: number) { await command('gh', ['run', 'cancel', String(run), '--repo', repository]); }
}
const Intent = z.object({ schemaVersion: z.literal(1), requestDigest: z.string(), correlation: z.string(), commit: z.string(), ref: z.string(), status: z.enum(['submitting', 'submitted', 'reconciled', 'completed']), createdAt: z.string(), runId: z.number().nullable() });
export class GitHubRunner {
  constructor(readonly transport: GitHubTransport, readonly store: Store, readonly budget: Budget, readonly manifest: Workload, readonly timeoutSeconds = 1200, readonly pollMs = 10000, readonly maxConcurrency = 4) {}
  async preflight() {
    const repo = await this.transport.api(`repos/${this.manifest.repository}`);
    if (repo.private !== false || !repo.permissions?.push || repo.archived || repo.disabled) throw new Error('GITHUB_POLICY: active public writable repository required');
    const permissions = await this.transport.api(`repos/${this.manifest.repository}/actions/permissions`);
    if (!permissions.enabled) throw new Error('GITHUB_POLICY: Actions are disabled');
  }
  async matching(request: DispatchRequest) {
    const matches: any[] = [];
    for (let page = 1; page <= 10; page++) {
      const result = await this.transport.api(`repos/${this.manifest.repository}/actions/workflows/${this.manifest.workflow}/runs?event=workflow_dispatch&per_page=100&page=${page}`);
      matches.push(...result.workflow_runs.filter((run: any) => run.display_title === request.correlation));
      if (result.workflow_runs.length < 100) break;
    }
    if (matches.length > 1) throw new Error('DISPATCH_DUPLICATE: multiple runs share one correlation');
    if (matches.some(run => run.head_sha !== request.commit || run.head_branch !== request.ref)) throw new Error('DISPATCH_IDENTITY: matching title has the wrong commit or branch');
    return matches[0] as any | undefined;
  }
  async execute(request: DispatchRequest, plan: PipelinePlan, signal?: AbortSignal): Promise<Sample> {
    Dispatch.parse(request);
    const release = await slot(this.budget.root, request.correlation, this.maxConcurrency, signal);
    try { return await this.executeHeld(request, plan, signal); }
    finally { await release(); }
  }
  private async executeHeld(request: DispatchRequest, plan: PipelinePlan, signal?: AbortSignal): Promise<Sample> {
    const output = path.join(this.store.root, 'remote', `${request.correlation}.observation.json`);
    try { return Observation.parse(await readJson(output)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await this.preflight();
    const requestDigest = digest(json(request)), file = path.join(this.store.root, 'dispatch', `${request.correlation}.json`);
    await this.budget.reserve(`github-${request.correlation}`, .001, 'Public standard Linux compute: $0; <=100 KB compressed reports, one-day retention, conservative storage bound $0.001. No paid runners.');
    let intent: z.infer<typeof Intent>;
    try { intent = Intent.parse(await readJson(file)); if (intent.requestDigest !== requestDigest) throw new Error('DISPATCH_REPLAY: request changed'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      intent = { schemaVersion: 1, requestDigest, correlation: request.correlation, commit: request.commit, ref: request.ref, status: 'submitting', createdAt: now(), runId: null };
      await atomic(file, json(intent));
      await this.transport.dispatch(this.manifest.repository, this.manifest.workflow, request.ref, { correlation: request.correlation, cache_key: request.cacheKey });
      intent.status = 'submitted'; await atomic(file, json(intent));
    }
    const deadline = Date.now() + this.timeoutSeconds * 1000;
    let remote: any;
    if (intent.runId) remote = await this.transport.api(`repos/${this.manifest.repository}/actions/runs/${intent.runId}`);
    else {
      const visibilityDeadline = Date.now() + Math.min(90000, this.timeoutSeconds * 1000);
      do { remote = await this.matching(request); if (remote) break; await pause(this.pollMs, signal); } while (Date.now() < visibilityDeadline);
      if (!remote) throw new Error('DISPATCH_AMBIGUOUS: persisted submission has no matching visible run; refusing blind retry');
      intent.runId = remote.id; intent.status = 'reconciled'; await atomic(file, json(intent));
    }
    try {
      while (remote.status !== 'completed') {
        if (Date.now() >= deadline) { await this.transport.cancel(this.manifest.repository, remote.id); throw new Error('CI_TIMEOUT: cancellation submitted; resume to reconcile'); }
        await pause(this.pollMs, signal);
        remote = await this.transport.api(`repos/${this.manifest.repository}/actions/runs/${remote.id}`);
      }
    } catch (error) { if (signal?.aborted) await this.transport.cancel(this.manifest.repository, remote.id).catch(() => {}); throw error; }
    if (remote.head_sha !== request.commit || remote.display_title !== request.correlation || remote.head_branch !== request.ref) throw new Error('DISPATCH_IDENTITY: remote identity changed');
    const jobs: any[] = [];
    for (let page = 1; ; page++) { const response = await this.transport.api(`repos/${this.manifest.repository}/actions/runs/${remote.id}/jobs?filter=latest&per_page=100&page=${page}`); jobs.push(...response.jobs); if (response.jobs.length < 100) break; }
    const measured = jobs.filter(job => job.started_at && job.completed_at && job.conclusion !== 'skipped');
    if (!measured.length) throw new Error('CI_EVIDENCE: no completed jobs');
    const started = Math.min(...measured.map(job => Date.parse(job.started_at))), completed = Math.max(...measured.map(job => Date.parse(job.completed_at)));
    const directory = path.join(this.store.root, 'downloads', String(remote.id));
    await rm(directory, { recursive: true, force: true }); await mkdir(directory, { recursive: true });
    const execution: z.infer<typeof Execution>[] = [];
    if (remote.conclusion === 'success') {
      await this.transport.download(this.manifest.repository, remote.id, directory);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^execution-\d+$/.test(entry.name)) throw new Error('CI_EVIDENCE: unexpected artifact');
        const report = await readFile(path.join(directory, entry.name, 'execution.json'), 'utf8');
        if (report.length > 100000) throw new Error('CI_EVIDENCE: report exceeds storage bound');
        execution.push(Execution.parse(JSON.parse(report)));
      }
    }
    const observation = Observation.parse({ schemaVersion: 1, pair: request.pair, side: request.side, group: request.group, commit: request.commit, patchDigest: request.patchDigest, correlation: request.correlation, runId: remote.id, url: remote.html_url, attempt: remote.run_attempt, conclusion: remote.conclusion, createdAt: remote.created_at, startedAt: new Date(started).toISOString(), completedAt: new Date(completed).toISOString(), elapsedSeconds: (completed - started) / 1000, jobSeconds: measured.reduce((sum, job) => sum + (Date.parse(job.completed_at) - Date.parse(job.started_at)) / 1000, 0), queueSeconds: Math.max(0, (started - Date.parse(remote.created_at)) / 1000), jobs: measured.map(job => ({ id: job.id, name: job.name, startedAt: job.started_at, completedAt: job.completed_at, conclusion: job.conclusion, runner: job.labels.includes(this.manifest.runner) ? this.manifest.runner : 'unapproved' })), execution, cacheKey: request.cacheKey, expectedCacheHit: request.expectedCacheHit, source: 'github' });
    await atomic(output, json(observation)); intent.status = 'completed'; await atomic(file, json(intent));
    await this.budget.settle(`github-${request.correlation}`, .001);
    return observation;
  }
}
