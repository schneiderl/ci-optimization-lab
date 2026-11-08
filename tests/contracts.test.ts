import test from 'node:test';
import assert from 'node:assert/strict';
import { Envelope, Plan, Config, Manifest, State, defaultObjective } from '../src/contracts/index.js';
import { fixture } from './helpers.js';

test('strict contracts reject versions, extra execution fields, wrong identities and unsafe settings', async () => {
  assert.throws(() => Plan.parse({ schemaVersion: 2, cache: true, partitions: [['one']] }));
  assert.throws(() => Plan.parse({ schemaVersion: 1, cache: true, partitions: [['one']], command: 'skip tests' }));
  assert.throws(() => Envelope.parse({ schemaVersion: 1, runId: '../escape', stepId: 'edit', attemptId: 'one', inputs: [], outputs: [] }));
  const f = await fixture();
  assert.throws(() => Config.parse({ ...f.config, cumulativeBudgetUsd: 31 }));
  assert.throws(() => Config.parse({ ...f.config, objective: { ...defaultObjective, pairs: 3 } }));
  assert.throws(() => Manifest.parse({ ...f.manifest, allowedFiles: ['test.ts'] }));
  assert.throws(() => State.parse({ schemaVersion: 3 }));
});
