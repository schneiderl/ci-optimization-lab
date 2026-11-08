import { Review, ReviewerInput } from '../../contracts/index.js';
import type { ModelAdapter } from '../../adapters/models/index.js';
import { invokeModel } from '../../adapters/models/index.js';
import type { Store, Budget } from '../../adapters/records/store.js';

export function review(store: Store, budget: Budget, key: string, adapter: ModelAdapter, context: Record<string, unknown>, signal?: AbortSignal) {
  return invokeModel(store, budget, key, adapter, { role: 'reviewer', context: ReviewerInput.parse(context), schema: Review, instruction: 'Review the exact patch, deterministic validation, and paired measurements. List concerns and recommend approve, reject, or more-evidence. You cannot override failed correctness or acceptance. Missing or simulated evidence cannot prove a live improvement. Request another experiment only with a specific concern.' }, signal);
}
