import test from 'node:test';
import assert from 'node:assert/strict';
import { JevModel, OpenRouterFreeModel } from '../src/adapters/models/index.js';
import { Hypothesis } from '../src/contracts/index.js';

const input = { role: 'investigator' as const, context: { plan: { schemaVersion: 1, cache: false, partitions: [['one']] } }, schema: Hypothesis, instruction: 'Choose a bounded experiment.' };
test('Jev uses the direct Decisions API and validates typed answers and usage', async () => {
  let endpoint = '', request: any;
  const fetcher: typeof fetch = async (url, options) => { if (String(url).endsWith('/endpoints')) return new Response(JSON.stringify({ data: { context_length: 262144, endpoints: [{ pricing: { prompt: '0.000000042', completion: '0' } }] } })); endpoint = String(url); request = JSON.parse(String(options?.body)); return new Response(JSON.stringify({ id: 'decision', model: 'typesafe/jev-1.14', answers: { family: { type: 'choice', choice: 'cache', confidence: .9, probabilities: { cache: .9, none: .1 } } }, usage: { input_tokens: 100, output_tokens: 10, cost: .0001 } })); };
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
