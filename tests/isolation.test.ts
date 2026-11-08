import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, symlink, unlink, link } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers.js';
import { ScopedFiles } from '../src/blocks/editor/tools.js';
import { validateCheckout, validatePlan, validateExecution } from '../src/blocks/validator/index.js';
import { RecordedRunner } from '../src/blocks/runner/index.js';
import { separate, digest } from '../src/util.js';

test('scoped tools reject traversal, protected writes, symlinks, hard links and executable CI payloads', async () => {
  const f = await fixture(), tools = new ScopedFiles(f.target, f.manifest);
  await assert.rejects(tools.read('../manifest.json'), /SCOPE/);
  await assert.rejects(tools.write('test.ts', 'skip'), /protected/);
  await assert.rejects(tools.write('ci/plan.json', '{"schemaVersion":1,"cache":true,"partitions":[["one"]],"run":"true"}'));
  await unlink(path.join(f.target, 'ci/plan.json')); await symlink(path.join(f.root, 'manifest.json'), path.join(f.target, 'ci/plan.json'));
  await assert.rejects(tools.read('ci/plan.json'), /symlink/);
  await unlink(path.join(f.target, 'ci/plan.json')); await link(path.join(f.target, 'ci/case.json'), path.join(f.target, 'ci/plan.json'));
  await assert.rejects(tools.write('ci/plan.json', JSON.stringify(f.plan)), /hard link/);
});
test('full diff and protected digests reject test changes, missing tests and duplicated partitions', async () => {
  const f = await fixture(); assert.equal((await validateCheckout(f.target, f.manifest)).status, 'pass');
  assert.equal(validatePlan({ ...f.plan, partitions: [['one']] }, f.manifest).status, 'fail');
  assert.equal(validatePlan({ ...f.plan, partitions: [['one'], ['one', 'two']] }, f.manifest).status, 'fail');
  await writeFile(path.join(f.target, 'test.ts'), 'assert(false);'); assert.equal((await validateCheckout(f.target, f.manifest)).status, 'fail');
});
test('separation follows real paths and denies targets inside lab or data', async () => {
  const f = await fixture(); await assert.rejects(separate(f.root, f.target, f.data), /ISOLATION/);
  await assert.rejects(separate(process.cwd(), f.target, path.join(f.target, 'data')), /ISOLATION/);
});
test('green pipeline claims cannot omit tests, alter outputs or mix cache conditions', async () => {
  const f = await fixture(), sample = await new RecordedRunner(f.manifest).execute({ correlation: 'x', commit: f.manifest.baselineCommit, ref: 'lab/x', pair: 0, side: 'baseline', group: 'cold', cacheKey: 'isolated', expectedCacheHit: false, patchDigest: digest('patch') }, f.plan);
  assert.equal(validateExecution(sample, f.plan, f.manifest).status, 'pass');
  const missing = structuredClone(sample); missing.execution[0]!.tests.pop(); assert.equal(validateExecution(missing, f.plan, f.manifest).status, 'fail');
  const wrong = structuredClone(sample); wrong.execution[0]!.tests[0]!.output = digest('wrong'); assert.equal(validateExecution(wrong, f.plan, f.manifest).status, 'fail');
  const warm = structuredClone(sample); warm.execution[0]!.cacheHit = true; assert.equal(validateExecution(warm, f.plan, f.manifest).status, 'fail');
});
