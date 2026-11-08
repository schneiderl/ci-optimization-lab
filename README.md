# CI optimization lab

A TypeScript CLI investigates a CI pipeline, edits a protected CI plan, measures the patch on GitHub Actions, and reports the result. Three agent roles work behind deterministic correctness, budget, and acceptance gates. Target history lives in a separate public repository.

Start with [live results](evaluation/RESULTS.md), [architecture](docs/architecture.md), or the [approved specification](docs/spec.md). A rejected or inconclusive experiment is a valid result. Recorded responses demonstrate orchestration; they do not demonstrate a live agent or speedup.

## Run locally

Requires Node 24+, Git, and npm. Local tests need no account or network after installation.

```sh
npm ci
npm run check
npm test
npm run docs:check
npm run build
```

For the complete recorded demo, clone the target beside the lab:

```sh
git clone https://github.com/schneiderl/ci-lab-target-workloads.git ../ci-lab-target-workloads
npm run lab -- init demo cache recorded recorded warm
npm run lab -- run demo.config.json
npm run lab -- status ../ci-lab-runs/demo
npm run lab -- resume ../ci-lab-runs/demo
npm run lab -- report ../ci-lab-runs/demo
```

The demo exercises Investigator, Editor, Runner, Validator, Reviewer, and Reporter. Its final outcome remains inconclusive because its measurements are simulated. The report includes the exact patch, immutable inputs, checks, raw observations, and model records. Default output is four lines.

## Live experiments

Read [operations](docs/operations.md), [measurement](docs/measurement.md), and [provider details](docs/providers.md). GitHub access needs permission to push experimental branches and dispatch workflows in the public target. Target jobs use read-only permissions and no repository secrets. They run on standard `ubuntu-24.04` runners.

```sh
npm run lab -- init my-live-run cache recorded github warm
npm run lab -- run my-live-run.config.json
npm run lab -- smoke-model jev
npm run lab -- smoke-model cohere/north-mini-code:free
```

The first two commands use recorded agent decisions with real CI. For live agents, set `provider` to `jev-openrouter-free`, `model` to an explicit available zero-price model, and `perCallLimitUsd` to `0.02` in a new config before running. No automatic paid fallback exists. `npm run evaluate -- --live` resumes the published frozen matrix and preserves failed attempts; use new run IDs for a separate evaluation.

## Blocks and extension

Each block has an implementation, interface tests, complete checked examples, and [documentation](docs/blocks/). Run `npm run lab -- block investigator examples/investigator.input.json` for an independent recorded call. See [contracts.json](docs/contracts.json) for every runtime schema and [extension guidance](docs/extensions.md) for steps and objectives.

Known limits and unresolved live acceptance appear in the [handover](docs/handover.md). This controlled benchmark does not claim production adoption or general optimization ability.
