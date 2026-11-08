import test from 'node:test';
import assert from 'node:assert/strict';
import { JevModel, OpenRouterFreeModel, invokeModel } from '../src/adapters/models/index.js';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Store, Budget } from '../src/adapters/records/store.js';
import { readJson } from '../src/util.js';
import { Hypothesis } from '../src/contracts/index.js';

const input = { role: 'investigator' as const, context: { plan: { schemaVersion: 1, cache: false, partitions: [['one']] } }, schema: Hypothesis, instruction: 'Choose a bounded experiment.' };
test('Jev uses the direct Decisions API and validates typed answers and usage', async () => {
  let endpoint = '', request: any;
  const fetcher: typeof fetch = async (url, options) => { if (String(url).endsWith('/endpoints')) return new Response(JSON.stringify({ data: { endpoints: [{ context_length: 262144, pricing: { prompt: '0.000000042', completion: '0' } }] } })); endpoint = String(url); request = JSON.parse(String(options?.body)); return new Response(JSON.stringify({ id: 'decision', model: 'typesafe/jev-1.14', answers: { family: { type: 'choice', choice: 'cache', confidence: .9, probabilities: { cache: .9, none: .1 } } }, usage: { input_tokens: 100, output_tokens: 10, cost: .0001 } })); };
  const result = await new JevModel(fetcher, async () => 'fixture-credential').call(input);
  assert.equal(endpoint, 'https://openrouter.ai/api/alpha/decisions'); assert.equal(request.model, 'typesafe/jev-1.14'); assert.equal(request.questions.family.type, 'choice'); assert.equal(Hypothesis.parse(result.output).family, 'cache');
  await assert.rejects(new JevModel(fetcher, async () => { throw new Error('AUTH_BLOCKED'); }).call(input), /AUTH/);
  await assert.rejects(new JevModel(async () => new Response('{}'), async () => 'fixture').call(input));
  await assert.rejects(new JevModel(fetcher, async () => 'fixture').call({ ...input, role: 'editor' }), /CAPABILITY/);
});
test('free generative adapter refuses paid metadata before retrieving credentials', async () => {
  let credentials = 0;
  const model = new OpenRouterFreeModel('example/model:free', async () => new Response(JSON.stringify({ data: [{ id: 'example/model:free', pricing: { prompt: '1', completion: '0' } }] })), async () => { credentials++; return 'fixture'; });
  await assert.rejects(model.call(input), /zero price/); assert.equal(credentials, 0);
  assert.throws(() => new OpenRouterFreeModel('openrouter/free'), /specific free model/);
});

test('Jev bounds each provider endpoint independently and refuses missing or excessive context pricing before credentials', async () => {
  for (const endpoints of [
    [{ pricing: { prompt: '0.000000042', completion: '0' } }],
    [{ context_length: 262144, pricing: { prompt: '0.000000042', completion: '0' } }, { context_length: 1000000, pricing: { prompt: '0.000000042', completion: '0' } }],
    [{ context_length: 262144, pricing: { prompt: '0.000000042', completion: '0', request: '0.01' } }],
    [{ context_length: 262144, pricing: { prompt: '0.000000042', completion: '0.1' } }]
  ]) {
    let credentials = 0;
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ data: { context_length: 1, endpoints } }));
    await assert.rejects(new JevModel(fetcher, async () => { credentials++; return 'synthetic'; }).call(input));
    assert.equal(credentials, 0);
  }
});

test('free generation disables optional reasoning and requests advertised strict schema without accepting truncation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ci-free-structured-')), store = new Store(path.join(root, 'run')), budget = new Budget(root);
  let request: any;
  const fetcher: typeof fetch = async (url, options) => {
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'fixture/structured:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['reasoning', 'structured_outputs'], reasoning: { mandatory: false } }] }));
    request = JSON.parse(String(options?.body));
    return new Response(JSON.stringify({ model: 'fixture/structured', usage: { prompt_tokens: 20, completion_tokens: 3000, cost: 0 }, choices: [{ message: { content: null, reasoning: 'Synthetic reasoning only' }, finish_reason: 'length' }] }));
  };
  await assert.rejects(invokeModel(store, budget, 'truncated', new OpenRouterFreeModel('fixture/structured:free', fetcher, async () => 'synthetic'), input));
  assert.deepEqual(request.reasoning, { enabled: false });
  assert.equal(request.response_format.type, 'json_schema'); assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(request.response_format.json_schema.schema.additionalProperties, false);
  assert.equal(request.provider.allow_fallbacks, false);
  const receipt = await readJson(path.join(store.root, 'models/truncated.json')) as any;
  assert.equal(receipt.status, 'invalid-output'); assert.equal(receipt.usage.outputTokens, 3000); assert.equal(receipt.usage.costUsd, 0);
  assert.equal(receipt.output.invalidProviderOutput.choices[0].finish_reason, 'length');
});
