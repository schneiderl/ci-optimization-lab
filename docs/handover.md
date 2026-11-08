# Handover

The lab and target are published and checked. [Independent scoped review](../evidence/independent-review.md) passed with no remaining actionable blocker. Formal live-agent acceptance remains incomplete. No candidate established the configured speedup; the project reports that result without changing its thresholds.

Source freeze: `c7f9d1f080d334ec37172587d4b6b5945fc0e19e`. The first source freeze was `48b4fd5`; independent review found seven actionable boundary and recovery issues, then two adjacent cancellation gaps. The corrected source adds regression coverage for the original seven and the cancellation follow-ups. Type checking, 33 tests, checked block examples, build, and [GitHub CI](https://github.com/schneiderl/ci-optimization-lab/actions/runs/42523518280) pass. The target's independent main is `2b0521a647a0dda42e9c99d14714b7810276c5a0`, with [passing CI](https://github.com/schneiderl/ci-lab-target-workloads/actions/runs/42519798776).

The [matrix](../evaluation/RESULTS.md) contains 21 entries: eight no-change, six rejected candidates with five valid pairs each, and seven live-agent failures. Both cache conditions and both partition variants ran on real GitHub Actions. Held-out cases, unchanged baselines, the rules comparator, actual failures, and raw CI links are included. The [final audit](../evaluation/revalidation.json) checked all 21 runs and 131 observations without dispatching again; every protected check passed and every decision stayed unchanged.

Known reported model spend is `$0.000166656`. Conservative cumulative exposure, including unresolved reservations and storage bounds, is `$0.264166656`, beneath the $30 ceiling. Public standard-runner compute is free under checked GitHub terms. Invoice/billing usage access was unavailable; these figures distinguish actual model usage from bounds. See the [ledger](../evidence/final-budget.json).

Work began at `2026-11-08T20:10:41.018000+00:00`. Recorded elapsed wall time at handover is 59.2 minutes; this is not audited human focused time. The 30-hour implementation plan was a ceiling. [Milestones](../evidence/milestones.json) record source and evaluation freezes.

## Remaining acceptance and limits

Six live-agent entries could not fetch credentials; one failed on malformed generative output. Initial Jev and free generative smoke calls succeeded, but there is no completed live three-role experiment. The original malformed-output trial did not retain its raw response or token usage; that missing evidence cannot be recovered or represented as known. Corrected calls persist known usage before validating output and include invalid-call receipts in reports.

OpenCode's two selected free models returned free-limit errors. Its successful finish/usage/model-identity path is tested with synthetic interfaces; successful live OpenCode behavior remains unverified. There is no paid fallback. The authorized credential cache, concurrent lookup lock, permission checks, and atomic refresh pass synthetic tests. Real capture remains blocked by runtime authentication, no API key was cached, and automatic repeat prompts are suppressed. No master password or credential value was printed or committed.

A new live-agent run requires an available authorized credential and valid generative responses. It must use a new recorded plan/run identity rather than overwrite these trials. No further auth retries were attempted. A reasoned no-change recommendation does not prove optimality; this controlled benchmark does not establish production adoption or general optimization ability.

Original target workflow/test code and commits are pinned. Exact per-dispatch controller source was not recorded during development. New-source validation is reported separately and does not relabel older probes as new execution. Final independent live-runner and execution-validator CLI modes are available; the final evaluation reused verified observations instead of issuing unnecessary new CI runs.

The implementation uses a narrow declarative CI plan and a limited step registry. It is not a general arbitrary-workflow sandbox. Shared-runner noise, second-resolution timestamps, and five-sample assumptions limit statistical conclusions. Application code, tests, assertions, dependency locks, execution reporting, and workflow commands remain protected. The jobs repository was not edited by this implementation worker.
