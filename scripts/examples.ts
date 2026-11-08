import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import * as contracts from '../src/contracts/index.js';
import { rulesHypothesis } from '../src/blocks/investigator/index.js';
import { RecordedRunner } from '../src/blocks/runner/index.js';
import { atomic, json, digest, readJson } from '../src/util.js';

const manifest = contracts.Manifest.parse(await readJson('manifests/cache.json'));
const plan = contracts.Plan.parse({ schemaVersion: 1, cache: false, partitions: [Object.keys(manifest.tests)] });
const request = { correlation: 'example-run', commit: manifest.baselineCommit, ref: 'lab/example/baseline', pair: 0, side: 'baseline', group: 'cold', cacheKey: 'example-cold', expectedCacheHit: false, patchDigest: digest('example') } as const;
const observation = await new RecordedRunner(manifest).execute(request, plan), hypothesis = rulesHypothesis(plan, manifest.maxPartitions);
const edit = { files: [{ path: 'ci/plan.json', content: JSON.stringify(hypothesis.plan) + '\n' }], explanation: 'Enable protected lock-keyed dependency reuse.' };
const review = { recommendation: 'more-evidence', concerns: ['Recorded measurements cannot prove a live improvement.'], explanation: 'Run the protected pipeline on GitHub before making a performance claim.', evidence: ['baseline'], requestExperiment: false };
const examples: Record<string, { context: unknown; recordedOutput?: unknown }> = {
  investigator: { context: { snapshot: { 'ci/plan.json': JSON.stringify(plan), 'ci/case.json': '{"description":"controlled fixture"}' }, plan, baselineEvidence: observation, allowedFiles: manifest.allowedFiles, requiredTests: Object.keys(manifest.tests), maxPartitions: manifest.maxPartitions, objective: contracts.defaultObjective, previousAttempts: [] }, recordedOutput: hypothesis },
  editor: { context: { hypothesis, currentPlan: plan, requiredTests: Object.keys(manifest.tests), allowedFiles: manifest.allowedFiles }, recordedOutput: edit },
  reviewer: { context: { hypothesis: { decision: 'no-change', family: 'none', explanation: 'No supported change in this example.', plan: null, evidence: ['baseline'] }, baselineEvidence: observation, noChange: true, observations: [observation] }, recordedOutput: review },
  runner: { context: { manifest, plan, request } },
  validator: { context: { checkout: '../ci-lab-runs/examples-checkout', manifest } },
  reporter: { context: { runDirectory: '../ci-lab-runs/demo' } },
};
for (const [name, example] of Object.entries(examples)) await atomic(`examples/${name}.input.json`, json({ envelope: { schemaVersion: 1, runId: `example-${name}`, stepId: name, attemptId: 'one', inputs: [], outputs: [] }, ...example }));
await atomic('examples/validator-execution.input.json', json({ envelope: { schemaVersion: 1, runId: 'example-execution', stepId: 'validator', attemptId: 'one', inputs: [], outputs: [] }, context: { manifest, plan, observation } }));
await atomic('examples/invalid-plan.json', json({ schemaVersion: 1, cache: true, partitions: [['missing-test']], command: 'skip' }));
const schemas: Record<string, unknown> = {};
for (const [name, schema] of Object.entries(contracts)) if (schema instanceof z.ZodType) schemas[name] = z.toJSONSchema(schema);
await atomic('docs/contracts.json', json({ schemaVersion: 1, schemas }));
console.log('Generated complete block inputs and v1 JSON Schemas.');
