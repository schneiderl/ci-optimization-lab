# Experiment smoke-cache

Outcome: **rejected**. 

Strategy: agent. Runner: github. Model provider: recorded.


The three agent roles used recorded responses. This is orchestration evidence, not live agent performance.

## Decision

The observed mean ratios miss at least one configured threshold.

Primary ratio: 0.9272088346428983; one-sided 95% upper bound: 1.1764921162937068.
Secondary ratio: 0.9350280594279405; upper bound: 1.215971329496968.

## Evidence

The [machine-readable report](report.json) includes exact hypotheses, validation checks, raw observations, prime runs, CI URLs, model identities, costs, failed attempts, and review concerns. Every block has a versioned envelope and digest-verified input/output references. The [candidate patch](candidate.patch) identifies its baseline and candidate commits in report.json.

Acceptance rule: paired-log-t95-v1; primary improvement >=10%, secondary regression <=5%, five complete pairs. See docs/measurement.md for the frozen uncertainty rule.

## Limits

Five samples assume independent log ratios and may not characterize shared-runner tails. Queue time is excluded from elapsed execution and recorded separately. Job seconds are a compute proxy, not a billing claim. Controlled plans and protected execution code narrow the attack surface; validation is not a proof against arbitrary malicious GitHub infrastructure. A no-change recommendation does not prove optimality. Cumulative budget entries include conservative storage bounds, not audited invoices.
