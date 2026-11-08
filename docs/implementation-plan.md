# CI optimization lab implementation plan

Companion to the [approved design specification](spec.md). No implementation or
live evaluation has occurred. This plan records sequencing and acceptance checks;
it is not a set of published tracker tickets. The repository references
`docs/agents/issue-tracker.md`, but that file is absent.

## Delivery strategy

Build a thin complete workflow first, using all three agent roles and recorded
model responses. Replace the model and runner adapters with live integrations
after isolation, validation, and recovery work. Keep the application in a new
lab repository, separate from this job-search application and all target repos.

The 30-hour allocation below is provisional. At each milestone, record actual
time and remaining scope. Do not cut correctness checks, repository isolation,
or documentation silently to meet the allocation. Propose a scope revision if
the complete version will not fit.

## Milestones

| Milestone | Hours | Deliverable | Acceptance evidence |
| --- | ---: | --- | --- |
| 1. Preflight and skeleton | 3 | Separate lab and target repo layout; TypeScript tooling; schemas; CLI entry point | Runtime contract checks; target path cannot resolve inside lab; account and cost assumptions recorded |
| 2. Deterministic workflow and records | 5 | Coordinator, versioned artifact store, state transitions, budget ledger, fake runner/model adapters | Full three-agent flow with fixtures; interruption/resume; failed checks cannot be overridden |
| 3. Workloads and protected validation | 5 | Caching, partitioning, no-change workloads; protected manifests; held-out variants; rules baseline | Unauthorized edits and missing tests rejected; workload outputs reproducible; hold-out cases frozen |
| 4. Agent blocks and provider adapters | 5 | Investigator, Editor, Reviewer with scoped tools; OpenCode and Jev adapters | Independent block invocations; schema failure and timeout handling; model selection and usage recorded |
| 5. GitHub runner and measurements | 6 | Workflow dispatch/reconciliation; paired measurements; cache control; acceptance evaluator | Small live smoke run; correlation and resume checks; documented noise rule; budget prevents excess dispatch |
| 6. Evaluation, reports, and docs | 6 | Complete evaluations within budget; short summary; patch and evidence bundle; polished block docs | Raw-to-summary traceability; comparative results including failures; reproducible demo instructions |
| **Total** | **30** | | |

Write block documentation alongside milestones 1–5. Milestone 6 reviews and
completes it; documentation is not deferred wholesale until the end.

## Suggested lab layout

```text
ci-optimization-lab/              # independent Git repository
  src/
    cli/
    contracts/
    coordinator/
    blocks/
      investigator/
      editor/
      reviewer/
      runner/
      validator/
      reporter/
    adapters/
      models/
      github/
      records/
    objectives/
  manifests/                    # protected workload requirements
  evaluation/                   # frozen cases and comparator definitions
  docs/
    architecture.md
    blocks/
    operations.md
    evaluation.md
  tests/

ci-lab-target-*/                  # separate sibling Git repositories
  .github/workflows/
  ci/
  src/
  tests/

<run-data-directory>/            # outside all target worktrees
  <run-id>/
    state.json
    events.jsonl
    artifacts/
    report.md
    candidate.patch
```

Names and persistence filenames are proposals, not required interfaces. Use a
storage adapter with atomic writes and verified artifact references. Introduce a
database only if the actual recovery/concurrency requirements justify it.

## Contract and documentation work

Define schemas for run configuration, workload manifest, objective, hypothesis,
patch artifact, measurement plan, observation, validation result, review, and
final outcome. Specify invalid-input behavior, immutable IDs, and compatibility
handling before wiring live providers.

Each block's documentation must include a runnable example, a failure example,
all required configuration, side effects, retry/recovery behavior, and a guide to
adding a compatible implementation. Keep examples checked against the schemas.
Document how to add a step and an objective without editing existing agents.

## Meaningful verification

Test behavior through block interfaces and full workflow scenarios:

- A plausible optimization passes protected checks and reaches measurement.
- A patch outside the allowlist is rejected before remote execution.
- A green pipeline with missing tests is rejected.
- Shards cover the required test inventory without unintended omissions.
- Cold/warm caches remain isolated between candidates and baselines.
- A noisy or insufficient sample produces an inconclusive result.
- Reviewer approval cannot override failed correctness or acceptance checks.
- Interrupted remote submission reconciles by correlation ID and commit.
- Model or CI failures preserve evidence and respect retry/cycle limits.
- Exhausted or uncertain budget prevents another dispatch.
- A no-change workload can finish without manufacturing a patch.
- Reports point to the exact inputs and observations used for the decision.

Use network-independent adapters for routine tests. Separately label live smoke
tests and evaluations; passing a simulated GitHub adapter is not evidence of a
working live integration. Validate actual model response shapes before relying
on provider adapters.

## Measurement decisions to resolve before evaluation

Choose and document exact timestamps for elapsed time and job seconds, valid
pair criteria, treatment of retries/cancellations, comparison statistic, and
uncertainty calculation. Define separate cold/warm objectives and verify cache
state. Keep these rules fixed across agent and rules-based results.

Pilot five pairs to assess noise and execution cost. The agreed 10% primary
improvement and 5% secondary regression limits remain configurable defaults.
If five pairs cannot support a decision, mark it inconclusive; any additional
runs must fit the declared plan and remaining budget. Do not tune thresholds
after seeing held-out results.

## Demo and handover

Provide commands for running a block, starting an experiment, inspecting status,
resuming, cancelling, and opening the detailed report. Final command names are
an implementation choice; all should share the same recorded run identity.

The default summary should take only a few lines. The full demo should let a
reviewer trace a hypothesis through a patch, protected checks, actual CI runs,
measurements, and a final decision. Include an unsuccessful example and explain
what the system could not establish.

Record implementation time, cumulative spending, missing scope, and known
limitations at handover. A completed demo is not a claim of production adoption
or general optimization ability beyond the evaluated workloads.
