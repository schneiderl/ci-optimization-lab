# Independent validation

**PASS** at source `c7f9d1f080d334ec37172587d4b6b5945fc0e19e`. No remaining actionable blocker in the requested review scope. The independent reviewer made no source edits, started no additional agents, and used isolated fixtures and synthetic credentials. It made no real credential request, paid model call, or remote dispatch.

Independent type checking, all 33 tests, documentation checks, and build passed. All six recorded CLI blocks, independently selected GitHub runner and replay through fake GitHub CLI, and execution validation passed. Omitting a protected test was rejected.

The review first found seven defects: unchecked cached observation identity, mixed measurement groups, unresolved dispatch cancellation, destructive credential refresh, incomplete experiment budget accounting, lost usage on invalid output, and missing OpenCode completion/usage evidence. Each received a regression test and passed adapted independent probes.

Expanded cancellation review found two adjacent gaps and verified their fixes:

- Already-aborted requests: zero APIs and zero dispatches.
- Abort after either repository or permissions preflight: zero dispatches, reservations, or cancel commands.
- Abort after reservation or while recording intent: zero dispatches; reservation reconciled to zero. Known unsubmitted cancellation stayed unambiguous.
- Actual submission followed by cancellation before remote visibility: durable pending state; resume cancelled the original run exactly once. Repeated resume did not submit or cancel again.
- Standalone CLI cancellation recovery: one fake cancel command and zero dispatch commands; repeated `github` and `github-reconcile` calls returned a versioned cancellation result without coordinator state/config.

Replay binds request, plan, manifest, and observation. The five-pair evaluator requires one cache group and common pins. Model and CI allowances are shared across recovery. Failed refresh preserves the old credential. Known usage survives invalid JSON/schema output. OpenCode requires explicit finish/usage and matching session-export model identity.

The review does not establish actual credential capture or a completed live three-agent experiment. Those remain unverified. Saved-data revalidation is reported separately; it does not relabel older live controller execution as newer source.
