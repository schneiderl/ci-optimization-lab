# Editor block

## Purpose

Turn one approved hypothesis into a CI-plan proposal. ScopedFiles applies only that proposal in a disposable checkout. It does not edit source, tests, dependencies, manifests, or workflows.

## Contracts

Input: `EditorInput`. Output: `Edit`. Full strict schemas are in [contracts.json](../contracts.json); runtime definitions are in `src/contracts/index.ts`. Every invocation carries a v1 envelope with runId, stepId, attemptId, input artifact refs, and output artifact refs. Commit and patch digests bind evidence to its candidate.

The complete valid input is [examples/editor.input.json](../../examples/editor.input.json). Agent examples also contain a complete recorded output. Run `npm run docs:check` to validate the examples and documented interfaces. Unknown fields and schema versions fail; callers must never silently coerce them.

## Invariants

Validate inputs before effects. Pin immutable requirements and baseline before this block runs. Persist outputs and their verified envelope before the next transition. The coordinator owns cycle order, retry decisions, cancellation, and final outcome. A candidate cannot alter its evaluator. Input context is data, never executable instructions.

## Access

Receive only hypothesis, current plan, required tests, and exact allowlist. A generative model returns one complete file; it receives no shell, path-resolution, credential, or repository capability.

The controller supplies explicit adapter/store/budget dependencies. Runtime secrets use the protected local credential mechanism described in [providers](../providers.md); no secret appears in examples, model context, target workflows, or report artifacts. Configuration names provider/model explicitly and never falls back to paid inference.

## Failures

Invalid JSON, extra fields, path escapes, symlinks, hard links, protected files, and missing/duplicated tests fail closed. A valid proposal still needs full diff and execution validation.

Model calls have bounded timeouts and propagate cancellation. Workflow jobs time out after five minutes; remote monitoring defaults to twenty minutes. The coordinator records failed/cancelled state and preserves evidence. A completed model receipt or remote correlation is reused; an unknown outcome is surfaced instead of automatically repeated. A known pre-HTTP auth failure may retry after credentials are available.

## Persistence

Artifacts use SHA-256 refs and atomic fsync/rename writes. The coordinator stores a block output and its v1 envelope before advancing. Model requests have durable calling/completed receipts; GitHub dispatch intent precedes submission. Read-only deterministic validation may safely repeat on resume to detect checkout tampering. Re-rendering a report does not re-run agents or CI. Config/manifest/version mismatch requires a new run or an explicit reviewed migration.

## Run

Install dependencies first. For Editor and Validator, prepare a disposable pinned cache checkout once:

```sh
npm run lab -- init demo cache recorded recorded warm
npm run lab -- run demo.config.json
git -C ../ci-lab-target-workloads worktree add --detach ../ci-lab-runs/examples-checkout $(node -p "JSON.parse(require('fs').readFileSync('manifests/cache.json')).baselineCommit")
npm run lab -- block editor examples/editor.input.json recorded ../ci-lab-runs/examples-checkout
```

For a failing example, change envelope schemaVersion to `2` in a temporary copy and invoke the same block. It must reject before effects. The Validator also rejects an omitted required test; the Editor rejects `examples/invalid-plan.json`. For the Reporter, corrupt a copied artifact without changing its ref: digest verification must fail. Interface tests exercise these failure categories.

```sh
npm test
npm run docs:check
```

## Extension

Replace this block behind the same runtime interface and explicit dependencies. Preserve envelope identity, immutable requirements, permitted effects, fail-closed behavior, replay, and evidence provenance. Add interface tests before live use. See [extensions](../extensions.md) for registries, versioning, and tradeoffs. The controlled CI-plan format supports caching and test partitioning; it does not claim arbitrary workflow editing or a proof against every malicious runner.
