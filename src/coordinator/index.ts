import { mkdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { watch } from 'node:fs';
import { z } from 'zod';
import { Acceptance, Config, Edit, Hypothesis, InvestigatorInput, Manifest, Observation, Patch, Plan, Review, State, Validation, type ModelUsage, type Outcome, type RunConfig, type RunState } from '../contracts/index.js';
import { Store, Budget } from '../adapters/records/store.js';
import { RecordedModel, OpenCodeModel, OpenRouterFreeModel, JevModel, type ModelAdapter } from '../adapters/models/index.js';
import { GhTransport, GitHubRunner } from '../adapters/github/index.js';
import { investigate, rulesHypothesis } from '../blocks/investigator/index.js';
import { edit } from '../blocks/editor/index.js';
import { ScopedFiles } from '../blocks/editor/tools.js';
import { review } from '../blocks/reviewer/index.js';
import { measure, RecordedRunner, type Runner } from '../blocks/runner/index.js';
import { validateCheckout, validateExecution } from '../blocks/validator/index.js';
import { report } from '../blocks/reporter/index.js';
import { acceptanceRules } from '../objectives/index.js';
import { atomic, command, digest, json, now, readJson, redact, separate } from '../util.js';

const terminal = new Set<Outcome>(['accepted', 'no-change', 'rejected', 'inconclusive', 'cancelled']);
export const steps = ['baselining', 'investigating', 'editing', 'validating', 'measuring', 'reviewing'] as const;
export type ExtensionStep = (context: { config: RunConfig; state: RunState; store: Store }) => Promise<void>;
export const extensions = new Map<string, ExtensionStep>();
export interface Dependencies { model?: (role: 'investigator' | 'editor' | 'reviewer', defaults: Record<string, unknown>) => ModelAdapter; runner?: Runner; afterSave?: (state: RunState) => void }
export async function run(rawConfig: unknown, dependencies: Dependencies = {}, signal?: AbortSignal): Promise<string> {
  const config = Config.parse(rawConfig), lab = fileURLToPath(new URL('../../', import.meta.url));
  await separate(lab, config.targetPath, config.dataRoot);
  const manifest = Manifest.parse(await readJson(config.manifestPath));
  if (digest(json({ baselineCommit: manifest.baselineCommit, protectedFiles: manifest.protectedFiles, tests: manifest.tests })) !== manifest.fixtureDigest) throw new Error('MANIFEST: frozen fixture digest mismatch');
  const rule = acceptanceRules.get(config.objective.acceptanceRule); if (!rule) throw new Error('OBJECTIVE: unknown acceptance rule');
  const store = new Store(path.join(config.dataRoot, config.runId)), budget = new Budget(config.dataRoot, config.cumulativeBudgetUsd), unlock = await store.lock();
  const cancellation = new AbortController();
  const watcher = watch(store.root, (_event, file) => { if (String(file) === 'cancel') cancellation.abort(); });
  signal = signal ? AbortSignal.any([signal, cancellation.signal]) : cancellation.signal;
  let state: RunState | null = null;
  const configDigest = digest(json(config)), manifestDigest = digest(json(manifest));
  try {
    state = await store.load();
    if (!state) {
      state = State.parse({ schemaVersion: 1, runId: config.runId, configDigest, manifestDigest, status: 'created', cycle: 0, sequence: 0, artifacts: {}, models: [], error: null, updatedAt: now() });
      await atomic(path.join(store.root, 'config.json'), json(config)); await atomic(path.join(store.root, 'manifest.json'), json(manifest)); await store.save(state);
    }
    if (state.configDigest !== configDigest || state.manifestDigest !== manifestDigest) throw new Error('VERSION_OR_INPUT_MISMATCH: resume requires the exact saved configuration and protected manifest');
    if (terminal.has(state.status)) return report(store, state, config, budget);
    const save = async (status: Outcome) => { await access(path.join(store.root, 'cancel')).then(() => { throw new Error('CANCELLED'); }, () => {}); if (signal?.aborted) throw new Error('CANCELLED'); await store.save(state!, status); dependencies.afterSave?.(state!); };
    state.error = null;
    const baselineCheckout = path.join(store.root, 'checkouts', 'baseline');
    await checkout(config.targetPath, baselineCheckout, manifest.baselineCommit);
    const baselineValidation = await validateCheckout(baselineCheckout, manifest); if (baselineValidation.status !== 'pass') throw new Error(`BASELINE_INVALID: ${JSON.stringify(baselineValidation.checks.filter(check => !check.pass))}`);
    const baseline = Plan.parse(await readJson(path.join(baselineCheckout, 'ci/plan.json')));
    const runner = dependencies.runner ?? (config.runner === 'github' ? new GitHubRunner(new GhTransport(), store, budget, manifest, config.timeoutSeconds, 10000, config.maxConcurrency) : new RecordedRunner(manifest));
    if (config.runner === 'github') {
      const worstRuns = config.maxCycles * 13;
      if (worstRuns * .001 > config.perExperimentLimitUsd) throw new Error('EXPERIMENT_BUDGET: bounded batch exceeds per-experiment limit');
      const ledger = await budget.snapshot(), used = Object.values(ledger.entries).reduce((sum, entry) => sum + (entry.chargedUpperBoundUsd ?? entry.reservedUsd), 0);
      if (used + worstRuns * .001 > ledger.ceilingUsd) throw new Error('BUDGET_EXHAUSTED: remaining budget cannot cover the bounded batch');
    }
    const previous: z.infer<typeof InvestigatorInput>['previousAttempts'] = [];
    for (let earlier = 1; earlier < state.cycle; earlier++) {
      const hypothesisRef = state.artifacts[`${earlier}-hypothesis`], acceptanceRef = state.artifacts[`${earlier}-acceptance`], reviewRef = state.artifacts[`${earlier}-review`];
      if (hypothesisRef && acceptanceRef && reviewRef) previous.push({ hypothesis: await store.get(hypothesisRef, Hypothesis), acceptance: await store.get(acceptanceRef, Acceptance), recommendation: await store.get(reviewRef, Review) });
    }
    for (let cycle = Math.max(1, state.cycle); cycle <= config.maxCycles; cycle++) {
      state.cycle = cycle;
      const refs = () => Object.values(state!.artifacts);
      await save('baselining');
      const baselineRef = `lab/${config.runId}/c${cycle}/baseline`;
      if (config.runner === 'github') await publish(config.targetPath, manifest.baselineCommit, baselineRef);
      const profile = await store.block(state, 'baseline', Observation, [], () => runner.execute({ correlation: `${config.runId}-c${cycle}-profile`, commit: manifest.baselineCommit, ref: baselineRef, pair: 0, side: 'baseline', group: 'cold', cacheKey: `${config.runId}-c${cycle}-profile`, expectedCacheHit: false, patchDigest: digest('baseline-profile') }, baseline, signal), manifest.baselineCommit);
      if (validateExecution(profile, baseline, manifest).status !== 'pass') throw new Error('BASELINE_EVIDENCE: baseline failed protected execution checks');
      const snapshot = await new ScopedFiles(baselineCheckout, manifest).snapshot();
      const context = { snapshot, plan: baseline, baselineEvidence: profile, allowedFiles: manifest.allowedFiles, requiredTests: Object.keys(manifest.tests), maxPartitions: manifest.maxPartitions, objective: config.objective, previousAttempts: previous };
      await store.block(state, 'investigator-input', InvestigatorInput, refs(), async () => InvestigatorInput.parse(context), manifest.baselineCommit);
      const defaultHypothesis = rulesHypothesis(baseline, manifest.maxPartitions);
      const defaults = { investigator: defaultHypothesis, editor: { files: defaultHypothesis.plan ? [{ path: 'ci/plan.json', content: JSON.stringify(defaultHypothesis.plan) + '\n' }] : [], explanation: 'Recorded CI plan edit.' }, reviewer: { recommendation: 'approve', concerns: ['Recorded response; no live agent judgment.'], explanation: 'Deterministic checks control acceptance.', evidence: ['validation', 'measurements'], requestExperiment: false } };
      const adapter = (role: 'investigator' | 'editor' | 'reviewer') => {
        const value = dependencies.model?.(role, defaults) ?? (config.provider === 'opencode' ? new OpenCodeModel(config.model, Math.min(config.timeoutSeconds * 1000, 180000)) : config.provider === 'jev-openrouter-free' && role === 'investigator' ? new JevModel() : config.provider === 'openrouter-free' || config.provider === 'jev-openrouter-free' ? new OpenRouterFreeModel(config.model) : new RecordedModel(defaults));
        if (value.maximumCostUsd > config.perCallLimitUsd) throw new Error('CALL_BUDGET: bounded model price exceeds per-call limit');
        return value;
      };
      const usage = async (value: ModelUsage) => { if (value.costUsd > config.perCallLimitUsd) throw new Error('CALL_BUDGET: provider cost exceeded configured call limit'); if (!state!.models.some(item => item.requestDigest === value.requestDigest && item.role === value.role && item.timestamp === value.timestamp)) { state!.models.push(value); await store.save(state!); } };
      await save('investigating');
      const hypothesis = await store.block(state, 'hypothesis', Hypothesis, refs(), async () => {
        if (config.strategy === 'unchanged') return Hypothesis.parse({ decision: 'no-change', family: 'none', explanation: 'Unchanged comparator does not propose patches.', plan: null, evidence: ['baseline'] });
        if (config.strategy === 'rules') return defaultHypothesis;
        const result = await investigate(store, budget, `${config.runId}-c${cycle}-investigator`, adapter('investigator'), context, signal); await usage(result.usage); return Hypothesis.parse(result.output);
      }, manifest.baselineCommit);
      if (hypothesis.decision === 'no-change') {
        if (hypothesis.plan !== null || hypothesis.family !== 'none') throw new Error('HYPOTHESIS: inconsistent no-change response');
        const series = await store.block(state, 'baseline-series', z.object({ observations: z.array(Observation).length(5), primes: z.array(Observation) }).strict(), refs(), async () => {
          const observations = [], primes = [];
          const key = `${config.runId}-c${cycle}-unchanged-${config.group}`;
          if (config.group === 'warm' && baseline.cache) primes.push(await runner.execute({ correlation: `${config.runId}-c${cycle}-unchanged-prime`, commit: manifest.baselineCommit, ref: baselineRef, pair: 0, side: 'baseline', group: config.group, cacheKey: key, expectedCacheHit: false, patchDigest: digest('unchanged') }, baseline, signal));
          for (let pair = 0; pair < 5; pair++) observations.push(await runner.execute({ correlation: `${config.runId}-c${cycle}-unchanged-${pair}`, commit: manifest.baselineCommit, ref: baselineRef, pair, side: 'baseline', group: config.group, cacheKey: config.group === 'cold' ? `${key}-${pair}` : key, expectedCacheHit: config.group === 'warm' && baseline.cache, patchDigest: digest('unchanged') }, baseline, signal));
          return { observations, primes };
        }, manifest.baselineCommit);
        const checks = [...series.primes, ...series.observations].map(sample => validateExecution(sample, baseline, manifest));
        await store.block(state, 'execution-validation', z.array(Validation), refs(), async () => checks, manifest.baselineCommit);
        if (checks.some(check => check.status !== 'pass')) { await save('rejected'); break; }
        if (config.strategy === 'agent') {
          const result = await review(store, budget, `${config.runId}-c${cycle}-reviewer`, adapter('reviewer'), { hypothesis, baselineEvidence: profile, noChange: true, observations: series.observations }, signal); await usage(result.usage);
          await store.block(state, 'review', Review, refs(), async () => Review.parse(result.output));
        }
        await save('no-change'); break;
      }
      if (!hypothesis.plan || hypothesis.family === 'none') throw new Error('HYPOTHESIS: change requires a plan and family');
      await save('editing');
      const candidateCheckout = path.join(store.root, 'checkouts', `candidate-${cycle}`);
      await checkout(config.targetPath, candidateCheckout, manifest.baselineCommit);
      const files = new ScopedFiles(candidateCheckout, manifest);
      const patch = await store.block(state, 'patch', Patch, refs(), async () => {
        if (config.strategy === 'agent') { const result = await edit(store, budget, `${config.runId}-c${cycle}-editor`, adapter('editor'), { hypothesis, currentPlan: baseline, requiredTests: Object.keys(manifest.tests), allowedFiles: manifest.allowedFiles }, files, signal); await usage(result.usage); }
        else await files.write('ci/plan.json', JSON.stringify(hypothesis.plan) + '\n');
        const text = await command('git', ['diff', '--binary', manifest.baselineCommit, '--'], { cwd: candidateCheckout });
        const changedFiles = (await command('git', ['diff', '--name-only', manifest.baselineCommit, '--'], { cwd: candidateCheckout })).trim().split('\n').filter(Boolean);
        await command('git', ['-c', 'core.hooksPath=/dev/null', 'add', '--', 'ci/plan.json'], { cwd: candidateCheckout });
        await command('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '-m', `CI experiment ${config.runId} cycle ${cycle}`], { cwd: candidateCheckout });
        const candidateCommit = (await command('git', ['rev-parse', 'HEAD'], { cwd: candidateCheckout })).trim();
        return Patch.parse({ schemaVersion: 1, baselineCommit: manifest.baselineCommit, candidateCommit, digest: digest(text), changedFiles, text });
      }, manifest.baselineCommit);
      await save('validating');
      const validation = await store.block(state, 'validation', Validation, refs(), () => validateCheckout(candidateCheckout, manifest), patch.candidateCommit, patch.digest);
      const fresh = await validateCheckout(candidateCheckout, manifest);
      if (fresh.status !== 'pass' && validation.status === 'pass') throw new Error('RESUME_TAMPER: candidate changed after validation');
      let decision: z.infer<typeof Acceptance> = { status: 'rejected', rule: 'paired-log-t95-v1', pairs: 0, primaryRatio: null, primaryUpper95: null, secondaryRatio: null, secondaryUpper95: null, reason: 'Candidate failed protected validation.' };
      let observations: z.infer<typeof Observation>[] = [];
      if (validation.status === 'pass') {
        if (digest(await command('git', ['diff', '--binary', manifest.baselineCommit, '--'], { cwd: candidateCheckout })) !== patch.digest) throw new Error('PATCH_IDENTITY: candidate diff changed');
        const candidatePlan = Plan.parse(JSON.parse(await files.read('ci/plan.json')));
        if (JSON.stringify(candidatePlan) === JSON.stringify(baseline)) throw new Error('EMPTY_CHANGE: hypothesis did not change the CI plan');
        if (config.runner === 'github') await publish(config.targetPath, patch.candidateCommit, `lab/${config.runId}/c${cycle}/candidate`);
        await save('measuring');
        const measurements = await store.block(state, 'measurements', z.object({ observations: z.array(Observation), primes: z.array(Observation) }).strict(), refs(), () => measure(config, cycle, manifest.baselineCommit, patch.candidateCommit, patch.digest, baseline, candidatePlan, runner, signal), patch.candidateCommit, patch.digest);
        observations = measurements.observations;
        const checks = [...measurements.primes, ...observations].map(sample => validateExecution(sample, sample.side === 'baseline' ? baseline : candidatePlan, manifest));
        await store.block(state, 'execution-validation', z.array(Validation), refs(), async () => checks, patch.candidateCommit, patch.digest);
        decision = rule(observations, config.objective, checks);
      }
      const acceptance = await store.block(state, 'acceptance', Acceptance, refs(), async () => decision, patch.candidateCommit, patch.digest);
      await save('reviewing');
      const recommendation = await store.block(state, 'review', Review, refs(), async () => {
        if (config.strategy !== 'agent') return Review.parse({ recommendation: 'approve', concerns: [], explanation: 'Deterministic comparator uses the same correctness and measurement gates.', evidence: ['validation', 'acceptance'], requestExperiment: false });
        const result = await review(store, budget, `${config.runId}-c${cycle}-reviewer`, adapter('reviewer'), { hypothesis, patch, validation, acceptance, observations }, signal); await usage(result.usage); return Review.parse(result.output);
      }, patch.candidateCommit, patch.digest);
      for (const extension of extensions.values()) await extension({ config, state, store });
      if (acceptance.status === 'accepted' && recommendation.recommendation === 'approve' && validation.status === 'pass') { await save(config.runner === 'github' ? 'accepted' : 'inconclusive'); break; }
      previous.push({ hypothesis, acceptance, recommendation });
      if (cycle === config.maxCycles || !recommendation.requestExperiment) { await save(acceptance.status === 'accepted' ? 'inconclusive' : acceptance.status); break; }
      state.cycle = cycle + 1; await store.save(state);
    }
    return await report(store, state, config, budget);
  } catch (error) {
    if (state) { state.error = redact(String(error)); await store.save(state, signal?.aborted || String(error).includes('CANCELLED') ? 'cancelled' : 'failed'); await report(store, state, config, budget); }
    throw error;
  } finally { watcher.close(); await unlock(); }
}
async function checkout(target: string, destination: string, commit: string) {
  try { await access(path.join(destination, '.git')); return; } catch {}
  await mkdir(path.dirname(destination), { recursive: true });
  await command('git', ['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--detach', destination, commit], { cwd: target });
}
async function publish(target: string, commit: string, branch: string) {
  if (!branch.startsWith('lab/')) throw new Error('BRANCH_POLICY');
  await command('git', ['push', 'origin', `${commit}:refs/heads/${branch}`], { cwd: target });
}
