import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { BlockRequest } from '../src/cli/block.js';
import { InvestigatorInput, EditorInput, ReviewerInput, ValidatorInput, Manifest, Plan, Dispatch, Hypothesis, Edit, Review } from '../src/contracts/index.js';
import { readJson } from '../src/util.js';

const inputs = { investigator: InvestigatorInput, editor: EditorInput, reviewer: ReviewerInput, validator: ValidatorInput, runner: z.object({ manifest: Manifest, plan: Plan, request: Dispatch }).strict(), reporter: z.object({ runDirectory: z.string() }).strict() };
for (const [name, schema] of Object.entries(inputs)) {
  const value = BlockRequest.parse(await readJson(`examples/${name}.input.json`)); schema.parse(value.context);
  if (name === 'investigator') Hypothesis.parse(value.recordedOutput);
  if (name === 'editor') Edit.parse(value.recordedOutput);
  if (name === 'reviewer') Review.parse(value.recordedOutput);
  const doc = await readFile(`docs/blocks/${name}.md`, 'utf8');
  for (const heading of ['Purpose', 'Contracts', 'Invariants', 'Access', 'Failures', 'Persistence', 'Run', 'Extension']) if (!doc.includes(`## ${heading}`)) throw new Error(`${name}: missing ${heading}`);
}
if (Plan.safeParse(await readJson('examples/invalid-plan.json')).success) throw new Error('Invalid example was accepted');
console.log('Six complete block examples, outputs, documentation sections, and invalid-input rejection checked.');
