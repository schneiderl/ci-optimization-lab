import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, chmod } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fixture } from './helpers.js';
import { GitHubRunner, type GitHubTransport, type DispatchRequest } from '../src/adapters/github/index.js';
import { Store, Budget } from '../src/adapters/records/store.js';
import { RecordedRunner, measure } from '../src/blocks/runner/index.js';
import { pairedLogT95 } from '../src/objectives/index.js';
import { defaultObjective, Hypothesis, State } from '../src/contracts/index.js';
import { invokeModel, OpenCodeModel, type ModelAdapter } from '../src/adapters/models/index.js';
import { cachedCredential, persistCredential, refreshCredential } from '../src/adapters/models/credentials.js';
import { report } from '../src/blocks/reporter/index.js';
import { run } from '../src/coordinator/index.js';
import { atomic, command, digest, json, now, readJson } from '../src/util.js';

async function githubFixture() {
  const f = await fixture('review'), store = new Store(path.join(f.data, 'review')), budget = new Budget(f.data);
  const request: DispatchRequest = { correlation: 'bound-receipt', commit: f.manifest.baselineCommit, ref: 'lab/review/baseline', pair: 0, side: 'baseline', group: 'cold', cacheKey: 'isolated', expectedCacheHit: false, patchDigest: digest('patch') };
  const remote = { id: 123, display_title: request.correlation, head_sha: request.commit, head_branch: request.ref, status: 'completed', conclusion: 'success', run_attempt: 1, created_at: '2026-01-01T00:00:00Z', html_url: 'https://example.test/run/123' };
  let dispatches = 0, cancels = 0;
  const transport: GitHubTransport = {
    async api(endpoint) {
      if (endpoint.endsWith('/actions/permissions')) return { enabled: true };
      if (endpoint === 'repos/example/target') return { private: false, permissions: { push: true } };
      if (endpoint.includes('/workflows/')) return { workflow_runs: [remote] };
      if (endpoint.includes('/jobs?')) return { jobs: [{ id: 1, name: 'tests', started_at: '2026-01-01T00:00:01Z', completed_at: '2026-01-01T00:00:10Z', conclusion: 'success', labels: ['ubuntu-24.04'] }] };
      return remote;
    },
    async dispatch() { dispatches++; },
    async cancel() { cancels++; remote.status = 'completed'; remote.conclusion = 'cancelled'; },
    async download(_repo, _run, destination) {
      const sample = await new RecordedRunner(f.manifest).execute(request, f.plan), record = { ...sample.execution[0]!, runId: '123' };
      await mkdir(path.join(destination, 'execution-0'), { recursive: true }); await atomic(path.join(destination, 'execution-0/execution.json'), json(record));
    },
  };
  return { ...f, store, budget, request, remote, transport, counts: () => ({ dispatches, cancels }) };
}
test('completed CI receipts reject every request identity change plus changed manifest or plan', async () => {
  const f = await githubFixture(), runner = new GitHubRunner(f.transport, f.store, f.budget, f.manifest, 10, 1);
  await runner.execute(f.request, f.plan); assert.equal((await runner.execute(f.request, f.plan)).runId, 123);
  for (const change of [{ commit: 'a'.repeat(40) }, { side: 'candidate' as const }, { pair: 1 }, { group: 'warm' as const }, { cacheKey: 'other' }, { expectedCacheHit: true }, { patchDigest: digest('other') }, { ref: 'lab/other' }]) await assert.rejects(runner.execute({ ...f.request, ...change }, f.plan), /REPLAY/);
  await assert.rejects(runner.execute(f.request, { ...f.plan, cache: true }), /binding/);
  await assert.rejects(new GitHubRunner(f.transport, f.store, f.budget, { ...f.manifest, maxPartitions: 1 }, 10, 1).execute(f.request, f.plan), /binding/);
  assert.equal(f.counts().dispatches, 1);
});
test('acceptance rejects globally mixed groups, baseline pins, patch identities and duplicate runs', async () => {
  const f = await fixture(), measured = await measure(f.config, 1, f.manifest.baselineCommit, 'a'.repeat(40), digest('patch'), f.plan, { ...f.plan, cache: true }, new RecordedRunner(f.manifest));
  const pass = Array.from({ length: 10 }, () => ({ status: 'pass' as const, checks: [{ name: 'all', pass: true, reason: 'verified' }] }));
  const mixed = structuredClone(measured.observations); for (const sample of mixed) if (sample.pair === 0) sample.group = 'cold'; assert.equal(pairedLogT95(mixed, defaultObjective, pass).status, 'inconclusive');
  const pins = structuredClone(measured.observations); pins.find(sample => sample.side === 'baseline')!.commit = 'b'.repeat(40); assert.equal(pairedLogT95(pins, defaultObjective, pass).status, 'inconclusive');
  const patch = structuredClone(measured.observations); for (const sample of patch) if (sample.pair === 0) sample.patchDigest = digest('another-patch'); assert.equal(pairedLogT95(patch, defaultObjective, pass).status, 'inconclusive');
  const duplicate = structuredClone(measured.observations); duplicate[1]!.runId = duplicate[0]!.runId; assert.equal(pairedLogT95(duplicate, defaultObjective, pass).status, 'inconclusive');
});
test('cancellation during delayed dispatch discovery stays durable and resume cancels without redispatch', async () => {
  const f = await githubFixture(), abort = new AbortController(); let visible = false;
  f.remote.status = 'in_progress';
  const transport = { ...f.transport, async api(endpoint: string) { if (endpoint.includes('/workflows/') && !visible) { abort.abort(); return { workflow_runs: [] }; } return f.transport.api(endpoint); } };
  const runner = new GitHubRunner(transport, f.store, f.budget, f.manifest, 10, 1);
  await assert.rejects(runner.execute(f.request, f.plan, abort.signal), /CANCELLED/);
  assert.equal(await runner.hasPendingCancellation(), true); assert.equal(f.counts().cancels, 0);
  visible = true; await runner.reconcileCancellations(); assert.equal(f.counts().dispatches, 1); assert.equal(f.counts().cancels, 1); assert.equal(await runner.hasPendingCancellation(), false);
  const config = { ...f.config, runner: 'github' as const };
  await atomic(path.join(f.store.root, 'state.json'), json(State.parse({ schemaVersion: 1, runId: config.runId, configDigest: digest(json(config)), manifestDigest: digest(json(f.manifest)), status: 'cancelling', cycle: 1, sequence: 1, artifacts: {}, models: [], error: 'cancel pending', updatedAt: now() })));
  const summary = await run(config, { github: transport }); assert.match(summary, /^cancelled:/); assert.equal(f.counts().dispatches, 1);
});
test('failed credential refresh preserves the old value and successful refresh replaces it atomically', async () => {
  const directory = path.join(await mkdtemp(path.join(os.tmpdir(), 'ci-refresh-')), 'credentials'), previous = process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY;
  try {
    await persistCredential('synthetic-old-key', directory, false);
    await assert.rejects(refreshCredential(directory, false, async () => { throw new Error('unavailable'); }), /retained/); assert.equal(await cachedCredential(directory, false), 'synthetic-old-key');
    await assert.rejects(refreshCredential(directory, false, async () => ''), /retained/); assert.equal(await cachedCredential(directory, false), 'synthetic-old-key');
    await refreshCredential(directory, false, async () => 'synthetic-new-key'); assert.equal(await cachedCredential(directory, false), 'synthetic-new-key');
  } finally { if (previous !== undefined) process.env.OPENROUTER_API_KEY = previous; }
});
const input = { role: 'investigator' as const, context: {}, schema: Hypothesis, instruction: 'test' };
function paidFixture(output: unknown, cost = .02): ModelAdapter & { calls: number } {
  return { provider: 'jev', model: 'typesafe/test-fixture', maximumCostUsd: .02, calls: 0, async call() { this.calls++; return { output, usage: { provider: 'jev', model: this.model, inputTokens: 100, outputTokens: 20, costUsd: cost, live: false } }; } };
}
const noChange = { decision: 'no-change', family: 'none', explanation: 'Synthetic response.', plan: null, evidence: ['fixture'] };
test('models and CI share one per-experiment reservation cap across processes and recovery', async () => {
  const f = await fixture(), store = new Store(f.data), a = new Budget(f.data).scoped('scope', .041), b = new Budget(f.data).scoped('scope', .041), adapter = paidFixture(noChange);
  await invokeModel(store, a, 'scope-call1', adapter, input); await invokeModel(store, b, 'scope-call2', adapter, input); await b.reserve('github-scope-ci', .001, 'synthetic CI');
  await assert.rejects(invokeModel(store, a, 'scope-call3', adapter, input), /EXPERIMENT_BUDGET/); assert.equal(adapter.calls, 2);
  const tiny = await fixture('tiny-budget'), neverCalled = paidFixture(noChange);
  await assert.rejects(run({ ...tiny.config, perCallLimitUsd: .02, perExperimentLimitUsd: .001 }, { model: () => neverCalled }), /EXPERIMENT_BUDGET/); assert.equal(neverCalled.calls, 0);
});
test('invalid model output retains known raw response, usage, exact charge and report evidence', async () => {
  const f = await fixture(), store = new Store(f.data), budget = new Budget(f.data), adapter = paidFixture({ wrong: true }, .007);
  await assert.rejects(invokeModel(store, budget, 'invalid', adapter, input));
  const receipt = await readJson(path.join(f.data, 'models/invalid.json')) as any;
  assert.equal(receipt.status, 'invalid-output'); assert.equal(receipt.usage.costUsd, .007); assert.equal(receipt.usage.inputTokens, 100); assert.deepEqual(receipt.output, { wrong: true });
  assert.equal((await budget.snapshot()).entries.invalid!.chargedUpperBoundUsd, .007);
  await assert.rejects(invokeModel(store, budget, 'invalid', adapter, input), /AMBIGUOUS/); assert.equal(adapter.calls, 1);
  const state = State.parse({ schemaVersion: 1, runId: f.config.runId, configDigest: digest(json(f.config)), manifestDigest: digest(json(f.manifest)), status: 'failed', cycle: 1, sequence: 1, artifacts: {}, models: [], error: 'invalid output', updatedAt: now() });
  await report(store, state, f.config, budget); const rendered = await readJson(path.join(f.data, 'report.json')) as any; assert.equal(rendered.modelReceipts[0].usage.costUsd, .007);
});
test('OpenCode requires an explicit successful finish, complete usage and matching exported model identity', async () => {
  const event = { type: 'text', sessionID: 'synthetic', part: { text: JSON.stringify(noChange) } };
  const textOnly: typeof command = async () => JSON.stringify(event) + '\n';
  await assert.rejects(new OpenCodeModel('opencode/test-free', 1000, textOnly).call(input));
  const finish = { type: 'step_finish', sessionID: 'synthetic', part: { type: 'step-finish', reason: 'stop', cost: 0, tokens: { input: 5, output: 10 } } };
  const executor = (modelID: string, usage: unknown = finish.part): typeof command => async (_binary, args) => args.includes('export') ? json({ messages: [{ info: { role: 'assistant', providerID: 'opencode', modelID } }] }) : JSON.stringify(event) + '\n' + JSON.stringify({ ...finish, part: usage }) + '\n';
  await assert.rejects(new OpenCodeModel('opencode/test-free', 1000, executor('other-free')).call(input), /identity/);
  await assert.rejects(new OpenCodeModel('opencode/test-free', 1000, executor('test-free', { type: 'step-finish', reason: 'stop' })).call(input));
  const valid = await new OpenCodeModel('opencode/test-free', 1000, executor('test-free')).call(input); assert.equal(valid.usage.inputTokens, 5); assert.equal(valid.usage.outputTokens, 10); assert.equal(valid.usage.model, 'opencode/test-free');
});
test('pre-aborted and abort-during-preflight requests never reserve or submit work', async () => {
  for (const phase of ['before', 'preflight']) {
    const f = await githubFixture(), abort = new AbortController();
    const transport = { ...f.transport, async api(endpoint: string) { const value = await f.transport.api(endpoint); if (phase === 'preflight') abort.abort(); return value; } };
    if (phase === 'before') abort.abort();
    const runner = new GitHubRunner(transport, f.store, f.budget, f.manifest, 10, 1);
    await assert.rejects(runner.execute(f.request, f.plan, abort.signal), /CANCELLED/);
    assert.deepEqual(f.counts(), { dispatches: 0, cancels: 0 }); assert.equal(Object.keys((await f.budget.snapshot()).entries).length, 0);
    assert.equal(await runner.cancellationStatus(f.request), 'none'); assert.equal(await runner.hasPendingCancellation(), false);
  }
});
test('abort after reservation releases unsubmitted allowance and creates no ambiguous intent', async () => {
  const f = await githubFixture(), abort = new AbortController();
  class AbortBudget extends Budget { override async reserve(...args: Parameters<Budget['reserve']>) { await super.reserve(...args); abort.abort(); } }
  const budget = new AbortBudget(f.data), runner = new GitHubRunner(f.transport, f.store, budget, f.manifest, 10, 1);
  await assert.rejects(runner.execute(f.request, f.plan, abort.signal), /CANCELLED/);
  assert.deepEqual(f.counts(), { dispatches: 0, cancels: 0 }); assert.equal(await runner.cancellationStatus(f.request), 'none');
  assert.equal((await budget.snapshot()).entries[`github-${f.request.correlation}`]!.chargedUpperBoundUsd, 0);
});
test('standalone GitHub CLI reconciles pending cancellation and replays cancellation without dispatch', async () => {
  const f = await githubFixture(), root = await mkdtemp(path.join(os.tmpdir(), 'ci-cli-cancel-')), cwd = path.join(root, 'lab'), bin = path.join(root, 'bin');
  await mkdir(cwd); await mkdir(bin);
  const data = path.join(root, 'remote.json'), log = path.join(root, 'calls.jsonl');
  await atomic(data, json({ ...f.remote, status: 'in_progress' }));
  const executable = path.join(bin, 'gh');
  await writeFile(executable, `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2),file=${JSON.stringify(data)};fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');const remote=JSON.parse(fs.readFileSync(file,'utf8'));if(args[0]==='api'){console.log(JSON.stringify(remote));}else if(args[0]==='run'&&args[1]==='cancel'){remote.status='completed';remote.conclusion='cancelled';fs.writeFileSync(file,JSON.stringify(remote));}else{throw Error('Unexpected external action');}\n`);
  await chmod(executable, 0o700);
  const id = 'pending-cli', blockRoot = path.join(root, 'ci-lab-runs/blocks', id), inputFile = path.join(root, 'input.json');
  await atomic(path.join(blockRoot, `dispatch/${f.request.correlation}.json`), json({ schemaVersion: 1, requestDigest: digest(json(f.request)), correlation: f.request.correlation, commit: f.request.commit, ref: f.request.ref, status: 'cancel-pending', createdAt: now(), runId: 123, cancelRequested: true }));
  await atomic(inputFile, json({ envelope: { schemaVersion: 1, runId: id, stepId: 'runner', attemptId: 'one', inputs: [], outputs: [] }, context: { manifest: f.manifest, plan: f.plan, request: f.request } }));
  const cli = async (mode: string) => JSON.parse(await command(process.execPath, ['--import', path.resolve('node_modules/tsx/dist/loader.mjs'), path.resolve('src/cli/index.ts'), 'block', 'runner', inputFile, mode], { cwd, env: { PATH: bin, HOME: root, NO_COLOR: '1' }, timeout: 30000 }));
  assert.equal((await cli('github')).output.status, 'cancelled'); assert.equal((await cli('github')).output.status, 'cancelled'); assert.equal((await cli('github-reconcile')).output.status, 'cancelled');
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[]);
  assert.equal(calls.filter(args => args[0] === 'workflow').length, 0); assert.equal(calls.filter(args => args[0] === 'run' && args[1] === 'cancel').length, 1);
});
