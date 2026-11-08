import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { Config, State, Manifest, Observation, Plan, Patch, Acceptance } from '../src/contracts/index.js';
import { Store } from '../src/adapters/records/store.js';
import { validateCheckout, validateExecution } from '../src/blocks/validator/index.js';
import { pairedLogT95 } from '../src/objectives/index.js';
import { atomic, command, digest, json, now, readJson } from '../src/util.js';

const bundle = path.resolve(process.argv.find(arg => arg.startsWith('--plan='))?.slice(7) ?? 'evaluation/live-plan.json');
const output = path.join(path.dirname(bundle), 'revalidation.json');
const plan = await readJson(bundle) as any;
const source = (await command('git', ['rev-parse', 'HEAD'])).trim(), results = [];
for (const entry of plan.entries) {
  const config = Config.parse(entry.config), store = new Store(path.join(config.dataRoot, config.runId));
  const state = State.parse(await readJson(path.join(store.root, 'state.json'))), manifest = Manifest.parse(await readJson(config.manifestPath));
  if (state.configDigest !== digest(json(config)) || state.manifestDigest !== digest(json(manifest))) throw new Error(`INPUT_PIN_MISMATCH: ${config.runId}`);
  const artifacts: Record<string, any> = {};
  for (const [name, ref] of Object.entries(state.artifacts)) artifacts[name] = await store.get(ref, z.unknown());
  const baseline = Plan.parse(JSON.parse(await command('git', ['show', `${manifest.baselineCommit}:ci/plan.json`], { cwd: config.targetPath })));
  const patch = artifacts['1-patch'] ? Patch.parse(artifacts['1-patch']) : null;
  const candidate = patch ? Plan.parse(JSON.parse(await command('git', ['show', `${patch.candidateCommit}:ci/plan.json`], { cwd: config.targetPath }))) : baseline;
  if (patch && digest(patch.text) !== patch.digest) throw new Error(`PATCH_DIGEST: ${config.runId}`);
  const protectedChecks = [await validateCheckout(path.join(store.root, 'checkouts/baseline'), manifest)];
  if (patch) protectedChecks.push(await validateCheckout(path.join(store.root, 'checkouts/candidate-1'), manifest));
  const profile = artifacts['1-baseline'] ? Observation.parse(artifacts['1-baseline']) : null;
  const series = artifacts['1-measurements'] ?? artifacts['1-baseline-series'];
  const observations = (series?.observations ?? []).map((value: unknown) => Observation.parse(value));
  const primes = (series?.primes ?? []).map((value: unknown) => Observation.parse(value));
  const checks = [...primes, ...observations].map(sample => validateExecution(sample, sample.side === 'baseline' ? baseline : candidate, manifest));
  if (profile) checks.push(validateExecution(profile, baseline, manifest));
  const decision = patch && observations.length ? pairedLogT95(observations, config.objective, checks) : null;
  const original = artifacts['1-acceptance'] ? Acceptance.parse(artifacts['1-acceptance']) : null;
  const stable = !original || decision?.status === original.status && decision?.primaryRatio === original.primaryRatio && decision?.secondaryRatio === original.secondaryRatio;
  const pass = protectedChecks.every(check => check.status === 'pass') && checks.every(check => check.status === 'pass') && stable;
  results.push({ runId: config.runId, originalOutcome: state.status, artifactsVerified: Object.keys(artifacts).length, observationCount: checks.length, pass, protectedChecks, executionChecks: checks, originalAcceptance: original, revalidatedAcceptance: decision, outcomeUnchanged: stable, originalError: state.error });
}
await atomic(output, json({ schemaVersion: 1, checkedAt: now(), validatorSourceCommit: source, validatorSourceTreeDigest: digest((await Promise.all(['src/adapters/github/index.ts', 'src/objectives/index.ts', 'src/blocks/validator/index.ts'].map(file => readFile(file)))).map(digest).join('\n')), controllerProvenance: await Promise.all(plan.entries.map(async (entry: any) => ({ runId: entry.config.runId, provenance: await readJson(path.join(entry.config.dataRoot, entry.config.runId, 'controller-provenance.json')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; }) }))), originalSourceProvenance: 'Original reports were collected during implementation up to the first source freeze 48b4fd5. Exact per-dispatch coordinator source was not recorded. Target workflow/test code and target commits are pinned in every run. This audit uses the current validator without new CI or model calls.', results }));
if (results.some(result => !result.pass)) { console.error('Revalidation found a mismatch; see evaluation/revalidation.json.'); process.exitCode = 1; }
else console.log(`Revalidated ${results.length} runs and ${results.reduce((sum, result) => sum + result.observationCount, 0)} observations; all protected checks pass and outcomes are unchanged. No dispatches or model calls.`);
