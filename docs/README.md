# Croki documentation map

This map prevents historical implementation packages and design explorations from becoming accidental
product direction. Authority is domain-specific rather than a winner-takes-all ranking; disagreements must
be surfaced and reconciled.

## Authority

- [`FIRM-SPEC.md`](FIRM-SPEC.md) governs durable Product and build physics.
- [`../DESIGN.md`](../DESIGN.md) governs the intended Electron desktop experience within those laws.
- [`STATE.md`](STATE.md) reports only what the current tree proves, plus known gaps and legacy behavior.
- [`../AGENTS.md`](../AGENTS.md) governs repository operating boundaries, platform constraints, and commands.

None is a general override for the others. A current limitation in `STATE.md` does not weaken a requirement;
a design intention cannot claim proof; an operating instruction cannot silently redefine Product law.

## Current translations

- [`../README.md`](../README.md) — repository entry and local start.
- [`../PRODUCT.md`](../PRODUCT.md) — compact product contract.
- [`FEATURES-AND-VALUE.md`](FEATURES-AND-VALUE.md) — consequence-led capability and value hypotheses.
- [`VISION.md`](VISION.md) — destination and proof standard.
- [`EVALS.md`](EVALS.md) — evaluation and readiness criteria; reconcile when implementation changes.
- [`DISTRIBUTION.md`](DISTRIBUTION.md) — dated source/package delivery mechanics.
- [`../RUN.md`](../RUN.md) — durable resume and run-verification contract.
- [`../ui/README.md`](../ui/README.md) — interface projection and platform contract.
- [`design/DESIGN.md`](design/DESIGN.md) — current-code visual-system record, subordinate to root `DESIGN.md`.
- [`design/INDEX.md`](design/INDEX.md) — curated authority/adoption/history index for retained design evidence.
- [`design/PRODUCTION-FOUNDER-SCRIPT.md`](design/PRODUCTION-FOUNDER-SCRIPT.md) — outside-founder proof protocol;
  it is not implementation proof.

These files compress the authorities for a narrower audience. If one drifts, fix it; the disagreement is
not a product option.

## Historical and design evidence

Files under `docs/design/`, `docs/history/`, `harness/`, `gtm-graph/`, `production-direction/`, and completed
or superseded `firm-build/` packages are evidence unless an authority file explicitly adopts a decision.
They may explain why a rail exists, but cannot supply current product nouns, workflows, acceptance criteria,
or implementation tasks.

The current approved direction supersedes prior Atlas-first, Now/direction-first, immersive, legacy
triptych, experiment-machine, configurable-firm, permanent-AI-staff, ambient-loop, workflow-builder,
Signal→Pipeline→Campaign→Outcome, fixed-pipeline-lane, release-manager, and release-as-universal-market-unit
interpretations. Useful mechanics—one canonical model, provisional structure, direct manipulation, spatial
focus, exact receipts, provider provenance, founder authority, no default DAG—must be folded into authority
before use.

Historical documents should receive explicit superseded/non-authoritative banners as their replacement
coverage lands. Git history is the archive; do not maintain a corrected parallel product specification.

## Proposals and explorations

An explicitly labeled proposal or exploration may challenge the spec, but changing direction requires
amending `FIRM-SPEC.md`, then reconciling root `DESIGN.md`, `STATE.md`, and every current translation. Customer
examples never redefine Croki as customer-specific.

## Compatibility identifiers

Do not rename `gtm-ide`, `channel`, `bet`, `fork`, or `~/.gtm-ide` as incidental cleanup. They may remain in
source, storage, routes, migrations, tests, and historical receipts until an intentional migration proves
safe. They are not product identity or required founder vocabulary.
