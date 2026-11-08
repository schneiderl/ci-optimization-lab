# Live evaluation

Frozen plan: [live-plan.json](live-plan.json). Raw results: [results.json](results.json). Ratios below 1 favor the candidate. Acceptance requires both uncertainty bounds, preserved correctness, and reviewer approval. A no-change judgment does not prove optimality.

| Run | Fixture | Cache group | Strategy | Outcome | Observations | Elapsed ratio | Job-seconds ratio |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| agent2-003 | cache | cold | agent | failed | 0 | — | — |
| agent2-006 | cache | warm | agent | failed | 0 | — | — |
| agent2-009 | partition | warm | agent | failed | 0 | — | — |
| agent2-012 | no-change | warm | agent | failed | 0 | — | — |
| agent2-015 | cache-heldout | cold | agent | failed | 0 | — | — |
| agent2-018 | cache-heldout | warm | agent | failed | 0 | — | — |
| agent2-021 | partition-heldout | warm | agent | failed | 0 | — | — |

Each run has its patch, protected checks, raw observations, model usage, CI URLs, and limitations under the matching `evidence/` directory. Failed and inconclusive experiments remain in the results. Standard public runner compute is free; the shared ledger tracks actual model spend and conservative artifact-storage bounds. See [measurement rules](../../docs/measurement.md).
