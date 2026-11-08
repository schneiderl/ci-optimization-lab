import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { z } from 'zod';
import { Config, defaultObjective, State, Manifest, Plan, Validation } from '../contracts/index.js';
import { run } from '../coordinator/index.js';
import { Store, Budget } from '../adapters/records/store.js';
import { JevModel, OpenCodeModel, OpenRouterFreeModel, roleSchemas, invokeModel } from '../adapters/models/index.js';
import { validateCheckout } from '../blocks/validator/index.js';
import { report } from '../blocks/reporter/index.js';
import { atomic, json, readJson } from '../util.js';
import { openRouterCredential, refreshCredential, removeCredential } from '../adapters/models/credentials.js';
import { block } from './block.js';

const [verb, ...args] = process.argv.slice(2);
const abort = new AbortController(); process.on('SIGINT', () => abort.abort()); process.on('SIGTERM', () => abort.abort());
try {
  if (verb === 'credentials') {
    if (args[0] === 'remove') await removeCredential(); else if (args[0] === 'refresh') await refreshCredential(); else await openRouterCredential();
    console.log(args[0] === 'remove' ? 'Local OpenRouter credential cache removed.' : 'OpenRouter credential cached outside repositories; value withheld.');
  } else if (verb === 'init') {
    const [id = 'demo', fixture = 'cache', provider = 'recorded', runner = 'recorded', group = 'warm'] = args;
    const config = Config.parse({ schemaVersion: 1, runId: id, targetPath: path.resolve('../ci-lab-target-workloads'), manifestPath: path.resolve(`manifests/${fixture}.json`), dataRoot: path.resolve('../ci-lab-runs'), strategy: 'agent', provider, model: 'opencode/deepseek-v4.1-flash-free', runner, group, maxCycles: 1, timeoutSeconds: 1200, objective: defaultObjective, cumulativeBudgetUsd: 30, perCallLimitUsd: 0, perExperimentLimitUsd: 1, maxConcurrency: 2 });
    const file = `${id}.config.json`; await atomic(file, json(config)); console.log(file);
  } else if (verb === 'run') console.log(await run(await readJson(args[0]!), {}, abort.signal));
  else if (verb === 'resume') {
    const root = path.resolve(args[0]!); console.log(await run(await readJson(path.join(root, 'config.json')), {}, abort.signal));
  } else if (verb === 'status') {
    const state = State.parse(await readJson(path.join(args[0]!, 'state.json'))); console.log(`${state.runId}: ${state.status}, cycle ${state.cycle}, ${Object.keys(state.artifacts).length} artifacts`);
  } else if (verb === 'cancel') { await writeFile(path.join(args[0]!, 'cancel'), 'requested\n'); console.log('Cancellation requested; the coordinator will stop and cancel its active remote run.'); }
  else if (verb === 'report') { const store = new Store(path.resolve(args[0]!)), state = State.parse(await readJson(path.join(store.root, 'state.json'))), config = Config.parse(await readJson(path.join(store.root, 'config.json'))); console.log(await report(store, state, config, new Budget(config.dataRoot, config.cumulativeBudgetUsd))); }
  else if (verb === 'block') {
    console.log(json(await block(args[0]!, args[1]!, args[2] ?? 'recorded', args[3], abort.signal)));
  } else if (verb === 'smoke-model') {
    const root = path.resolve('../ci-lab-runs/model-smoke'), store = new Store(root), budget = new Budget(path.dirname(root));
    const adapter = args[0] === 'jev' ? new JevModel() : args[0]?.endsWith(':free') ? new OpenRouterFreeModel(args[0]) : new OpenCodeModel(args[0] ?? 'opencode/deepseek-v4.1-flash-free');
    const result = await invokeModel(store, budget, `smoke-${Date.now()}`, adapter, { role: 'investigator', context: { plan: { schemaVersion: 1, cache: true, partitions: [['case-000']] }, requiredTests: ['case-000'], maxPartitions: 1 }, schema: roleSchemas.investigator, instruction: 'The single tiny required test already uses dependency caching. Return a reasoned no-change judgment, family none, plan null, evidence [pipeline-snapshot].' }, abort.signal); console.log(json(result));
  } else { console.log('CI lab: init [id fixture provider runner group] | run <config.json> | status <run-dir> | resume <run-dir> | cancel <run-dir> | report <run-dir> | block <role> <input.json> [free-model] | smoke-model [free-model|jev]'); if (verb && verb !== 'help') process.exitCode = 2; }
} catch (error) { console.error(String(error)); process.exitCode = 1; }
