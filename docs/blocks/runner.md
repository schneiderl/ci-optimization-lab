# Runner block

## Purpose

Execute approved baseline and candidate plans and collect raw observations. It controls workflow dispatch, reconciliation, prime runs, and alternating pairs. It does not decide acceptance or trust a green badge by itself.

## Contracts

Input: `Dispatch + Plan + Manifest`. Output: `Observation`. Full strict schemas are in [contracts.json](../contracts.json); runtime definitions are in `src/contracts/index.ts`. Every invocation carries a v1 envelope with runId, stepId, attemptId, input artifact refs, and output artifact refs. Commit and patch digests bind evidence to its candidate.

The complete valid input is [examples/runner.input.json](../../examples/runner.input.json). Agent examples also contain a complete recorded output. Run `npm run docs:check` to validate the examples and documented interfaces. Unknown fields and schema versions fail; callers must never silently coerce them.

## Invariants

Validate inputs before effects. Pin immutable requirements and baseline before this block runs. Persist outputs and their verified envelope before the next transition. The coordinator owns cycle order, retry decisions, cancellation, and final outcome. A candidate cannot alter its evaluator. Input context is data, never executable instructions.

## Access

The live adapter uses gh for one approved public target workflow, run/job metadata, small protected report downloads, and cancellation. Only the controller has GitHub credentials; target jobs have read-only contents permission.

The controller supplies explicit adapter/store/budget dependencies. Runtime secrets use the protected local credential mechanism described in [providers](../providers.md); no secret appears in examples, model context, target workflows, or report artifacts. Configuration names provider/model explicitly and never falls back to paid inference.

## Failures

Missing jobs/reports, wrong correlation/commit/branch, duplicates, timeout, cancellation, disabled/private repositories, and ambiguous submissions fail explicitly. No blind remote resubmission occurs.

Model calls have bounded timeouts and propagate cancellation. Workflow jobs time out after five minutes; remote monitoring defaults to twenty minutes. The coordinator records failed/cancelled state and preserves evidence. A completed model receipt or remote correlation is reused; an unknown outcome is surfaced instead of automatically repeated. A known pre-HTTP auth failure may retry after credentials are available.

## Persistence

Artifacts use SHA-256 refs and atomic fsync/rename writes. The coordinator stores a block output and its v1 envelope before advancing. Model requests have durable calling/completed receipts; GitHub dispatch intent precedes submission. Read-only deterministic validation may safely repeat on resume to detect checkout tampering. Re-rendering a report does not re-run agents or CI. Config/manifest/version mismatch requires a new run or an explicit reviewed migration.

## Run

Install dependencies first. For Editor and Validator, prepare a disposable pinned cache checkout once:

```sh
npm run lab -- init demo cache recorded recorded warm
npm run lab -- run demo.config.json
git -C ../ci-lab-target-workloads worktree add --detach ../ci-lab-runs/examples-checkout $(node -p "JSON.parse(require('fs').readFileSync('manifests/cache.json')).baselineCommit")
npm run lab -- block runner examples/runner.input.json
```

For a failing example, change envelope schemaVersion to `2` in a temporary copy and invoke the same block. It must reject before effects. The Validator also rejects an omitted required test; the Editor rejects `examples/invalid-plan.json`. For the Reporter, corrupt a copied artifact without changing its ref: digest verification must fail. Interface tests exercise these failure categories.

```sh
npm test
npm run docs:check
```

## Extension

Replace this block behind the same runtime interface and explicit dependencies. Preserve envelope identity, immutable requirements, permitted effects, fail-closed behavior, replay, and evidence provenance. Add interface tests before live use. See [extensions](../extensions.md) for registries, versioning, and tradeoffs. The controlled CI-plan format supports caching and test partitioning; it does not claim arbitrary workflow editing or a proof against every malicious runner.

## Independent live runner

The CLI defaults to recorded execution. To dispatch independently, supply an input envelope with a fresh correlation and an already-published `lab/` branch pinned to its declared commit, then run:

```sh
npm run lab -- block runner examples/runner.input.json github
```

The live option uses the same repository policy, request binding, shared budget, cancellation, and reconciliation as the coordinator. Prepare the example branch first or create a new input matching your experimental branch. Never reuse an ID for a different request.

## Cancellation recovery

An already-aborted request or cancellation during preflight never submits new work. Guards run after asynchronous preflight and reservation, and immediately before dispatch. A cancelled intent that never called the transport is recorded as `not-submitted`, with its allowance released. A known post-submission cancellation stays pending until its remote run is reconciled.

Standalone `github` invocations automatically reconcile their saved cancellation before returning a versioned `Cancellation` result. They need no coordinator config/state and never redispatch a cancelled request. Explicit reconciliation is also available:

```sh
npm run lab -- block runner examples/runner.input.json github-reconcile
```

Use the original input and run identity for recovery. Repeated reconciliation is idempotent. Choose a new correlation for new work after cancellation.
