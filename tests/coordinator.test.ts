import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers.js';
import { run } from '../src/coordinator/index.js';
import { RecordedModel } from '../src/adapters/models/index.js';
import { State } from '../src/contracts/index.js';
import { RecordedRunner } from '../src/blocks/runner/index.js';

test('full three-agent workflow persists evidence and reports recorded acceptance as inconclusive', async () => {
  const f = await fixture('full'); const summary = await run(f.config); assert.match(summary, /^inconclusive:/);
  const state = State.parse(JSON.parse(await readFile(f.statePath, 'utf8')));
  assert.deepEqual(state.models.map(model => model.role).sort(), ['editor', 'investigator', 'reviewer']);
  assert.ok(state.artifacts['1-acceptance']); assert.ok(state.artifacts['1-execution-validation']);
  const report = JSON.parse(await readFile(path.join(f.data, 'full/report.json'), 'utf8')); assert.equal(report.artifacts['1-acceptance'].status, 'accepted');
  assert.equal(await run(f.config), summary); await assert.rejects(run({ ...f.config, group: 'cold' }), /MISMATCH/);
});
test('interruption resumes verified artifacts without duplicate model calls or measurements', async () => {
  const f = await fixture('resume'); let interrupted = false, calls = 0, executions = 0;
  class Counting extends RecordedModel { override async call(input: Parameters<RecordedModel['call']>[0]) { calls++; return super.call(input); } }
  class CountRunner extends RecordedRunner { override async execute(...args: Parameters<RecordedRunner['execute']>) { executions++; return super.execute(...args); } }
  const dependencies = { model: (_: string, defaults: Record<string, unknown>) => new Counting(defaults), runner: new CountRunner(f.manifest), afterSave: (state: { status: string }) => { if (!interrupted && state.status === 'reviewing') { interrupted = true; throw new Error('simulated process interruption'); } } };
  await assert.rejects(run(f.config, dependencies), /interruption/); assert.equal(calls, 2); const before = executions;
  await run(f.config, dependencies); assert.equal(calls, 3); assert.equal(executions, before);
});
test('reviewer approval cannot override missing tests; no invalid candidate reaches runner', async () => {
  const f = await fixture('unsafe'); let executions = 0;
  class CountRunner extends RecordedRunner { override async execute(...args: Parameters<RecordedRunner['execute']>) { executions++; return super.execute(...args); } }
  const summary = await run(f.config, { runner: new CountRunner(f.manifest), model: (role, defaults) => new RecordedModel(role === 'editor' ? { ...defaults, editor: { files: [{ path: 'ci/plan.json', content: JSON.stringify({ schemaVersion: 1, cache: true, partitions: [['one']] }) }], explanation: 'Omitted required test.' } } : defaults) });
  assert.match(summary, /^rejected:/); assert.equal(executions, 1);
});
test('no-change returns a reasoned result and five observations without manufacturing a patch', async () => {
  const f = await fixture('no-change'); const summary = await run({ ...f.config, strategy: 'unchanged' });
  assert.match(summary, /^no-change:/); const state = State.parse(JSON.parse(await readFile(f.statePath, 'utf8'))); assert.equal(state.artifacts['1-patch'], undefined); assert.ok(state.artifacts['1-baseline-series']);
});
