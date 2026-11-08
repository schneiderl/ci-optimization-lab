# Evidence index

- [Original matrix and raw results](../evaluation/RESULTS.md): 21 entries, including every failed attempt.
- [Final validation of original data](../evaluation/revalidation.json): 21 runs and 131 observations; protected checks pass and decisions remain unchanged.
- [Independent review](independent-review.md): final scoped pass, all original defects and cancellation follow-ups checked.
- [Final verification and limits](final-verification.json): source, checks, CI links, actual known model spend, and conservative budget exposure.
- [Final cumulative ledger](final-budget.json): all dispatch/model reservations, including unsuccessful attempts.
- [Live dispatch reconciliation](live-reconciliation.json): real submission, controlled interruption, one matched run, no redispatch.
- [Model smoke receipts](model-smoke/): live Jev and free generative successes, plus OpenCode free-limit failures.
- [GitHub smoke with recorded roles](smoke-cache/): five real pairs; rejected. This is not live-agent performance.
- [Recorded full demo](recorded-demo/): three roles and five simulated pairs; final outcome remains inconclusive.
- [Implementation timing](milestones.json): recorded wall-clock milestones and remaining scope.

Every `eval-*/` directory contains original reports, artifact digests, model receipts, and dispatch intents. Original observations and failed trials were not rewritten by the corrected validator. Exact target commits are recorded throughout. Original per-dispatch controller source was not recorded; the final audit names its source separately. No accepted performance improvement or complete live-agent evaluation is claimed.
