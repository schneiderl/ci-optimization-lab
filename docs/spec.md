# CI optimization lab

Status: design approved in conversation; implementation not started.

## Purpose

Build a public, independently testable portfolio project that demonstrates CI
ownership, performance analysis, reliable agent workflows, and developer
experience. The system investigates a CI pipeline, proposes a CI-only change,
measures it, and produces a patch with evidence. It does not need a busy production
repository: we own the workloads and trigger the experiments.

Target the first usable version at 30 focused implementation hours, with a $30
total development/demo spending ceiling. These are constraints, not estimates of
guaranteed delivery or provider cost. If the scope cannot fit, report the gap
rather than silently weakening validation.

## Agreed scope

- TypeScript for the CLI, coordinator, agent blocks, validators, and workloads.
- GitHub Actions for real CI measurements; local execution for block development
  and network-independent checks.
- Three agents from the first version: Investigator, Editor, and Reviewer.
- A deterministic coordinator and experiment runner control execution.
- Separately maintained blocks with explicit, versioned contracts and detailed
  documentation, in one lab repository.
- Target repositories are separate Git repositories, never directories inside
  the lab source tree.
- Initial optimization families: dependency caching and test-job partitioning.
- A no-change workload, held-out variants, and a simple rules-based comparator.
- Up to three hypothesis–patch–measurement cycles per experiment.
- Durable state, resumable runs, a patch, a full evidence report, and a very short
  default user summary.
- Extensible steps, objectives, measurements, and acceptance rules.

## Repository and execution separation

The lab repository owns orchestration, contracts, prompts, validators, objective
definitions, protected workload manifests, evaluation definitions, and docs.
Example target repositories own runnable TypeScript applications, their existing
tests, and GitHub Actions workflows. Their source history is independent of the
lab's history.

The coordinator pins the target commit and creates a disposable checkout for
each candidate. Agent tools expose only the assigned checkout and required
read-only evidence. They do not expose the lab source, secret store, acceptance
configuration, or evaluation answer keys. Merely using different directories is
not sufficient isolation: tool permissions and post-edit validation must enforce
the separation.

Execution records live outside target checkouts, under a configurable run-data
directory. Rejected candidates cannot alter the pinned baseline or contaminate
subsequent candidates. The coordinator, not an agent, controls target branches
and workflow dispatch. Experimental branches may be created in designated demo
repositories; no automatic merge or production deployment is included.

## CI-only edit policy

Each workload declares an exact allowlist of workflow files and dedicated CI
scripts. Everything else is protected, including application code, tests and
assertions, dependency manifests and lockfiles, and project configuration.

Test partitioning changes how existing tests are assigned to CI jobs. It must
not change tests, assertions, test discovery rules, or the required test set.
Allowed CI scripts cannot bypass protected requirements through indirect edits,
test filtering, or replacement commands. Validate the full diff and actual
executed work; a green workflow is insufficient evidence.

## Workflow

1. Validate configuration, permissions, budget, target revision, and manifest.
2. Establish the baseline and collect pipeline structure and measurement data.
3. Investigator proposes a bounded hypothesis and an experiment plan, or returns
   a reasoned no-change result.
4. Editor creates one candidate patch in an isolated checkout.
5. Deterministic validation rejects unauthorized edits and malformed candidates.
6. Runner executes baseline/candidate measurements and captures required evidence.
7. Deterministic validation checks preserved behavior and computes acceptance.
8. Reviewer examines the diff, evidence, and limitations. It may flag a concern
   or request a further experiment within budget; it cannot override failed
   checks or declare an unmeasured improvement proven.
9. Coordinator accepts the candidate, tries another hypothesis within the
   three-cycle limit, or stops with an explicit outcome.
10. Reporter writes the patch and full report, then prints a short summary.

The first version uses a declared sequence of steps, not a general workflow
designer. New step implementations can be registered without modifying existing
agent blocks. Objectives and acceptance rules are configured independently from
the step sequence.

## Block contracts

All exchanged data uses runtime-validated schemas with a schema version, run ID,
step ID, attempt ID, input artifact references, and output artifact references.
Evidence references identify the target commit and candidate patch digest.
Blocks receive explicit dependencies; they do not discover credentials or create
untracked execution state themselves.

| Block | Input | Output | Permitted effects |
| --- | --- | --- | --- |
| Investigator | Pipeline snapshot, baseline evidence, allowed edits, objective | Hypothesis, evidence references, proposed experiment, or no-change judgment | Read scoped files and evidence; invoke configured model |
| Editor | Hypothesis, scoped target checkout, edit policy | Patch, explanation, files changed | Edit allowed CI files in its checkout; invoke configured coding model |
| Experiment runner | Validated candidate, immutable baseline, manifest, measurement plan | CI references, statuses, raw measurements, execution evidence | Dispatch and monitor approved target workflows |
| Validator | Manifest, diff, execution evidence, objective | Structured pass/fail/inconclusive results with reasons | Read evidence; run defined checks; no model override |
| Reviewer | Hypothesis, patch, validation results, measurements | Concerns, evidence references, recommendation, optional experiment request | Read scoped artifacts; invoke configured model; no patch edits |
| Reporter | Persisted run record and computed outcome | Short summary, detailed report, patch reference | Write run artifacts |

The coordinator owns transitions, retry decisions, timeouts, cancellation,
idempotency keys, budget reservation, and final outcome. Its responsibilities
must not be spread among agent prompts.

Each block must have its own implementation, tests, and documentation. Document:

1. Purpose, responsibilities, and explicit non-responsibilities.
2. Input/output schemas and complete valid examples.
3. Invariants, ordering requirements, and permitted side effects.
4. Tool access, configuration, provider use, and credential handling.
5. Failure categories, retry behavior, timeouts, and cancellation.
6. Persistence, replay behavior, and compatibility/versioning policy.
7. How to run and test it independently, including a failing example.
8. How to extend or replace it, with tradeoffs and known limitations.

## Models

Use free models through OpenCode for very small tasks. Use Jev through
OpenRouter for suitable structured inference, such as choosing or ranking
hypotheses. Jev judgments are not correctness proofs. Coding and prose tasks
require a generative model; model selection remains configurable per block.

Keep model invocations behind adapters and persist request metadata, model
identity, usage, and sanitized outputs. Provide recorded/fake adapters for local
tests and separate live smoke checks. Do not quietly switch from a free model to
a paid provider.

The user identified the 1Password item `OpenRouter API Key - self-host` as the
OpenRouter credential source, accessible through `op`. Fetch credentials at
runtime, keep them out of logs and artifacts, and do not expose them to target
workflows or agent checkouts. Authentication has not yet been tested.

Reference checked during design: [OpenRouter Jev documentation](https://openrouter.ai/docs/guides/community/jev).
It documents the Decisions API and model `typesafe/jev-1.14`; recheck availability
and pricing at implementation time. Jev Router is a different interface that
selects other models; do not substitute it for direct Jev decisions accidentally.

## Protected requirements and correctness

Protected manifests are maintained with the lab, separately from candidate
patches. They declare the required test inventory, commands/checks, output
artifacts, permitted edits, and workload-specific invariants. Agents may inspect
requirements but cannot change them during an experiment.

Validation checks actual executed tests, including missing or duplicated
partitions where relevant, expected outputs, protected file digests, and pipeline
completion. Candidate-generated claims of success are not trusted by themselves.
For controlled fixtures, use independently collected test reports and known
output checks. Document remaining limitations; this is not a proof against every
possible malicious workflow.

## Measurement and acceptance

Every objective declares a primary metric, direction of improvement, minimum
improvement, secondary-metric regression limit, required correctness checks, and
an acceptance-rule version. Initial metrics are:

- Elapsed CI execution time, with an explicit start/end definition.
- Sum of job execution seconds, a compute proxy rather than a billing claim.

Record queue time separately. Record runner type, job attempts, cache conditions,
workflow revision, and timestamps. Keep baseline/candidate conditions comparable;
alternate or randomize pair order and retain the raw observations.

Initial configurable thresholds: at least 10% improvement in the primary metric
and at most 5% regression in the secondary metric, across five valid paired
baseline/candidate runs. These thresholds are necessary but not sufficient:
the implementation must document a noise/uncertainty rule before collecting
evaluation results. Report inconclusive when the evidence cannot establish the
improvement or non-regression. Never treat five samples as inherently sufficient.

Cold-cache and warm-cache cases are separate measurement groups with explicit
cache preparation and verification. Do not mix them into a favorable average.
Cache isolation must prevent baseline and candidate runs from warming each
other accidentally. Test sharding must account for job startup costs and total
compute, not only the fastest wall-clock result.

Future objectives may assess reproducibility, additional security checks, or
release readiness. Each needs its own measurements and acceptance rule; those
implementations are outside version one.

## Evaluation

Use small controllable workloads for both optimization families, a no-change
case, and held-out variants. Keep intended fixes and evaluation answer keys out
of agent context. Hold-out means frozen before evaluation and not used to tune
prompts; merely naming a directory "held-out" does not establish independence.

Compare unchanged pipelines, a documented rules-based optimizer, and the agent
workflow under the same correctness and measurement rules. Report successes,
incorrect suggestions, no-change decisions, inconclusive results, model cost,
and failed attempts. A reasoned no-change recommendation is distinct from a
proven claim that no possible optimization exists.

## Persistence and recovery

Persist each transition and artifact before advancing. Suggested lifecycle:
created, baselining, investigating, editing, validating, measuring, reviewing,
then accepted/no-change/rejected/inconclusive/failed/cancelled.

Persist dispatch intent with a correlation ID before remote submission. On
restart, reconcile matching GitHub runs and their commits before submitting
again. If a dispatch outcome is ambiguous, surface that state rather than
blindly retrying. Completed steps reuse verified artifacts; resuming does not
silently rerun paid model calls. Version mismatches require explicit handling.

## Budget and limits

Track the $30 ceiling cumulatively across development/demo runs, not per
experiment. Include model and chargeable CI usage. Check GitHub account limits
and current provider terms before live execution. Free service availability is
not assumed permanent.

Reserve a conservative allowance before dispatching work. Configure per-call,
per-job, and per-experiment limits, plus maximum concurrency. Reconcile actual
usage afterward. If costs are unknown or the remaining allowance cannot cover
the next bounded batch, stop before dispatch and report why. Budgets must also
cover the rules-based comparator and baseline measurements.

## User output

Default output is a few lines: outcome, change, primary/secondary result,
correctness status, and links or paths to patch and evidence. Never dump the
agent transcript by default.

The full report contains the hypothesis, exact patch, protected checks, raw and
summarized measurements, CI run references, model usage/cost, failed attempts,
review concerns, acceptance-rule version, and limitations. Claims must trace to
recorded evidence. Publishing artifacts requires credential redaction.

## Completion criteria

- A user can run each block independently and execute the complete workflow.
- Live GitHub Actions experiments demonstrate both initial optimization families.
- No-change and held-out cases are included in the published evaluation.
- Protected-file edits and missing required tests are rejected automatically.
- Interruption and resume do not duplicate known model calls or CI dispatches.
- An agent cannot turn failed validation into an accepted result.
- Patch and evidence are inspectable; default output stays short.
- All blocks have the documentation described above.
- Actual results and limitations are reported even when improvements fail.

## Exclusions and implementation preflight

No application optimization, test changes, project tweaks, automatic merging,
production deployments, UI dashboard, separate agent deployments, or broad
plugin framework in version one.

Before coding, confirm repository names/location, GitHub owner and permissions,
available runner allowance, model access, and exact runtime/package versions.
Before live evaluation, freeze fixtures, metric definitions, uncertainty rules,
and spending limits. These are implementation checks, not evidence already
collected. See [implementation plan](implementation-plan.md).
