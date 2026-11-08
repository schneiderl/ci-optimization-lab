# Experiment agent3-012

Outcome: **failed**. [
  {
    "code": "invalid_value",
    "values": [
      "approve",
      "reject",
      "more-evidence"
    ],
    "path": [
      "recommendation"
    ],
    "message": "Invalid option: expected one of \"approve\"|\"reject\"|\"more-evidence\""
  },
  {
    "expected": "array",
    "code": "invalid_type",
    "path": [
      "concerns"
    ],
    "message": "Invalid input: expected array, received undefined"
  },
  {
    "expected": "string",
    "code": "invalid_type",
    "path": [
      "explanation"
    ],
    "message": "Invalid input: expected string, received undefined"
  },
  {
    "expected": "array",
    "code": "invalid_type",
    "path": [
      "evidence"
    ],
    "message": "Invalid input: expected array, received undefined"
  },
  {
    "expected": "boolean",
    "code": "invalid_type",
    "path": [
      "requestExperiment"
    ],
    "message": "Invalid input: expected boolean, received undefined"
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "invalidProviderOutput"
    ],
    "path": [],
    "message": "Unrecognized key: \"invalidProviderOutput\""
  }
]

Strategy: agent. Runner: github. Model provider: jev-openrouter-free.


## Decision

No accepted measured candidate.

Primary ratio: unavailable; one-sided 95% upper bound: unavailable.
Secondary ratio: unavailable; upper bound: unavailable.

## Evidence

The [machine-readable report](report.json) includes exact hypotheses, validation checks, raw observations, prime runs, CI URLs, model identities, costs, failed attempts, and review concerns. Every block has a versioned envelope and digest-verified input/output references. The [candidate patch](candidate.patch) identifies its baseline and candidate commits in report.json.

Acceptance rule: paired-log-t95-v1; primary improvement >=10%, secondary regression <=5%, five complete pairs. See docs/measurement.md for the frozen uncertainty rule.

## Limits

Five samples assume independent log ratios and may not characterize shared-runner tails. Queue time is excluded from elapsed execution and recorded separately. Job seconds are a compute proxy, not a billing claim. Controlled plans and protected execution code narrow the attack surface; validation is not a proof against arbitrary malicious GitHub infrastructure. A no-change recommendation does not prove optimality. Cumulative budget entries include conservative storage bounds, not audited invoices.
