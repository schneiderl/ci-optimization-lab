import { Observation, MeasurementPlan, type PipelinePlan, type RunConfig, type Sample, type Workload } from '../../contracts/index.js';
import { GitHubRunner, type DispatchRequest } from '../../adapters/github/index.js';
import { digest, now } from '../../util.js';

export interface Runner { execute(request: DispatchRequest, plan: PipelinePlan, signal?: AbortSignal): Promise<Sample> }
export class RecordedRunner implements Runner {
  constructor(private readonly manifest: Workload) {}
  async execute(request: DispatchRequest, plan: PipelinePlan) {
    const runId = Number.parseInt(digest(request.correlation).slice(0, 10), 16), timestamp = now();
    return Observation.parse({ schemaVersion: 1, pair: request.pair, side: request.side, group: request.group, commit: request.commit, patchDigest: request.patchDigest, correlation: request.correlation, runId, url: `recorded://${runId}`, attempt: 1, conclusion: 'success', createdAt: timestamp, startedAt: timestamp, completedAt: new Date(Date.parse(timestamp) + 100000).toISOString(), elapsedSeconds: request.side === 'baseline' ? 100 : 80, jobSeconds: request.side === 'baseline' ? 100 : 90, queueSeconds: 0, jobs: [{ id: 1, name: 'recorded', startedAt: timestamp, completedAt: timestamp, conclusion: 'success', runner: this.manifest.runner }], execution: plan.partitions.map((partition, index) => ({ schemaVersion: 1, runId: String(runId), commit: request.commit, planDigest: digest(JSON.stringify(plan) + '\n'), cacheKey: request.cacheKey, cacheHit: request.expectedCacheHit, partition: index, node: 'recorded', tests: partition.map(id => ({ id, output: this.manifest.tests[id], status: 'pass' })), dependencyCheck: true })), cacheKey: request.cacheKey, expectedCacheHit: request.expectedCacheHit, source: 'recorded' });
  }
}
export async function measure(config: RunConfig, cycle: number, baselineCommit: string, candidateCommit: string, patchDigest: string, baseline: PipelinePlan, candidate: PipelinePlan, runner: Runner, signal?: AbortSignal) {
  MeasurementPlan.parse({ schemaVersion: 1, pairs: 5, group: config.group, order: 'alternating-v1', timeoutSeconds: config.timeoutSeconds, maxConcurrency: config.maxConcurrency });
  const observations: Sample[] = [], primes: Sample[] = [];
  const request = (pair: number, side: 'baseline' | 'candidate', prime = false): DispatchRequest => ({ correlation: `${config.runId}-c${cycle}-${side}-${prime ? 'prime' : pair}`, commit: side === 'baseline' ? baselineCommit : candidateCommit, ref: `lab/${config.runId}/c${cycle}/${side}`, pair, side, group: config.group, cacheKey: `${config.runId}-c${cycle}-${side}-${config.group}-${config.group === 'cold' ? pair : 'shared'}`, expectedCacheHit: !prime && config.group === 'warm' && (side === 'baseline' ? baseline.cache : candidate.cache), patchDigest, ...(prime ? { prime } : {}) });
  if (config.group === 'warm') for (const side of ['baseline', 'candidate'] as const) { const plan = side === 'baseline' ? baseline : candidate; if (plan.cache) primes.push(await runner.execute(request(0, side, true), plan, signal)); }
  for (let pair = 0; pair < 5; pair++) {
    const order = pair % 2 === 0 ? ['baseline', 'candidate'] as const : ['candidate', 'baseline'] as const;
    for (const side of order) observations.push(await runner.execute(request(pair, side), side === 'baseline' ? baseline : candidate, signal));
  }
  return { observations, primes };
}
