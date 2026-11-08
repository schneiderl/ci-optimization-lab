# Implementation preflight

Checked 2026-11-08. Lab: `/home/schneider/work/ci-optimization-lab`, public GitHub `schneiderl/ci-optimization-lab`. Target: independent sibling `/home/schneider/work/ci-lab-target-workloads`, public GitHub `schneiderl/ci-lab-target-workloads`. GitHub CLI authenticated as `schneiderl` with repository administration/push access. Effective commit identity: Lucas Schneider, casdpa@gmail.com. The jobs repository was not edited.

Local Node was 26.12.0 and npm 11.20.0. Runtime target is Node 24+, with CI on major 24. Current npm metadata selected TypeScript 7.0.2, Zod 4.6.7, tsx 4.23.15, YAML 2.9.1, and Node types 26.6.6. Exact packages and transitives are locked. Action major-v4 refs were resolved through GitHub metadata and pinned by commit in workflows. Runner images and Node major patch releases remain upstream-managed and are recorded in execution reports.

The public standard-runner policy establishes $0 compute. Larger runners are billed and excluded. Billing usage lookup returned 404 with a missing user scope; the implementation did not expand token privileges. Small report artifacts use one-day retention and a conservative ledger charge bound. Cache usage is separated by repo, side, condition, pair/prime, partition, and lock hash.

OpenCode 2.2.6 listed free models, but two explicit free models returned a free-limit error. Jev's Decisions API and the explicit free OpenRouter generative model each passed a tiny live call. Initial `op whoami` and later diagnostics reported not signed in; successful intervening lookups do not establish durable authentication. The authorized credential cache avoids repeated prompts; inability to capture the item remains explicit until a key is supplied through the supported mechanism.

Implementation target: 30 focused hours; no scope was silently removed to meet it. This delivery records actual duration and unresolved checks in `docs/handover.md`. The approved spec and plan remain the source of acceptance requirements.
