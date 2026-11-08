import path from 'node:path';
import { z } from 'zod';
import { Envelope, Manifest, Plan, Dispatch, InvestigatorInput, EditorInput, ReviewerInput, ValidatorInput, Hypothesis, Edit, Review, Observation, Validation, Config, State } from '../contracts/index.js';
import { Store, Budget } from '../adapters/records/store.js';
import { RecordedModel, OpenCodeModel, JevModel, OpenRouterFreeModel, roleSchemas } from '../adapters/models/index.js';
import { GitHubRunner, GhTransport } from '../adapters/github/index.js';
import { investigate } from '../blocks/investigator/index.js';
import { edit } from '../blocks/editor/index.js';
import { ScopedFiles } from '../blocks/editor/tools.js';
import { review } from '../blocks/reviewer/index.js';
import { RecordedRunner } from '../blocks/runner/index.js';
import { validateCheckout, validateExecution } from '../blocks/validator/index.js';
import { report } from '../blocks/reporter/index.js';
import { json, readJson, atomic, now } from '../util.js';

export const BlockRequest = z.object({ envelope: Envelope, context: z.record(z.string(), z.unknown()), recordedOutput: z.unknown().optional() }).strict();
export async function block(name: string, file: string, provider = 'recorded', checkout?: string, signal?: AbortSignal) {
  const request = BlockRequest.parse(await readJson(file)), id = request.envelope.runId;
  if (request.envelope.stepId !== name) throw new Error('BLOCK_ID: envelope stepId must match the selected block');
  const store = new Store(path.resolve('../ci-lab-runs/blocks', id)), budget = new Budget(path.resolve('../ci-lab-runs')).scoped(`block-${id}`, 1);
  const key = `${id}-${name}-${request.envelope.attemptId}`;
  const adapter = name in roleSchemas ? provider === 'recorded' ? new RecordedModel({ [name]: request.recordedOutput }) : provider === 'jev' ? new JevModel() : provider.endsWith(':free') ? new OpenRouterFreeModel(provider) : new OpenCodeModel(provider) : null;
  let output: unknown;
  if (name === 'investigator') output = (await investigate(store, budget, key, adapter!, InvestigatorInput.parse(request.context), signal)).output;
  else if (name === 'editor') {
    if (!checkout) throw new Error('BLOCK_EDITOR: provide an isolated checkout as the fourth block argument');
    const manifestPath = path.resolve('manifests/cache.json'), manifest = Manifest.parse(await readJson(manifestPath));
    output = (await edit(store, budget, key, adapter!, EditorInput.parse(request.context), new ScopedFiles(checkout, manifest), signal)).output;
  } else if (name === 'reviewer') output = (await review(store, budget, key, adapter!, ReviewerInput.parse(request.context), signal)).output;
  else if (name === 'validator') {
    if (provider === 'execution') { const input = z.object({ manifest: Manifest, plan: Plan, observation: Observation }).strict().parse(request.context); output = validateExecution(input.observation, input.plan, input.manifest); }
    else { const input = ValidatorInput.parse(request.context); output = await validateCheckout(path.resolve(input.checkout), input.manifest); }
  }
  else if (name === 'runner') {
    const input = z.object({ manifest: Manifest, plan: Plan, request: Dispatch }).strict().parse(request.context);
    output = provider === 'github' ? await new GitHubRunner(new GhTransport(), store, budget, input.manifest).execute(input.request, input.plan, signal) : await new RecordedRunner(input.manifest).execute(input.request, input.plan);
  } else if (name === 'reporter') {
    const input = z.object({ runDirectory: z.string() }).strict().parse(request.context), source = new Store(path.resolve(input.runDirectory));
    const config = Config.parse(await readJson(path.join(source.root, 'config.json'))), state = State.parse(await readJson(path.join(source.root, 'state.json')));
    output = { summary: await report(source, state, config, new Budget(config.dataRoot, config.cumulativeBudgetUsd)) };
  } else throw new Error('BLOCK: unknown block');
  const ref = await store.put(key, output), envelope = Envelope.parse({ ...request.envelope, outputs: [ref] });
  await atomic(path.join(store.root, `${name}.envelope.json`), json(envelope));
  return { envelope, output };
}
