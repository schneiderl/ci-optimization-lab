import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Manifest, Config, defaultObjective, Plan } from '../src/contracts/index.js';
import { atomic, command, digest, json } from '../src/util.js';

export async function fixture(id = 'test') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ci-lab-test-')), target = path.join(root, 'target'), data = path.join(root, 'data');
  await mkdir(path.join(target, 'ci'), { recursive: true }); await mkdir(path.join(target, '.github/workflows'), { recursive: true });
  const plan = Plan.parse({ schemaVersion: 1, cache: false, partitions: [['one', 'two']] });
  await writeFile(path.join(target, 'ci/plan.json'), JSON.stringify(plan) + '\n');
  const protectedFiles = { 'ci/case.json': digest('{}\n'), '.github/workflows/experiment.yml': digest('name: fixture\n'), 'test.ts': digest('assert(true);\n') };
  await writeFile(path.join(target, 'ci/case.json'), '{}\n'); await writeFile(path.join(target, '.github/workflows/experiment.yml'), 'name: fixture\n'); await writeFile(path.join(target, 'test.ts'), 'assert(true);\n');
  await command('git', ['init', '-b', 'main'], { cwd: target });
  await command('git', ['config', 'user.name', 'Fixture'], { cwd: target }); await command('git', ['config', 'user.email', 'fixture@example.test'], { cwd: target });
  await command('git', ['add', '.'], { cwd: target }); await command('git', ['commit', '-m', 'Frozen fixture'], { cwd: target });
  const baselineCommit = (await command('git', ['rev-parse', 'HEAD'], { cwd: target })).trim(), tests = { one: digest('one-output'), two: digest('two-output') };
  const manifest = Manifest.parse({ schemaVersion: 1, id, repository: 'example/target', baselineCommit, workflow: 'experiment.yml', runner: 'ubuntu-24.04', allowedFiles: ['ci/plan.json'], protectedFiles, tests, maxPartitions: 2, commands: ['npm ci --ignore-scripts', 'node ci/execute.ts'], fixtureDigest: digest(json({ baselineCommit, protectedFiles, tests })) });
  const manifestPath = path.join(root, 'manifest.json'); await atomic(manifestPath, json(manifest));
  const config = Config.parse({ schemaVersion: 1, runId: id, targetPath: target, manifestPath, dataRoot: data, strategy: 'agent', provider: 'recorded', model: 'fixture-v1', runner: 'recorded', group: 'warm', maxCycles: 1, timeoutSeconds: 30, objective: defaultObjective, cumulativeBudgetUsd: 30, perCallLimitUsd: 0, perExperimentLimitUsd: 1, maxConcurrency: 1 });
  return { root, target, data, manifest, config, plan, statePath: path.join(data, id, 'state.json') };
}
