import path from 'node:path';
import type { RunConfig, RunState } from '../../contracts/index.js';
import { atomic, json, redact } from '../../util.js';
import type { Store, Budget } from '../../adapters/records/store.js';

export async function report(store: Store, state: RunState, config: RunConfig, budget: Budget) {
  const ledger = await budget.snapshot();
  const artifacts: Record<string, unknown> = {};
  for (const [key, ref] of Object.entries(state.artifacts)) {
    const { z } = await import('zod'); artifacts[key] = await store.get(ref, z.unknown());
  }
  const patch = Object.entries(artifacts).filter(([key]) => key.endsWith('-patch')).at(-1)?.[1] as any;
  const acceptance = Object.entries(artifacts).filter(([key]) => key.endsWith('-acceptance')).at(-1)?.[1] as any;
  if (patch) await atomic(path.join(store.root, 'candidate.patch'), patch.text);
  const record = { schemaVersion: 1, runId: state.runId, outcome: state.status, config, models: state.models, ledger, artifactReferences: state.artifacts, artifacts, error: state.error };
  await atomic(path.join(store.root, 'report.json'), redact(json(record)));
  const markdown = `# Experiment ${state.runId}\n\nOutcome: **${state.status}**. ${state.error ?? ''}\n\nStrategy: ${config.strategy}. Runner: ${config.runner}. Model provider: ${config.provider}.\n${config.runner === 'recorded' ? '\nAll measurements are recorded fixtures. They do not demonstrate a live improvement.\n' : ''}\n${config.provider === 'recorded' && config.strategy === 'agent' ? '\nThe three agent roles used recorded responses. This is orchestration evidence, not live agent performance.\n' : ''}\n## Decision\n\n${acceptance ? acceptance.reason : 'No accepted measured candidate.'}\n\nPrimary ratio: ${acceptance?.primaryRatio ?? 'unavailable'}; one-sided 95% upper bound: ${acceptance?.primaryUpper95 ?? 'unavailable'}.\nSecondary ratio: ${acceptance?.secondaryRatio ?? 'unavailable'}; upper bound: ${acceptance?.secondaryUpper95 ?? 'unavailable'}.\n\n## Evidence\n\nThe [machine-readable report](report.json) includes exact hypotheses, validation checks, raw observations, prime runs, CI URLs, model identities, costs, failed attempts, and review concerns. Every block has a versioned envelope and digest-verified input/output references. The [candidate patch](candidate.patch) identifies its baseline and candidate commits in report.json.\n\nAcceptance rule: ${config.objective.acceptanceRule}; primary improvement >=${config.objective.minimumImprovement * 100}%, secondary regression <=${config.objective.secondaryRegressionLimit * 100}%, five complete pairs. See docs/measurement.md for the frozen uncertainty rule.\n\n## Limits\n\nFive samples assume independent log ratios and may not characterize shared-runner tails. Queue time is excluded from elapsed execution and recorded separately. Job seconds are a compute proxy, not a billing claim. Controlled plans and protected execution code narrow the attack surface; validation is not a proof against arbitrary malicious GitHub infrastructure. A no-change recommendation does not prove optimality. Cumulative budget entries include conservative storage bounds, not audited invoices.\n`;
  await atomic(path.join(store.root, 'report.md'), redact(markdown));
  const short = `${state.status}: ${state.runId}\n${acceptance ? `Primary ratio ${acceptance.primaryRatio?.toFixed(3) ?? 'n/a'}; secondary ${acceptance.secondaryRatio?.toFixed(3) ?? 'n/a'}; ${acceptance.pairs}/5 pairs.` : 'No measured candidate accepted.'}\nCorrectness and evidence: ${path.join(store.root, 'report.md')}\nPatch: ${patch ? path.join(store.root, 'candidate.patch') : 'none'}`;
  await atomic(path.join(store.root, 'summary.txt'), short + '\n'); return short;
}
