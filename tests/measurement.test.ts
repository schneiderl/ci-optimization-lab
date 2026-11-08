import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
import { RecordedRunner, measure } from '../src/blocks/runner/index.js';
import { defaultObjective } from '../src/contracts/index.js';
import { pairedLogT95 } from '../src/objectives/index.js';
import { validateExecution } from '../src/blocks/validator/index.js';
import { digest } from '../src/util.js';

test('five pairs use alternating order, separate side keys and verified warm primes', async () => {
  const f = await fixture(), candidate = { ...f.plan, cache: true }, runner = new RecordedRunner(f.manifest);
  const measured = await measure(f.config, 1, f.manifest.baselineCommit, 'a'.repeat(40), digest('patch'), f.plan, candidate, runner);
  assert.equal(measured.primes.length, 1); assert.equal(measured.primes[0]!.expectedCacheHit, false);
  assert.deepEqual(measured.observations.slice(0, 4).map(sample => sample.side), ['baseline', 'candidate', 'candidate', 'baseline']);
  const checks = measured.observations.map(sample => validateExecution(sample, sample.side === 'baseline' ? f.plan : candidate, f.manifest));
  assert.equal(pairedLogT95(measured.observations, defaultObjective, checks).status, 'accepted');
  assert.equal(pairedLogT95(measured.observations.slice(1), defaultObjective, checks).status, 'inconclusive');
  const cold = await measure({ ...f.config, group: 'cold' }, 1, f.manifest.baselineCommit, 'a'.repeat(40), digest('patch'), f.plan, candidate, runner);
  assert.equal(cold.primes.length, 0); assert.equal(new Set(cold.observations.map(sample => sample.cacheKey)).size, 10); assert.ok(cold.observations.every(sample => !sample.expectedCacheHit));
});
test('noise, compute regression, failed correctness and mixed groups never pass acceptance', async () => {
  const f = await fixture(), measured = await measure(f.config, 1, f.manifest.baselineCommit, 'a'.repeat(40), digest('patch'), f.plan, { ...f.plan, cache: true }, new RecordedRunner(f.manifest));
  const pass = Array.from({ length: 10 }, () => ({ status: 'pass' as const, checks: [{ name: 'all', pass: true, reason: 'verified' }] }));
  const noisy = structuredClone(measured.observations), ratios = [.5, .7, .8, .95, 1.05];
  for (const sample of noisy) if (sample.side === 'candidate') sample.elapsedSeconds = 100 * ratios[sample.pair]!;
  assert.equal(pairedLogT95(noisy, defaultObjective, pass).status, 'inconclusive');
  const regressed = structuredClone(measured.observations); for (const sample of regressed) if (sample.side === 'candidate') sample.jobSeconds = 120;
  assert.equal(pairedLogT95(regressed, defaultObjective, pass).status, 'rejected');
  assert.equal(pairedLogT95(measured.observations, defaultObjective, [{ status: 'fail', checks: [{ name: 'missing', pass: false, reason: 'missing test' }] }]).status, 'rejected');
  const mixed = structuredClone(measured.observations); mixed[0]!.group = 'cold'; assert.equal(pairedLogT95(mixed, defaultObjective, pass).status, 'inconclusive');
});
