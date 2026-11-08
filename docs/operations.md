# Operations

Install Node 24+, Git, npm, GitHub CLI, and optional OpenCode and 1Password CLI. Clone the lab and target into sibling directories. Use `npm ci`, then the checks in the README. `npm run fixtures` is a one-time fixture authoring tool; it refuses to overwrite an existing target. Normal users clone the published target and use the frozen manifests.

## Configuration

`npm run lab -- init <id> <fixture> <provider> <runner> <cold|warm>` writes a strict v1 config. Run it with `npm run lab -- run <config>`. The fixture is `cache`, `partition`, `no-change`, `cache-heldout`, or `partition-heldout`. Run IDs are immutable. Run data defaults to the sibling `../ci-lab-runs`, outside target worktrees. Configure paths before the first run; resume rejects changed configs or manifests.

`status <run-dir>` prints the current phase. `resume <run-dir>` reuses verified artifacts and reconciles remote submissions. `cancel <run-dir>` creates a cancellation marker; a running coordinator watches it and requests cancellation of its current GitHub run. SIGINT/SIGTERM in the CLI also cancel through the supplied signal. For an interrupted evaluator process, resume with `npm run evaluate -- --live`; completed calls and known workflows remain durable.

`report <run-dir>` regenerates the full report and patch from persisted records. JSON includes raw observations and exact evidence references. The default terminal summary remains short. Experimental target branches are never merged automatically.

## Recovery

One process owns each run. A stale run lock whose owner PID is dead is reclaimed; an uncertain or live owner is refused. Budget and concurrency mutexes fail closed if a machine dies while holding them. Inspect owner/process state before removing a stale mutex. CI slot files identify correlation and PID; resume the same run to reconcile its remote workflow before removing an orphaned slot. Do not delete records to force a model call or dispatch retry.

A model receipt marked calling or failed-or-ambiguous blocks automatic paid replay. A clearly failed credential lookup occurred before HTTP submission and can retry after credentials are cached. Other invalid/provider failures remain explicit. Cancellation checks also run before and after asynchronous preflight/reservation and immediately before submission; known unsubmitted work releases its allowance without an ambiguous intent. Standalone runner blocks automatically reconcile saved cancellation, or accept the explicit `github-reconcile` mode. Cancellation during dispatch discovery persists `cancelling` and a cancel-pending intent. Resume reconciles the exact remote run and confirms completion before recording terminal `cancelled`; it never redispatches. A GitHub intent without a matching visible run is ambiguous after a bounded visibility wait and is never blindly resubmitted. Matching title with a different commit/branch, or multiple matching runs, fails closed.

## Budget and service limits

All runs sharing a data root use one ledger capped at $30. Each run also has one shared per-experiment allowance covering model and CI reservations together, including across recovery. Reservations precede model calls and dispatches. Unknown prices are refused. Jev is bounded at $0.02 per decision; explicit free generative calls reserve $0. No paid model fallback exists. Standard public Ubuntu compute is independently free under the [GitHub terms checked during preflight](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Private or disabled targets and larger/custom runners are refused.

Each workflow stores at most four small execution reports with one-day retention. Dispatch reservations charge a conservative $0.001 storage upper bound per workflow to the ledger; this is not an audited invoice. Cache storage stays beneath the per-repository free allowance and uses disposable namespaced keys. The implementation's five fixture variants, complete matrix, failed attempts, and comparator runs share this budget. Billing usage endpoints lacked the token's user scope during preflight; the public standard-runner terms establish compute pricing independently.

The evaluator limits four concurrent experiments; the GitHub adapter also coordinates request slots across processes sharing its data root. Per-job workflow timeouts are five minutes; the controller defaults to a 20-minute remote timeout. Change limits only in a new recorded plan. Avoid running an extra smoke experiment concurrently with a measured matrix.

## Credential lifecycle

See [providers](providers.md). `npm run lab -- credentials` checks availability without printing the value; an environment lookup alone does not persist it. `credentials import-env` stores the environment key and verifies persisted readback without invoking 1Password. `credentials refresh` captures and validates a replacement under the shared lock, then atomically replaces the cache. A failed capture preserves the old key; the failed-lookup marker clears only after success. `credentials remove` removes this app's cached key and marker. Revoke or rotate the underlying API key in OpenRouter separately. Never commit credential files or include shell traces of credential commands in evidence.

## Separate follow-up evaluation

The original 21 trials are immutable. Run the frozen seven-entry addendum with `npm run evaluate -- --plan=evaluation/followup/live-plan.json --live`; resume with the same command. Results stay in `evaluation/followup/` and `evidence/followup/`. Use `npx tsx scripts/revalidate.ts --plan=evaluation/followup/live-plan.json` for a read-only audit. Both matrices share the original data root and cumulative $30 ledger.

Commit controller changes before live evaluation. Each new run records the executing source commit, controller file digest, and plan digest in `controller-provenance.json` before any model call or dispatch. Resume requires identical controller files and plan. Evidence publication copies this receipt alongside the report. A failed call stays in its trial; any changed implementation or provider requires a new frozen plan and run identity.
