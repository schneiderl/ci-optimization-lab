import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { fixture } from './helpers.js';
import { Store, Budget } from '../src/adapters/records/store.js';
import { invokeModel, RecordedModel, OpenCodeModel } from '../src/adapters/models/index.js';
import { Hypothesis } from '../src/contracts/index.js';

test('artifacts verify digests and run lock excludes concurrent writers', async () => {
  const f = await fixture(), store = new Store(f.data), release = await store.lock();
  await assert.rejects(store.lock(), /LOCKED/); await release();
  const ref = await store.put('one', { value: 42 }); assert.deepEqual(await store.get(ref, z.object({ value: z.number() })), { value: 42 });
  await writeFile(path.join(store.root, ref.path), '{}\n'); await assert.rejects(store.get(ref, z.unknown()), /digest/);
});
test('cumulative budget reserves before work, preserves unknown charges and rejects unknown or excessive prices', async () => {
  const f = await fixture(), a = new Budget(f.data, .03), b = new Budget(f.data, .03);
  await a.reserve('one', .02, 'bounded'); await assert.rejects(b.reserve('two', .02, 'bounded'), /EXHAUSTED/);
  await assert.rejects(a.reserve('unknown', NaN, '?'), /UNKNOWN/); await a.settle('one', .001); await b.reserve('two', .02, 'bounded');
  await assert.rejects(a.settle('two', .03), /exceeds/);
});
test('completed model calls replay, changed requests fail, interrupted calls never silently retry', async () => {
  const f = await fixture(), store = new Store(f.data), budget = new Budget(f.data);
  let calls = 0;
  class Counting extends RecordedModel { override async call(input: Parameters<RecordedModel['call']>[0]) { calls++; return super.call(input); } }
  const model = new Counting({ investigator: { decision: 'no-change', family: 'none', explanation: 'No justified change.', plan: null, evidence: ['snapshot'] } });
  const input = { role: 'investigator' as const, context: {}, schema: Hypothesis, instruction: 'test' };
  await invokeModel(store, budget, 'once', model, input); await invokeModel(store, budget, 'once', model, input); assert.equal(calls, 1);
  await assert.rejects(invokeModel(store, budget, 'once', model, { ...input, context: { changed: true } }), /changed/);
  const saved = JSON.parse(await readFile(path.join(f.data, 'models/once.json'), 'utf8')); saved.status = 'calling'; await writeFile(path.join(f.data, 'models/once.json'), JSON.stringify(saved));
  await assert.rejects(invokeModel(store, budget, 'once', model, input), /AMBIGUOUS/); assert.equal(calls, 1);
  assert.throws(() => new OpenCodeModel('paid/provider'), /MODEL_POLICY/);
});
