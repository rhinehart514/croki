# Drover run contract

**Status:** current routing and verification document. It does not define product direction or claim
implementation status.

## Resume order

1. Read `AGENTS.md` for repository invariants and platform boundaries.
2. Read `docs/FIRM-SPEC.md` for durable Product/build physics.
3. Read root `DESIGN.md` for intended desktop experience.
4. Read `docs/STATE.md` for the boundary between current proof, unproven requirements, and legacy behavior.
5. Inspect `git status` and the relevant diff. Preserve every pre-existing change unless the task explicitly
   owns it.

No independent roadmap lives here. Historical run plans are evidence only.

## Invariants for every implementation run

- Keep Drover product- and venture-agnostic, Electron-desktop-first, and local-first.
- The canvas is the main founder surface; one venture conversation and persistent scoped branches direct
  and interrogate it.
- Product and go-to-market remain permanent territories over one canonical open model.
- Work begins only from explicit founder direction or a founder-invoked workflow.
- A workflow is an outcome contract, not a default DAG, pipeline, or stage machine.
- A run records its founder direction/workflow origin, branch, scope, intended result, authority envelope,
  participants, provider/model provenance, tools/actions/outputs, cost where available, completion evidence,
  stopping condition, and world-boundary holds.
- Claude and Codex are execution identities in provenance and run inspection, not product ontology or an AI
  org chart.
- Generated structure remains provisional; facts, evidence, and interpretation remain separate.
- Direct manipulation remains reversible until an exact consequence crosses into the world.
- Preserve venture isolation, cited Product truth, exact work lineage, founder-only consequence authority,
  and founder-only work ending.
- Historical identifiers such as `gtm-ide`, `bet`, `fork`, `channel`, and `~/.gtm-ide` remain compatibility
  seams, not founder-language requirements.
- Do not commit, publish, deploy, spend, send, or take another external action without explicit approval.

## Verification

Use the smallest relevant check while iterating, then the complete gate when the change warrants it:

```sh
npm --prefix brain test
npm --prefix ui run test:unit
npm run lint
npm run build
npm test
npm run test:firm:browser
npm run test:acceptance
```

`npm run test:acceptance` is the complete local-readiness receipt: mechanical tests, token parity, and
browser journeys. It is not outside-founder, packaged-Electron, real-effect, causal, or market proof.

A handoff states the user-visible outcome first, lists exact verification, distinguishes observed behavior
from inference, and names remaining unproven behavior. Meaningful Product/design work ends with an
evidence-grounded release note and the highest-leverage next move.
