# Experiment eval-014

Outcome: **rejected**. 

Strategy: rules. Runner: github. Model provider: recorded.


## Decision

The observed mean ratios miss at least one configured threshold.

Primary ratio: 1.0801851873035635; one-sided 95% upper bound: 1.2357649856916817.
Secondary ratio: 1.0899250784383827; upper bound: 1.2646581379567405.

## Evidence

The [machine-readable report](report.json) includes exact hypotheses, validation checks, raw observations, prime runs, CI URLs, model identities, costs, failed attempts, and review concerns. Every block has a versioned envelope and digest-verified input/output references. The [candidate patch](candidate.patch) identifies its baseline and candidate commits in report.json.

Acceptance rule: paired-log-t95-v1; primary improvement >=10%, secondary regression <=5%, five complete pairs. See docs/measurement.md for the frozen uncertainty rule.

## Limits

Five samples assume independent log ratios and may not characterize shared-runner tails. Queue time is excluded from elapsed execution and recorded separately. Job seconds are a compute proxy, not a billing claim. Controlled plans and protected execution code narrow the attack surface; validation is not a proof against arbitrary malicious GitHub infrastructure. A no-change recommendation does not prove optimality. Cumulative budget entries include conservative storage bounds, not audited invoices.
