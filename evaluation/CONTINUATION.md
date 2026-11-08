# Continued live evaluation

All seven original agent cases now have a completed live follow-up outcome: five no-change judgments and two rejected partition candidates. Both partition variants ran Investigator → Editor → Runner → Validator → Reviewer with five valid pairs. Cache cases used the allowed no-change branch; they did not exercise a live cache edit or prove optimality. No candidate met all acceptance gates.

The original [21-row matrix](RESULTS.md) and its failures remain unchanged. This continuation adds 21 separately identified trials: 5 no-change, 2 rejected, and 14 failed. [Machine-readable index](continuation.json).

| Fixture | Group | Original unchanged | Original rules | Latest complete agent | Elapsed / job-seconds ratio |
| --- | --- | --- | --- | --- | --- |
| cache | cold | eval-001: no-change | eval-002: rejected | agent3-003: no-change | — |
| cache | warm | eval-004: no-change | eval-005: rejected | agent3-006: no-change | — |
| partition | warm | eval-007: no-change | eval-008: rejected | agent3-009: rejected | 1.035 / 1.536 |
| no-change | warm | eval-010: no-change | eval-011: no-change | agent4-012: no-change | — |
| cache-heldout | cold | eval-013: no-change | eval-014: rejected | agent4-015: no-change | — |
| cache-heldout | warm | eval-016: no-change | eval-017: rejected | agent4-018: no-change | — |
| partition-heldout | warm | eval-019: no-change | eval-020: rejected | agent7-021: rejected | 0.822 / 1.263 |

The held-out partition candidate reduced elapsed execution by about 18%, but increased job seconds by about 26%; the 5% secondary regression limit rejected it. The training partition candidate increased both metrics. These are measured outcomes, not accepted improvements. Every measured test inventory and expected output passed the protected checks.

## Every attempt remains visible

| Frozen plan and results | Trials | Outcomes |
| --- | ---: | --- |
| [followup](followup/RESULTS.md) | 7 | 7 failed |
| [followup-corrected](followup-corrected/RESULTS.md) | 7 | 2 no-change, 1 rejected, 4 failed |
| [followup-structured](followup-structured/RESULTS.md) | 4 | 3 no-change, 1 failed |
| [followup-coding](followup-coding/RESULTS.md) | 1 | 1 failed |
| [followup-gemma](followup-gemma/RESULTS.md) | 1 | 1 failed |
| [followup-ultra](followup-ultra/RESULTS.md) | 1 | 1 rejected |

Seven metadata-preflight failures exposed a real Jev adapter bug: context length belongs to each provider endpoint. The correction bounds each endpoint's maximum price separately. Later failures include reasoning-only truncation, schema echoes, invalid CI JSON, and an HTTP 429. Known output/token usage survives output rejection; malformed candidates never reach measurement. New source or model choices use new frozen plans and run IDs.

The original coding model returned a valid training edit but failed some held-out outputs. A structured-output model completed reviews but produced an invalid held-out edit; another explicit free model was rate-limited. The final explicit free Ultra model completed the held-out edit and review. These engineering follow-ups are not independent fresh held-out replications or evidence of general optimization ability. The fixture freeze, role prompts, protected requirements, 10%/5% thresholds, five pairs, and log-t95 rule stayed fixed. No paid or in-run provider fallback was enabled.

## Provenance, checks, and cost

Each new trial records its exact executing source commit, controller file digest, and plan digest before any model call or CI dispatch. The last controller source change is [f039815](https://github.com/schneiderl/ci-optimization-lab/commit/f039815e248dc5c6863d89677171ad39d83a56fb); later plan commits contain identical controller files. Earlier development probes retain their original provenance limits.

The six read-only addendum audits verified 87 observations and unchanged decisions. [Preservation hashes](../evidence/original-preservation.json) verify all 430 original matrix, fixture, and evidence files. Type checking, 37 tests, all six block examples, docs checks, and build pass. Fresh independent review of the continuation source is pending; the [earlier independent review](../evidence/independent-review.md) applies to c7f9d1f.

Known cumulative reported model spend is `$0.003264660`. Conservative cumulative exposure is `$0.494264660`, including unresolved reservations and storage bounds, below the $30 ceiling. Standard public-runner compute is free under the checked terms. These are not audited invoice totals; the original malformed response lacks recoverable usage. [Ledger](../evidence/final-budget.json).

The real environment credential import and persisted readback succeeded. A final probe removed the environment before reading the cache; no credential value or 1Password password was retained in evidence. [Credential verification](../evidence/credential-verification.json). OpenCode's latest isolated free smoke and exact controller provenance appear [here](../evidence/continuation-opencode/result.json).
