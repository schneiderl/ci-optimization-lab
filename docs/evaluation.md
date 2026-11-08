# Evaluation design

The frozen matrix compares unchanged pipelines, the documented rules optimizer, and the three-role agent workflow under the same correctness and measurement rules. Cache fixtures have separate cold and warm groups. Partition fixtures include job startup and total job seconds. A one-test cached workload provides a reasoned no-change case.

`evaluation/freeze.json` pins five manifests and their target commits before model evaluation. Two variants alter test counts and work amounts and are marked held out. They were not used to tune prompts. The sole implementer knows their construction, so this is model-context hold-out, not a blind independent study. No separate human evaluator authored the hidden variants. Agents receive protected requirements and pipeline evidence, never the evaluation comparator definition or intended fix.

Rule v1 first enables cache if disabled. Otherwise it divides at least eight tests into two alternating partitions when the manifest permits two jobs. Otherwise it returns a reasoned no-change. It does not claim optimality and cannot bypass deterministic gates. The unchanged strategy gathers five baseline observations without a patch. Each candidate strategy gathers its own five paired observations; results never reuse a favorable control sample across strategies.

`evaluation/live-plan.json` records provider selection, limits, four-way concurrency, immutable generic run IDs, and the full matrix before collection. `npm run evaluate -- --live` executes or resumes it. `npm run evaluate` rebuilds the result table and public evidence copies from durable runs. Failed attempts remain explicit and cannot turn into accepted results through a reviewer recommendation.

Read [RESULTS.md](../evaluation/RESULTS.md) for measured outcomes. Real API availability, malformed provider responses, blocked authentication, and inconclusive or rejected measurements are part of the evaluation. The report separates live CI, live models, and recorded agent responses. The first smoke used recorded roles with live CI and is labeled accordingly.

## Source provenance and revalidation

The original matrix was collected during implementation through the first source freeze `48b4fd5`. Exact per-dispatch controller source was not recorded; all target workflows, protected files, tests, and target commits were pinned. An independent review found seven boundary/recovery defects. Original failures and measurements remain unchanged. `scripts/revalidate.ts` checks the saved artifact digests, target protection, execution evidence, and stricter acceptance rule without dispatching or calling a model. Its separate audit records the corrected source and whether each original outcome remains valid. Original CI/model smoke results are not relabeled as execution of newer source.
