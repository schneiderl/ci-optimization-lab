import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { pbkdf2Sync, createHash } from 'node:crypto';
import { Manifest } from '../src/contracts/index.js';
import { command, digest, json, atomic, now } from '../src/util.js';

const root = process.cwd(), target = path.resolve(root, '../ci-lab-target-workloads');
try { await access(path.join(target, '.git')); throw new Error('Target exists; frozen fixtures are never regenerated implicitly.'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
await mkdir(target, { recursive: true });
await command('git', ['init', '-b', 'main'], { cwd: target });
const files: Record<string, string> = {
  'package.json': json({ name: 'ci-lab-target-workloads', version: '1.0.0', private: true, type: 'module', engines: { node: '>=24' }, scripts: { test: 'node ci/local.ts' }, dependencies: { typescript: '7.0.2', yaml: '2.9.1', zod: '4.6.7' } }),
  '.gitignore': 'node_modules/\n.npm/\nexecution.json\n',
  'src/derive.ts': `import { pbkdf2Sync } from 'node:crypto';
export function derive(id: string, iterations: number): string {
  return pbkdf2Sync('ci-lab:' + id, 'frozen-workload-v1', iterations, 32, 'sha256').toString('hex');
}
`,
  'tests/inventory.ts': `import assert from 'node:assert/strict';
import { derive } from '../src/derive.ts';
export function execute(id: string, iterations: number, expected: string): string {
  const actual = derive(id, iterations);
  assert.equal(actual, expected, 'deterministic application output');
  assert.match(actual, /^[a-f0-9]{64}$/);
  assert.equal(derive(id + '-check', 1).length, 64);
  return actual;
}
`,
  'ci/requirements.ts': `import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { z } from 'zod';
export const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const fixture = JSON.parse(readFileSync('ci/case.json', 'utf8'));
export const plan = z.object({schemaVersion:z.literal(1),cache:z.boolean(),partitions:z.array(z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1)).min(1).max(4)}).strict().parse(JSON.parse(readFileSync('ci/plan.json','utf8')));
assert.ok(plan.partitions.length <= fixture.maxPartitions);
assert.deepEqual(plan.partitions.flat().sort(), Object.keys(fixture.tests).sort());
assert.equal(new Set(plan.partitions.flat()).size, Object.keys(fixture.tests).length);
export const planDigest = sha(JSON.stringify(plan) + '\\n');
`,
  'ci/matrix.ts': `import { appendFileSync } from 'node:fs';
import { plan } from './requirements.ts';
const output = 'matrix=' + JSON.stringify({partition:plan.partitions.map((_, i) => i)}) + '\\ncache=' + plan.cache + '\\n';
if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT required');
appendFileSync(process.env.GITHUB_OUTPUT, output);
`,
  'ci/execute.ts': `import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fixture, plan, planDigest, sha } from './requirements.ts';
import { execute } from '../tests/inventory.ts';
import YAML from 'yaml';
assert.equal(YAML.parse('ready: true').ready, true);
execFileSync('npm', ['ls','--all','--json'], {stdio:'pipe'});
const partition = Number(process.env.PARTITION);
assert.ok(Number.isInteger(partition) && partition >= 0 && partition < plan.partitions.length);
const tests = plan.partitions[partition]!.map(id => ({id, output:sha(execute(id, fixture.iterations, fixture.tests[id])),status:'pass'}));
const record = {schemaVersion:1,runId:process.env.GITHUB_RUN_ID ?? 'local',commit:process.env.GITHUB_SHA ?? 'local',planDigest,cacheKey:process.env.CACHE_KEY ?? 'local',cacheHit:process.env.CACHE_HIT === 'true',partition,node:process.version,tests,dependencyCheck:true};
writeFileSync('execution.json', JSON.stringify(record) + '\\n');
console.log(JSON.stringify({partition,executed:tests.map(test=>test.id),planDigest}));
`,
  'ci/local.ts': `import { fixture, plan } from './requirements.ts';
import { execute } from '../tests/inventory.ts';
for (const id of plan.partitions.flat()) execute(id, fixture.iterations, fixture.tests[id]);
console.log('Passed ' + Object.keys(fixture.tests).length + ' protected tests.');
`,
  'README.md': '# CI lab target workloads\n\nControlled TypeScript workloads for [ci-optimization-lab](https://github.com/schneiderl/ci-optimization-lab). Baseline commits are pinned in the lab manifests. Only `ci/plan.json` may change during an experiment.\n\nRun `npm ci --ignore-scripts && npm test` with Node 24. Workflow dispatch uses standard public Ubuntu runners, read-only repository permissions, and no repository secrets. Test code, dependency locks, execution reporting, and workflow commands remain protected. CI plans control dependency reuse and assignment of the complete existing test inventory.\n\nThe PBKDF2 workload represents deterministic CPU work; it is a controlled benchmark, not a production service. Results may show startup overhead or cache variance outweighing benefits.\n',
  '.github/workflows/experiment.yml': `name: Controlled experiment
run-name: \${{ inputs.correlation }}
on:
  workflow_dispatch:
    inputs:
      correlation:
        required: true
        type: string
      cache_key:
        required: true
        type: string
permissions:
  contents: read
jobs:
  plan:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    outputs:
      matrix: \${{ steps.plan.outputs.matrix }}
      cache: \${{ steps.plan.outputs.cache }}
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
        with:
          persist-credentials: false
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
        with:
          node-version: '24'
      - run: npm ci --ignore-scripts
      - id: plan
        run: node ci/matrix.ts
  tests:
    needs: plan
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    strategy:
      fail-fast: false
      max-parallel: 4
      matrix: \${{ fromJSON(needs.plan.outputs.matrix) }}
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
        with:
          persist-credentials: false
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
        with:
          node-version: '24'
      - id: dependencies
        if: needs.plan.outputs.cache == 'true'
        uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830
        with:
          path: node_modules
          key: deps-\${{ inputs.cache_key }}-\${{ matrix.partition }}-\${{ hashFiles('package-lock.json') }}
      - if: steps.dependencies.outputs.cache-hit != 'true'
        run: npm ci --ignore-scripts
      - run: node ci/execute.ts
        env:
          PARTITION: \${{ matrix.partition }}
          CACHE_KEY: \${{ inputs.cache_key }}
          CACHE_HIT: \${{ steps.dependencies.outputs.cache-hit }}
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
        with:
          name: execution-\${{ matrix.partition }}
          path: execution.json
          retention-days: 1
          if-no-files-found: error
`,
  '.github/workflows/verify.yml': `name: Verify protected workload
on: [push, pull_request]
permissions:
  contents: read
jobs:
  verify:
    if: github.event_name == 'pull_request' || github.ref == 'refs/heads/main'
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
        with:
          persist-credentials: false
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
        with:
          node-version: '24'
      - run: npm ci --ignore-scripts
      - run: npm test
`,
};
for (const [file, content] of Object.entries(files)) { await mkdir(path.dirname(path.join(target, file)), { recursive: true }); await writeFile(path.join(target, file), content); }
await command('npm', ['install', '--package-lock-only', '--ignore-scripts'], { cwd: target });
const cases = [
  { id: 'cache', count: 8, iterations: 50000, cache: false, maxPartitions: 1, heldOut: false },
  { id: 'partition', count: 24, iterations: 1000000, cache: true, maxPartitions: 2, heldOut: false },
  { id: 'no-change', count: 1, iterations: 5000, cache: true, maxPartitions: 1, heldOut: false },
  { id: 'cache-heldout', count: 13, iterations: 80000, cache: false, maxPartitions: 1, heldOut: true },
  { id: 'partition-heldout', count: 31, iterations: 700000, cache: true, maxPartitions: 2, heldOut: true },
];
const frozen: unknown[] = [];
for (const fixture of cases) {
  const tests: Record<string, string> = {};
  for (let index = 0; index < fixture.count; index++) { const id = `case-${String(index).padStart(3, '0')}`; tests[id] = pbkdf2Sync('ci-lab:' + id, 'frozen-workload-v1', fixture.iterations, 32, 'sha256').toString('hex'); }
  await writeFile(path.join(target, 'ci/case.json'), json({ id: fixture.id, iterations: fixture.iterations, tests, maxPartitions: fixture.maxPartitions }));
  await writeFile(path.join(target, 'ci/plan.json'), JSON.stringify({ schemaVersion: 1, cache: fixture.cache, partitions: [Object.keys(tests)] }) + '\n');
  await command('git', ['add', '.'], { cwd: target }); await command('git', ['commit', '-m', `Freeze ${fixture.id} workload`], { cwd: target });
  const baselineCommit = (await command('git', ['rev-parse', 'HEAD'], { cwd: target })).trim();
  await command('git', ['branch', `baseline/${fixture.id}`], { cwd: target });
  const protectedFiles: Record<string, string> = {};
  for (const file of (await command('git', ['ls-files', '-z'], { cwd: target })).split('\0').filter(Boolean)) if (file !== 'ci/plan.json') protectedFiles[file] = digest(await (await import('node:fs/promises')).readFile(path.join(target, file)));
  const outputs = Object.fromEntries(Object.entries(tests).map(([id, value]) => [id, digest(value)]));
  const fixtureDigest = digest(json({ baselineCommit, protectedFiles, tests: outputs }));
  const manifest = Manifest.parse({ schemaVersion: 1, id: fixture.id, repository: 'schneiderl/ci-lab-target-workloads', baselineCommit, workflow: 'experiment.yml', runner: 'ubuntu-24.04', allowedFiles: ['ci/plan.json'], protectedFiles, tests: outputs, maxPartitions: fixture.maxPartitions, commands: ['npm ci --ignore-scripts', 'node ci/execute.ts'], fixtureDigest });
  await atomic(path.join(root, 'manifests', `${fixture.id}.json`), json(manifest));
  frozen.push({ id: fixture.id, heldOut: fixture.heldOut, manifest: `manifests/${fixture.id}.json`, manifestDigest: digest(json(manifest)), baselineCommit, groups: fixture.id.startsWith('cache') ? ['cold', 'warm'] : ['warm'] });
}
await atomic(path.join(root, 'evaluation/freeze.json'), json({ schemaVersion: 1, frozenAt: now(), prompts: { investigator: digest((await import('../src/blocks/investigator/index.js')).investigatorInstruction) }, acceptance: 'paired-log-t95-v1', thresholds: { primary: .10, secondary: .05, pairs: 5 }, rules: 'enable-cache-else-two-partitions-v1', cases: frozen, note: 'Held-out fixtures frozen before model calls or evaluation. Sole implementer knows the variants; models receive no evaluation labels or expected fixes. No prompt tuning after this freeze.' }));
console.log(json({ target, cases: cases.map(fixture => fixture.id), freeze: 'evaluation/freeze.json' }));
