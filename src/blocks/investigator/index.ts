import { Hypothesis, InvestigatorInput, type PipelinePlan } from '../../contracts/index.js';
import type { ModelAdapter } from '../../adapters/models/index.js';
import { invokeModel } from '../../adapters/models/index.js';
import type { Store, Budget } from '../../adapters/records/store.js';

export const investigatorInstruction = 'Investigate the protected pipeline. Propose one CI-only cache or partition experiment, preserving every test exactly once; otherwise return a reasoned no-change. Never claim an unmeasured speedup. Use only the provided pipeline and baseline evidence.';
export function investigate(store: Store, budget: Budget, key: string, adapter: ModelAdapter, context: Record<string, unknown>, signal?: AbortSignal) { return invokeModel(store, budget, key, adapter, { role: 'investigator', context: InvestigatorInput.parse(context), schema: Hypothesis, instruction: investigatorInstruction }, signal); }
export function rulesHypothesis(plan: PipelinePlan, maxPartitions: number) {
  if (!plan.cache) return Hypothesis.parse({ decision: 'change', family: 'cache', explanation: 'Rule v1 enables lock-keyed dependency reuse when disabled.', plan: { ...plan, cache: true }, evidence: ['pipeline-snapshot'] });
  const tests = plan.partitions.flat();
  if (plan.partitions.length === 1 && tests.length >= 8 && maxPartitions >= 2) return Hypothesis.parse({ decision: 'change', family: 'partition', explanation: 'Rule v1 splits at least eight tests evenly into two jobs.', plan: { ...plan, partitions: [tests.filter((_, index) => index % 2 === 0), tests.filter((_, index) => index % 2 === 1)] }, evidence: ['pipeline-snapshot'] });
  return Hypothesis.parse({ decision: 'no-change', family: 'none', explanation: 'Rule v1 has no further supported change. This does not prove optimality.', plan: null, evidence: ['pipeline-snapshot'] });
}
