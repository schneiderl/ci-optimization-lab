# Extending the lab

Contracts in `src/contracts/index.ts` define v1 messages. Compatible changes preserve strict accepted shapes and semantics. Breaking changes need a new schema version, explicit migration or rejection, updated examples, and replay tests. Never reinterpret an old receipt under a different prompt, model, configuration, or protected manifest.

Each agent receives explicit context and returns a role-specific output. Replace an adapter through `Dependencies.model` without editing agents. A replacement must expose exact model identity, maximum price, structured output, usage, cancellation, and failure behavior. Add contract and replay tests before using it live. Recorded adapters are useful for development but must remain visibly simulated.

The coordinator declares the fixed initial sequence in `steps`. Optional registered extension steps run after review with explicit run/config/store dependencies. Register them in the `extensions` map; agent blocks remain unchanged. This is a narrow post-review seam, not a general workflow designer. Adding a new core phase requires explicit lifecycle and persistence changes and is outside the compatibility promise.

Objectives are independent configuration. The acceptance registry maps rule IDs to deterministic evaluators; register an implementation and document its metrics, correctness requirements, thresholds, and uncertainty policy before freezing an evaluation. New metrics or direction semantics need new runtime schemas. The initial schemas support elapsed execution and job seconds, both minimized. Future security or release objectives are outside version one.

To add a controlled workload, author protected source/tests/execution code in a separate target repo, compute expected outputs independently, enumerate all protected digests and required tests, and expose only a narrow declarative CI plan. Freeze manifests and held-out variants before model evaluation. Validate missing/duplicated tests, unauthorized edits, output mismatches, cache isolation, recovery, and reporting through block interfaces. Keep answer keys and evaluation labels out of serialized model context.
