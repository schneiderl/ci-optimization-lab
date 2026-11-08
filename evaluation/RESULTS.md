# Live evaluation

Frozen plan: [live-plan.json](live-plan.json). Raw results: [results.json](results.json). Ratios below 1 favor the candidate. Acceptance requires both uncertainty bounds, preserved correctness, and reviewer approval. A no-change judgment does not prove optimality.

| Run | Fixture | Cache group | Strategy | Outcome | Observations | Elapsed ratio | Job-seconds ratio |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| eval-001 | cache | cold | unchanged | no-change | 5 | — | — |
| eval-002 | cache | cold | rules | rejected | 10 | 1.072 | 1.061 |
| eval-003 | cache | cold | agent | failed | 0 | — | — |
| eval-004 | cache | warm | unchanged | no-change | 5 | — | — |
| eval-005 | cache | warm | rules | rejected | 10 | 1.093 | 1.080 |
| eval-006 | cache | warm | agent | failed | 0 | — | — |
| eval-007 | partition | warm | unchanged | no-change | 5 | — | — |
| eval-008 | partition | warm | rules | rejected | 10 | 0.938 | 1.426 |
| eval-009 | partition | warm | agent | failed | 0 | — | — |
| eval-010 | no-change | warm | unchanged | no-change | 5 | — | — |
| eval-011 | no-change | warm | rules | no-change | 5 | — | — |
| eval-012 | no-change | warm | agent | failed | 0 | — | — |
| eval-013 | cache-heldout | cold | unchanged | no-change | 5 | — | — |
| eval-014 | cache-heldout | cold | rules | rejected | 10 | 1.080 | 1.090 |
| eval-015 | cache-heldout | cold | agent | failed | 0 | — | — |
| eval-016 | cache-heldout | warm | unchanged | no-change | 5 | — | — |
| eval-017 | cache-heldout | warm | rules | rejected | 10 | 0.967 | 0.946 |
| eval-018 | cache-heldout | warm | agent | failed | 0 | — | — |
| eval-019 | partition-heldout | warm | unchanged | no-change | 5 | — | — |
| eval-020 | partition-heldout | warm | rules | rejected | 10 | 1.075 | 1.608 |
| eval-021 | partition-heldout | warm | agent | failed | 0 | — | — |

Each run has its patch, protected checks, raw observations, model usage, CI URLs, and limitations under `evidence/<run-id>/`. Failed and inconclusive experiments remain in the results. Standard public runner compute is free; the shared ledger tracks actual model spend and conservative artifact-storage bounds. See [measurement rules](../docs/measurement.md).
