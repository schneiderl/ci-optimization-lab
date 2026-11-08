import { Acceptance, Objective, type CheckResult, type Sample } from '../contracts/index.js';
import type { z } from 'zod';
type ObjectiveConfig = z.infer<typeof Objective>;
export type AcceptanceRule = (observations: Sample[], objective: ObjectiveConfig, correctness: CheckResult[]) => z.infer<typeof Acceptance>;
const bounds = (ratios: number[]) => {
  const logs = ratios.map(Math.log), mean = logs.reduce((sum, value) => sum + value, 0) / logs.length;
  const variance = logs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (logs.length - 1);
  return { ratio: Math.exp(mean), upper: Math.exp(mean + 2.132 * Math.sqrt(variance / logs.length)) };
};
export const pairedLogT95: AcceptanceRule = (samples, objective, correctness) => {
  const result: z.infer<typeof Acceptance> = { status: 'inconclusive', rule: 'paired-log-t95-v1', pairs: 0, primaryRatio: null, primaryUpper95: null, secondaryRatio: null, secondaryUpper95: null, reason: 'Five complete, valid pairs are required.' };
  if (correctness.some(check => check.status === 'fail')) return { ...result, status: 'rejected', reason: 'A deterministic correctness check failed.' };
  const baselinePins = new Set(samples.filter(sample => sample.side === 'baseline').map(sample => sample.commit));
  const candidatePins = new Set(samples.filter(sample => sample.side === 'candidate').map(sample => sample.commit));
  if (new Set(samples.map(sample => sample.group)).size !== 1 || new Set(samples.map(sample => sample.patchDigest)).size !== 1 || new Set(samples.map(sample => sample.source)).size !== 1 || baselinePins.size !== 1 || candidatePins.size !== 1 || new Set(samples.map(sample => sample.correlation)).size !== samples.length || new Set(samples.map(sample => sample.runId)).size !== samples.length) return { ...result, reason: 'One cache group, common pinned baseline/candidate/patch identities, and unique workflow runs are required across the entire experiment.' };
  const pairs = [];
  for (let pair = 0; pair < 5; pair++) {
    const baseline = samples.filter(sample => sample.pair === pair && sample.side === 'baseline');
    const candidate = samples.filter(sample => sample.pair === pair && sample.side === 'candidate');
    if (baseline.length !== 1 || candidate.length !== 1) continue;
    const a = baseline[0]!, b = candidate[0]!;
    if (a.group !== b.group || a.commit === b.commit || a.patchDigest !== b.patchDigest || a.source !== b.source || a.attempt !== 1 || b.attempt !== 1 || a.conclusion !== 'success' || b.conclusion !== 'success') continue;
    if (a.jobs.some(job => job.runner !== 'ubuntu-24.04') || b.jobs.some(job => job.runner !== 'ubuntu-24.04')) continue;
    pairs.push([a, b] as const);
  }
  result.pairs = pairs.length;
  if (pairs.length !== 5 || samples.length !== 10 || correctness.length < 10 || correctness.some(check => check.status !== 'pass')) return result;
  const secondary = objective.primary === 'elapsedSeconds' ? 'jobSeconds' : 'elapsedSeconds';
  const primary = bounds(pairs.map(([a, b]) => b[objective.primary] / a[objective.primary]));
  const other = bounds(pairs.map(([a, b]) => b[secondary] / a[secondary]));
  Object.assign(result, { primaryRatio: primary.ratio, primaryUpper95: primary.upper, secondaryRatio: other.ratio, secondaryUpper95: other.upper });
  if (primary.upper <= 1 - objective.minimumImprovement && other.upper <= 1 + objective.secondaryRegressionLimit) return { ...result, status: 'accepted', reason: 'Both one-sided 95% paired log-ratio bounds meet the frozen thresholds.' };
  if (primary.ratio > 1 - objective.minimumImprovement || other.ratio > 1 + objective.secondaryRegressionLimit) return { ...result, status: 'rejected', reason: 'The observed mean ratios miss at least one configured threshold.' };
  return { ...result, reason: 'Point estimates meet thresholds, but uncertainty does not establish acceptance.' };
};
export const acceptanceRules = new Map<string, AcceptanceRule>([['paired-log-t95-v1', pairedLogT95]]);
