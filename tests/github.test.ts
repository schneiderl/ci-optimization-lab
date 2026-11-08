import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers.js';
import { GitHubRunner, type DispatchRequest, type GitHubTransport } from '../src/adapters/github/index.js';
import { Store, Budget } from '../src/adapters/records/store.js';
import { digest, json, atomic } from '../src/util.js';

test('interrupted submission reconciles exact correlation and commit without dispatching twice', async () => {
  const f = await fixture(), store = new Store(f.data), budget = new Budget(f.data);
  const request: DispatchRequest = { correlation: 'reconcile', commit: f.manifest.baselineCommit, ref: 'lab/reconcile', pair: 0, side: 'baseline', group: 'cold', cacheKey: 'isolated', expectedCacheHit: false, patchDigest: digest('patch') };
  let dispatches = 0, downloads = 0;
  const remote = { id: 123, display_title: request.correlation, head_sha: request.commit, head_branch: request.ref, status: 'completed', run_attempt: 1, conclusion: 'success', html_url: 'https://example.test/run/123', created_at: '2026-01-01T00:00:00Z' };
  const transport: GitHubTransport = {
    async api(endpoint) {
      if (endpoint.endsWith('/actions/permissions')) return { enabled: true };
      if (endpoint === 'repos/example/target') return { private: false, permissions: { push: true } };
      if (endpoint.includes('/jobs?')) return { jobs: [{ id: 1, name: 'tests', started_at: '2026-01-01T00:00:02Z', completed_at: '2026-01-01T00:00:10Z', conclusion: 'success', labels: ['ubuntu-24.04'] }] };
      if (endpoint.includes('/workflows/')) return { workflow_runs: [remote] };
      return remote;
    },
    async dispatch() { dispatches++; },
    async download(_repo, _run, destination) {
      downloads++; await mkdir(path.join(destination, 'execution-0'), { recursive: true });
      await writeFile(path.join(destination, 'execution-0/execution.json'), json({ schemaVersion: 1, runId: '123', commit: request.commit, planDigest: digest(JSON.stringify(f.plan) + '\n'), cacheKey: 'isolated', cacheHit: false, partition: 0, node: 'v24', tests: Object.entries(f.manifest.tests).map(([id, output]) => ({ id, output, status: 'pass' })), dependencyCheck: true }));
    },
    async cancel() {},
  };
  await atomic(path.join(f.data, 'dispatch/reconcile.json'), json({ schemaVersion: 1, requestDigest: digest(json(request)), correlation: request.correlation, commit: request.commit, ref: request.ref, status: 'submitting', createdAt: '2026-01-01T00:00:00Z', runId: null }));
  const runner = new GitHubRunner(transport, store, budget, f.manifest, 10, 1);
  const sample = await runner.execute(request, f.plan); assert.equal(sample.runId, 123); assert.equal(dispatches, 0); assert.equal(sample.queueSeconds, 2); assert.equal(sample.jobSeconds, 8);
  await runner.execute(request, f.plan); assert.equal(downloads, 1);
  const wrong = new GitHubRunner({ ...transport, api: async endpoint => endpoint.includes('/workflows/') ? { workflow_runs: [{ ...remote, head_sha: 'a'.repeat(40) }] } : transport.api(endpoint) }, store, budget, f.manifest, 10, 1);
  await assert.rejects(wrong.matching(request), /IDENTITY/);
  const duplicate = new GitHubRunner({ ...transport, api: async endpoint => endpoint.includes('/workflows/') ? { workflow_runs: [remote, remote] } : transport.api(endpoint) }, store, budget, f.manifest, 10, 1);
  await assert.rejects(duplicate.matching(request), /DUPLICATE/);
});
