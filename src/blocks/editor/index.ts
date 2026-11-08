import { Edit, EditorInput } from '../../contracts/index.js';
import type { ModelAdapter } from '../../adapters/models/index.js';
import { invokeModel } from '../../adapters/models/index.js';
import type { Store, Budget } from '../../adapters/records/store.js';
import type { ScopedFiles } from './tools.js';

export async function edit(store: Store, budget: Budget, key: string, adapter: ModelAdapter, context: Record<string, unknown>, files: ScopedFiles, signal?: AbortSignal) {
  const result = await invokeModel(store, budget, key, adapter, { role: 'editor', context: EditorInput.parse(context), schema: Edit, instruction: 'Implement the hypothesis by returning only ci/plan.json as a complete JSON file. Preserve the complete test inventory exactly once. No commands, new fields, test edits, or workflow edits. Return JSON with files and explanation.' }, signal);
  const output = Edit.parse(result.output);
  for (const file of output.files) await files.write(file.path, file.content);
  return { output, usage: result.usage };
}
