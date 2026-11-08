# Handover

The continued live evaluation is published in the [combined index](../evaluation/CONTINUATION.md). All seven original agent cases now have completed follow-up outcomes: five no-change judgments and two rejected partition candidates. Both partition variants completed the real three-role edit path, protected validation, five paired GitHub measurements, and live review. Cache agent cases abstained; a complete live cache edit remains unverified. No candidate satisfied every frozen acceptance gate.

The held-out partition candidate was about 18% faster in elapsed execution but used about 26% more job seconds. The secondary regression gate correctly rejected it. The training partition candidate was also rejected. All measured protected checks passed. No tests, application code, locks, fixture manifests, role prompts, or acceptance thresholds were tuned to obtain these outcomes.

The [original matrix](../evaluation/RESULTS.md) retains its 21 entries and failures byte-for-byte. Six new frozen plans add 21 trials, including 14 explicit failures. New attempts retain metadata-preflight failures, malformed responses, incorrect edits, truncation, and a provider HTTP 429. They do not overwrite or relabel earlier trials. Repeated provider-selection follow-ups are not independent fresh held-out replications.

## Source and verification

The last controller source change is `f039815e248dc5c6863d89677171ad39d83a56fb`. Later commits freeze plans with identical controller files. Each new run's `controller-provenance.json` records the exact executing commit and source/plan digests before remote effects. Type checking, 37 tests, six checked block examples, docs checks, and build pass. Fresh independent review of this continuation is pending. The [previous independent review](../evidence/independent-review.md) remains valid for its stated c7f9d1f scope; it is not a review of the new source.

The six addendum audits verified 87 protected observations and unchanged outcomes without dispatching again. The original audit covers 131 observations. [Preservation hashes](../evidence/original-preservation.json) verified all 430 original files. The independent target main remains `2b0521a647a0dda42e9c99d14714b7810276c5a0`; experimental branches were not merged.

## Credentials, providers, and budget

Real `credentials import-env` persisted the authorized environment key under the shared lock and verified stored readback. A later probe removed the environment and read the persisted Secret Service cache successfully. No 1Password call, password, or credential value was printed or published. Plain `credentials` now reports availability accurately; environment lookup alone does not claim persistence. [Verification](../evidence/credential-verification.json).

The Jev adapter now bounds price with each endpoint's advertised context length. Optional generative reasoning is disabled when metadata allows it, and advertised structured output is requested. Strict output and CI validation continue to reject bad suggestions. Every model choice is explicit and verified free where required; no paid fallback exists. A fresh isolated free OpenCode tiny task failed explicitly; its receipt and diagnostic are retained. Successful live OpenCode behavior remains unverified. [OpenCode receipt](../evidence/continuation-opencode/result.json).

Known cumulative reported model spend is `$0.003264660`. Conservative cumulative exposure is `$0.494264660`, beneath the $30 ceiling, with unresolved reservations and storage bounds retained. Public standard-runner compute is free under the checked terms. Billing/invoice access remains unavailable. The original malformed-output trial did not retain raw response or token usage; that gap cannot be recovered. [Ledger](../evidence/final-budget.json).

## Remaining limits

Shared-runner noise, second-resolution timestamps, and five-sample assumptions limit statistical claims. A reasoned no-change judgment does not prove optimality. Agent review concerns remain in full reports and cannot override deterministic failures. The system uses a narrow declarative CI plan, not an arbitrary-workflow sandbox. The source and earlier evaluation were frozen at different development stages; new audits do not relabel historical controller execution.

The 30-hour plan is a ceiling, not audited focused time. [Milestones](../evidence/milestones.json) retain original timing and the continuation. The jobs repository was not edited.
