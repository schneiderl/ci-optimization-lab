import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Plan, Validation, type CheckResult, type PipelinePlan, type Sample, type Workload } from '../../contracts/index.js';
import { command, digest } from '../../util.js';

export function validatePlan(plan: PipelinePlan, manifest: Workload): CheckResult {
  const ids = plan.partitions.flat(), expected = Object.keys(manifest.tests).sort();
  const checks = [
    { name: 'exact-test-inventory', pass: JSON.stringify([...ids].sort()) === JSON.stringify(expected) && new Set(ids).size === ids.length, reason: 'Every required test must appear exactly once.' },
    { name: 'partition-limit', pass: plan.partitions.length <= manifest.maxPartitions, reason: `At most ${manifest.maxPartitions} partitions are permitted.` },
  ];
  return Validation.parse({ status: checks.every(check => check.pass) ? 'pass' : 'fail', checks });
}
export async function validateCheckout(checkout: string, manifest: Workload): Promise<CheckResult> {
  const checks: CheckResult['checks'] = [];
  const tracked = (await command('git', ['ls-files', '-z'], { cwd: checkout })).split('\0').filter(Boolean);
  const expectedFiles = [...Object.keys(manifest.protectedFiles), ...manifest.allowedFiles].sort();
  const extra = (await command('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: checkout })).split('\0').filter(Boolean);
  checks.push({ name: 'full-file-inventory', pass: JSON.stringify(tracked.sort()) === JSON.stringify(expectedFiles) && extra.length === 0, reason: 'Tracked files must match the frozen inventory; untracked files are denied.' });
  for (const [file, expected] of Object.entries(manifest.protectedFiles)) {
    let pass = false;
    try { const stat = await lstat(path.join(checkout, file)); pass = stat.isFile() && stat.nlink === 1 && digest(await readFile(path.join(checkout, file))) === expected; } catch {}
    checks.push({ name: `protected-files:${file}`, pass, reason: 'Protected content and file type must match the pinned baseline.' });
  }
  const changed = (await command('git', ['diff', '--name-only', manifest.baselineCommit, '--'], { cwd: checkout })).trim().split('\n').filter(Boolean);
  const changes = (await command('git', ['diff', '--raw', manifest.baselineCommit, '--'], { cwd: checkout })).trim().split('\n').filter(Boolean);
  checks.push({ name: 'edit-allowlist', pass: changed.every(file => manifest.allowedFiles.includes(file as 'ci/plan.json')) && changes.every(line => line.startsWith(':100644 100644 ')), reason: 'Only content edits to ci/plan.json are allowed; mode changes are denied.' });
  try {
    const stat = await lstat(path.join(checkout, 'ci/plan.json'));
    checks.push({ name: 'regular-plan', pass: stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, reason: 'CI plan must be a regular file.' });
    checks.push(...validatePlan(Plan.parse(JSON.parse(await readFile(path.join(checkout, 'ci/plan.json'), 'utf8'))), manifest).checks);
  } catch { checks.push({ name: 'plan-schema', pass: false, reason: 'CI plan must match the strict v1 schema.' }); }
  return Validation.parse({ status: checks.every(check => check.pass) ? 'pass' : 'fail', checks });
}
export function validateExecution(observation: Sample, plan: PipelinePlan, manifest: Workload): CheckResult {
  const records = observation.execution, tests = records.flatMap(record => record.tests);
  const checks = [
    { name: 'successful-workflow', pass: observation.conclusion === 'success' && observation.jobs.every(job => job.conclusion === 'success' && job.runner === manifest.runner), reason: 'All jobs must succeed on the approved standard Linux runner.' },
    { name: 'single-attempt', pass: observation.attempt === 1, reason: 'Reruns are excluded from paired comparisons.' },
    { name: 'partition-coverage', pass: records.length === plan.partitions.length && new Set(records.map(record => record.partition)).size === records.length && records.every(record => JSON.stringify(record.tests.map(test => test.id).sort()) === JSON.stringify([...(plan.partitions[record.partition] ?? [])].sort())), reason: 'Every planned partition must execute exactly its assigned tests.' },
    { name: 'exact-test-inventory', pass: JSON.stringify(tests.map(test => test.id).sort()) === JSON.stringify(Object.keys(manifest.tests).sort()), reason: 'Collected reports must contain every protected test exactly once.' },
    { name: 'expected-outputs', pass: tests.every(test => test.output === manifest.tests[test.id] && test.status === 'pass'), reason: 'Output digests must match independently computed protected expectations.' },
    { name: 'execution-identity', pass: records.every(record => record.commit === observation.commit && record.runId === String(observation.runId) && record.planDigest === digest(JSON.stringify(plan) + '\n') && record.dependencyCheck), reason: 'Reports must identify the exact workflow run, commit, and plan.' },
    { name: 'cache-condition', pass: records.every(record => record.cacheKey === observation.cacheKey && record.cacheHit === observation.expectedCacheHit), reason: 'Cold keys must miss; warm cached candidates must hit. No cross-side keys.' },
  ];
  return Validation.parse({ status: checks.every(check => check.pass) ? 'pass' : 'fail', checks });
}
