import path from 'node:path';
import { readFile, mkdir, cp } from 'node:fs/promises';
import { Config, defaultObjective, State } from '../src/contracts/index.js';
import { run } from '../src/coordinator/index.js';
import { atomic, command, json, digest, readJson, now, redact } from '../src/util.js';

const root = process.cwd(), dataRoot = path.resolve('../ci-lab-runs');
const bundle = path.resolve(process.argv.find(arg => arg.startsWith('--plan='))?.slice(7) ?? 'evaluation/live-plan.json');
const outputDirectory = path.dirname(bundle);
const evidenceDirectory = path.join(root, 'evidence', path.relative(path.join(root, 'evaluation'), outputDirectory));
if (path.relative(path.join(root, 'evaluation'), outputDirectory).startsWith('..')) throw new Error('PLAN_PATH: plan must be inside evaluation');
if (process.argv.includes('--init')) {
  const frozen = await readJson('evaluation/freeze.json') as any;
  const entries: any[] = [];
  for (const fixture of frozen.cases) for (const group of fixture.groups) for (const strategy of ['unchanged', 'rules', 'agent']) {
    const index = entries.length + 1;
    const config = Config.parse({ schemaVersion: 1, runId: `eval-${String(index).padStart(3, '0')}`, targetPath: path.resolve('../ci-lab-target-workloads'), manifestPath: path.resolve(fixture.manifest), dataRoot, strategy, provider: strategy === 'agent' ? 'jev-openrouter-free' : 'recorded', model: 'cohere/north-mini-code:free', runner: 'github', group, maxCycles: 1, timeoutSeconds: 1200, objective: defaultObjective, cumulativeBudgetUsd: 30, perCallLimitUsd: .02, perExperimentLimitUsd: 1, maxConcurrency: 4 });
    entries.push({ fixture: fixture.id, heldOut: fixture.heldOut, group, strategy, config });
  }
  await atomic(bundle, json({ schemaVersion: 1, frozenAt: now(), freezeDigest: digest(await readFile('evaluation/freeze.json')), concurrency: 4, providerSelection: 'OpenCode returned free-limit for two explicit free models. Explicit OpenRouter free model passed smoke; no paid fallback. Jev direct Decisions API passed smoke.', entries }));
  console.log(`Frozen ${entries.length} experiments in evaluation/live-plan.json`);
} else if (process.argv.includes('--live')) {
  const plan = await readJson(bundle) as any;
  const sourcePaths = (await command('git', ['ls-files', 'src', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json'])).trim().split('\n');
  if ((await command('git', ['diff', 'HEAD', '--', ...sourcePaths])).trim()) throw new Error('SOURCE_FREEZE: commit controller changes before live evaluation');
  const provenance = { schemaVersion: 1, capturedAt: now(), controllerSourceCommit: (await command('git', ['rev-parse', 'HEAD'])).trim(), controllerSourceTreeDigest: digest((await Promise.all(sourcePaths.map(async file => `${file}:${digest(await readFile(file))}`))).join('\n')), planDigest: digest(await readFile(bundle)) };
  if (plan.freezeDigest !== digest(await readFile('evaluation/freeze.json'))) throw new Error('FREEZE: evaluation fixtures changed');
  let cursor = 0;
  const selected = process.argv.find(arg => arg.startsWith('--only='))?.split('=')[1];
  const entries = selected ? plan.entries.filter((entry: any) => entry.config.runId === selected) : plan.entries;
  const worker = async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor++];
      console.log(`START ${entry.config.runId}: ${entry.fixture}/${entry.group}/${entry.strategy}`);
      try {
        const file = path.join(entry.config.dataRoot, entry.config.runId, 'controller-provenance.json');
        const prior = await readJson(file).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; }) as any;
        if (prior && (prior.controllerSourceTreeDigest !== provenance.controllerSourceTreeDigest || prior.planDigest !== provenance.planDigest)) throw new Error('SOURCE_FREEZE: resume controller or plan changed');
        if (!prior) await atomic(file, json(provenance));
        console.log(await run(entry.config));
      }
      catch (error) { console.error(`FAILED ${entry.config.runId}: ${redact(String(error))}`); }
      console.log(`END ${entry.config.runId}`);
    }
  };
  await Promise.all(Array.from({ length: plan.concurrency }, worker));
  await summarize(plan);
} else {
  await summarize(await readJson(bundle));
}
async function summarize(plan: any) {
  const results = [];
  for (const entry of plan.entries) {
    const directory = path.join(entry.config.dataRoot, entry.config.runId);
    try {
      const state = State.parse(await readJson(path.join(directory, 'state.json'))), report = await readJson(path.join(directory, 'report.json')) as any;
      const decision = Object.entries(report.artifacts).find(([key]) => key.endsWith('-acceptance'))?.[1] as any;
      const series = Object.entries(report.artifacts).find(([key]) => key.endsWith('-measurements') || key.endsWith('-baseline-series'))?.[1] as any;
      const observations = series?.observations ?? [];
      const profile = report.artifacts['1-baseline'];
      const destination = path.join(evidenceDirectory, entry.config.runId); await mkdir(destination, { recursive: true });
      for (const name of ['report.json', 'report.md', 'summary.txt', ...(state.artifacts['1-patch'] ? ['candidate.patch'] : [])]) await cp(path.join(directory, name), path.join(destination, name));
      await cp(path.join(directory, 'controller-provenance.json'), path.join(destination, 'controller-provenance.json')).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
      await cp(path.join(directory, 'artifacts'), path.join(destination, 'artifacts'), { recursive: true });
      await cp(path.join(directory, 'models'), path.join(destination, 'models'), { recursive: true }).catch(() => {});
      await cp(path.join(directory, 'dispatch'), path.join(destination, 'dispatch'), { recursive: true }).catch(() => {});
      results.push({ runId: entry.config.runId, fixture: entry.fixture, heldOut: entry.heldOut, group: entry.group, strategy: entry.strategy, outcome: state.status, decision: decision ?? null, modelCalls: state.models, observations: observations.length, correctness: report.artifacts['1-execution-validation'] ? report.artifacts['1-execution-validation'].every((check: any) => check.status === 'pass') : null, ciUrls: [profile?.url, ...observations.map((sample: any) => sample.url)].filter(Boolean), error: state.error });
    } catch (error) { results.push({ runId: entry.config.runId, fixture: entry.fixture, group: entry.group, strategy: entry.strategy, outcome: 'unavailable', error: String(error) }); }
  }
  await atomic(path.join(outputDirectory, 'results.json'), json({ schemaVersion: 1, generatedAt: now(), planDigest: digest(await readFile(bundle)), results }));
  const rows = results.map((result: any) => `| ${result.runId} | ${result.fixture} | ${result.group} | ${result.strategy} | ${result.outcome} | ${result.observations ?? 0} | ${result.decision?.primaryRatio?.toFixed(3) ?? '—'} | ${result.decision?.secondaryRatio?.toFixed(3) ?? '—'} |`);
  await atomic(path.join(outputDirectory, 'RESULTS.md'), '# Live evaluation\n\nFrozen plan: [live-plan.json](live-plan.json). Raw results: [results.json](results.json). Ratios below 1 favor the candidate. Acceptance requires both uncertainty bounds, preserved correctness, and reviewer approval. A no-change judgment does not prove optimality.\n\n| Run | Fixture | Cache group | Strategy | Outcome | Observations | Elapsed ratio | Job-seconds ratio |\n| --- | --- | --- | --- | --- | ---: | ---: | ---: |\n' + rows.join('\n') + '\n\nEach run has its patch, protected checks, raw observations, model usage, CI URLs, and limitations under the matching `evidence/` directory. Failed and inconclusive experiments remain in the results. Standard public runner compute is free; the shared ledger tracks actual model spend and conservative artifact-storage bounds. See [measurement rules](' + path.relative(outputDirectory, path.join(root, 'docs/measurement.md')) + ').\n');
  console.log(`Published ${results.length} result rows.`);
}
