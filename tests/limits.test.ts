import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { slot } from '../src/adapters/records/concurrency.js';
import { fixture } from './helpers.js';
import { run } from '../src/coordinator/index.js';
import { RecordedModel } from '../src/adapters/models/index.js';
import { RecordedRunner } from '../src/blocks/runner/index.js';
import { State } from '../src/contracts/index.js';
import { command } from '../src/util.js';

test('shared CI slots enforce the configured limit and cancellation interrupts waiting', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ci-lab-slots-')), release = await slot(root, 'one', 1);
  const abort = new AbortController(), second = slot(root, 'two', 1, abort.signal); abort.abort(); await assert.rejects(second, /CANCELLED/); await release();
  const next = await slot(root, 'three', 1); await next();
});
test('cycles stay bounded and a reviewer cannot rescue invalid candidates', async () => {
  const f = await fixture('cycles');
  const summary = await run({ ...f.config, maxCycles: 3 }, { model: (role, defaults) => new RecordedModel({ ...defaults, ...(role === 'editor' ? { editor: { files: [{ path: 'ci/plan.json', content: JSON.stringify({ schemaVersion: 1, cache: true, partitions: [['one']] }) }], explanation: 'Invalid inventory.' } } : {}), ...(role === 'reviewer' ? { reviewer: { recommendation: 'approve', concerns: [], explanation: 'Request another bounded experiment.', evidence: ['validation'], requestExperiment: true } } : {}) }) });
  assert.match(summary, /^rejected:/); const state = State.parse(JSON.parse(await readFile(f.statePath, 'utf8'))); assert.equal(state.cycle, 3); assert.equal(state.models.length, 9);
});
test('cancellation marker aborts an active runner and persists cancelled state', async () => {
  const f = await fixture('cancelled');
  const runner = { async execute(..._args: Parameters<RecordedRunner['execute']>) { await writeFile(path.join(f.data, 'cancelled/cancel'), 'requested'); await new Promise(resolve => setTimeout(resolve, 20)); return new RecordedRunner(f.manifest).execute(..._args); } };
  await assert.rejects(run(f.config, { runner }), /CANCELLED/); const state = State.parse(JSON.parse(await readFile(f.statePath, 'utf8'))); assert.equal(state.status, 'cancelled');
});
test('command output waits for stdout closure', async () => {
  const output = await command(process.execPath, ['-e', 'process.stdout.write("x".repeat(1000000)+"END")']); assert.equal(output.length, 1000003); assert.ok(output.endsWith('END'));
});
