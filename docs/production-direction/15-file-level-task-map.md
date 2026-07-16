# File-Level Task Map

> **ARCHIVED TASK MAP.** These file targets are historical and do not authorize edits. Current work
> starts from [FIRM-SPEC.md](../FIRM-SPEC.md), [STATE.md](../STATE.md), and the live tree.

This map translates the production direction into likely repository work. It is guidance for ownership and
discovery, not permission to edit every listed file. An implementation agent must inspect current code and
tests before choosing the final patch boundary.

## Task 0 — Documentation and vocabulary

Likely files:

- `docs/STATE.md`
- `README.md`
- `docs/EXPERIMENT-MACHINE-SPEC.md`
- `docs/OPEN-CANVAS-SPEC.md`
- `docs/production-direction/*`
- `AGENTS.md` only if the standing doctrine itself changes

Required work:

- make this package the approved production target;
- mark superseded DDD/program/foundry language historical;
- translate founder-facing language to product-level GTM crew, questions, actions, and outcomes;
- keep code identifiers such as channel/gtm-ide where migration would be risky.

Prompt:

```text
Reconcile the docs without claiming behavior that has not landed. Keep AGENTS.md invariants authoritative.
Do not silently rewrite the dated STATE snapshot. Mark old DDD and canvas/program docs historical where they
conflict. Add links to the production-direction package and run git diff --check.
```

## Task 1 — Canvas projection read model

Likely files:

- `brain/src/project-store.mjs`
- `brain/src/product-model-store.mjs`
- `brain/src/gtm-store.mjs`
- `brain/src/feedback-ledger.mjs`
- `brain/src/operator-store.mjs`
- `brain/src/clarity-store.mjs`
- `brain/src/operating-view.mjs`
- `brain/src/woven-graph.mjs`
- `brain/src/object-graph-store.mjs`
- `brain/src/object-graph-projection.mjs`
- `brain/src/routes/projects.mjs`
- `brain/src/routes/product-model.mjs`
- `brain/src/routes/object-graph.mjs`
- `brain/src/routes/operator.mjs`
- new projection module only if an existing read cannot be composed cleanly
- corresponding backend tests

Required work:

- return one project-scoped canvas projection;
- include product truth, product model, crew, pinned questions/signals, pipelines, decisions, outcomes, and
  founder-owned geometry;
- extend the existing `objectGraphLayoutStore` as the compatible owner for namespaced project-canvas
  geometry rather than creating another layout store;
- preserve honest blanks and provenance;
- avoid a new intelligence engine.

Prompt:

```text
Build the read model that enriches the existing woven canvas. First list the current reads and their owners.
Add only a projection, reference, or thin route seam. Every displayed count, status, relationship, and
teammate state must derive from real records. Test empty, partial, project-isolated, stale, and populated
cases. Do not add strategy, ranking, or a product-room dashboard to the projection.
```

## Task 2 — Product-level crew and contributions

Likely files:

- `brain/src/crew-roster-store.mjs`
- `brain/src/teammate-soul-store.mjs`
- `brain/src/teammate-soul.mjs`
- `brain/src/memory.mjs`
- `brain/src/soul-wiring.mjs`
- `brain/src/routes/crew.mjs`
- `brain/src/operator-tools.mjs`
- `brain/src/operator-runtime.mjs`
- `brain/test/memory.test.mjs`
- `brain/test/teammate-soul*.test.mjs`
- `brain/test/crew*.test.mjs`

Required work:

- preserve product association and project-scoped identity across questions, pipelines, and outcomes;
- preserve soul lineage and founder lessons;
- expose relevant crew pods;
- preserve disagreement and evidence;
- ensure no teammate sees another project’s memory.

Prompt:

```text
Extend the existing crew/soul/memory system into a product-level GTM crew. Do not create a policy or agent
instance system. Project beliefs, evidence, uncertainty, recommendations, founder response, and outcomes
from existing run, feedback, artifact, and soul authorities before adding durable links. Keep names and
voices founder-safe. Add isolation and lineage tests before changing UI.
```

## Task 3 — Optional question, evidence, and disagreement focus

Likely files:

- `brain/src/clarity-store.mjs`
- `brain/src/gtm-store.mjs` only for existing run/outcome references
- `brain/src/feedback-ledger.mjs`
- `brain/src/product-model-store.mjs`
- `brain/src/operator-store.mjs` for attributable transient/run context
- new `brain/test/*question*.test.mjs`

Required work:

- create/update/link founder-pinned questions while allowing transient crew questions to remain run artifacts;
- keep question-owned evidence, product, and crew references on clarity while pipeline/run/result and
  founder-decision sources own optional `questionId`; reverse-join those backlinks in the canvas projection;
- allow questions to be optional;
- preserve multiple interpretations;
- support signal → implication → founder decision.

Prompt:

```text
Implement optional question anchors and evidence/disagreement projections in the existing canvas. Reuse
clarity pins, operator events, feedback, artifacts, and run/outcome references before adding records. Do not
make questions a program, destination hierarchy, lifecycle machine, or required input contract. Preserve
competing teammate positions and prove that a direct pipeline still works with no question.
```

## Task 4 — Crew-aware operator runtime

Likely files:

- `brain/src/operator-tools.mjs`
- `brain/src/operator-runtime.mjs`
- `brain/src/operator-run-core.mjs`
- `brain/src/operator-tool-exec.mjs`
- `brain/src/routes/operator.mjs`
- `brain/src/routes/product-model.mjs`
- `brain/test/operator*.test.mjs`

Required work:

- understand/question/ask/compare before compose when appropriate;
- preserve direct compose/run;
- bind sessions to product/question/action context;
- keep tool descriptions founder-safe;
- enforce project scope and wall rules;
- defer the public MCP verb surface until stable canvas references exist.

Prompt:

```text
Update the operator so it can work on GTM questions and ask the product crew before composing an action.
Preserve direct run and gate behavior. Keep fuzzy work model-owned. Add only canonical tools with durable
backing. Update the naked set, schemas, route tests, wall tests, and raw-machinery anti-leak tests.
```

## Task 5 — Product-shaped GTM pipelines

Likely files:

- `brain/src/gtm-store.mjs`
- `brain/src/run-compile.mjs`
- `brain/src/graph.mjs`
- `brain/src/graph-operations.mjs`
- `brain/src/workflow-composer.mjs`
- `brain/src/gate-pattern.mjs`
- `brain/src/microproduct-composer.mjs`
- `brain/src/connectors/execute/artifact.mjs`
- `brain/src/connectors/execute/deploy.mjs`
- `brain/src/connectors/execute/deploy-transport.mjs`
- `brain/src/routes/runs.mjs`
- `brain/src/routes/artifacts.mjs`
- `brain/test/run-compile.test.mjs`
- `brain/test/microproduct*.test.mjs`
- `brain/test/operator-in-repo-change.test.mjs`

Required work:

- represent product-shaped GTM pipelines without closing the graph vocabulary;
- review product/code diffs at the gate;
- preserve deploy and send authorization;
- keep ordinary in-repo changes separate from the exceptional two-authorization microproduct deploy path;
- connect the existing pipeline/graph/run to a pinned question when present, crew, product elements, and
  outcomes.

Prompt:

```text
Extend the existing pipeline/graph/gate spine to support product-shaped GTM moves. Reuse microproduct, build
preview, gate, and deploy protections. Do not reuse the dogfood `feature-builder.mjs` as the normal
product-action safety domain. Never let composition forge authorization. Show intended effect, evidence,
preview/diff, measurement intent, and rollback path. Test that normal product-change approval cannot commit,
push, open a PR, publish, or deploy, and that microproduct deployment still requires both authorizations.
```

## Task 6 — Outcome-to-product learning

Likely files:

- `brain/src/outcome-ingest.mjs`
- `brain/src/outcome-capture.mjs`
- `brain/src/feedback-ledger.mjs`
- `brain/src/gtm-store.mjs`
- `brain/src/product-model-store.mjs`
- `brain/src/domain-commands.mjs`
- `brain/src/memory.mjs`
- `brain/src/run-derivation.mjs`
- `brain/src/routes/measure.mjs`
- `brain/src/routes/inputs.mjs`
- `brain/test/outcome*.test.mjs`
- `brain/test/feedback*.test.mjs`
- `brain/test/product-model*.test.mjs`

Required work:

- join outcome to action/question/crew/product element;
- create product implications without auto-applying them;
- let accepted implications reach coding context;
- keep unmeasured honest;
- feed teammate memory and future composition.

Prompt:

```text
Close the market-to-product loop from existing outcome and feedback sources. Keep one source of truth for a
signal body and use pins/links for other projections. Require founder judgment before a product implication
becomes an applied code or product change. Test joined, blind, duplicate, late, negative, and manual outcomes.
```

## Task 7 — MCP and coding-session parity

Likely files:

- `brain/src/operator-mcp.mjs`
- `brain/src/mcp.mjs`
- `brain/src/operator-tools.mjs`
- `brain/src/operator-tool-exec.mjs`
- MCP schemas/routes discovered from the current server registration
- `brain/test/mcp*.test.mjs`

Required work:

- expose the small inspect/focus/ask/propose/record/run verb surface over stable canvas references;
- keep product scope, read/write classification, and founder-wall enforcement;
- preserve direct pipeline/run inspection without adding one tool per canvas noun;
- prove that UI and coding sessions address the same durable bodies and decisions.

Prompt:

```text
Add MCP parity only after the canvas projection and stable references exist. Prefer the six canonical verbs
over noun-specific aliases. Reuse current product, graph, gate, run, crew, question, and outcome authorities.
Test project isolation, read-only behavior, write boundaries, wall enforcement, and a coding-session
question-to-pipeline-to-outcome round trip.
```

## Task 8 — Canvas-native product reorientation

Likely files:

- `ui/src/App.tsx`
- `ui/src/api.ts`
- `ui/src/types.ts`
- `ui/src/components/canvas/GtmCanvas.tsx`
- `ui/src/components/GraphCanvas.tsx`
- `ui/src/lib/wovenLayout.ts`
- `ui/src/lib/wovenOverlay.ts`
- `ui/src/components/AgentProfile.tsx`
- `ui/src/components/ComposerDock.tsx`
- `ui/src/components/ProductReadout.tsx`
- `ui/src/components/ProductEntryColumn.tsx`
- `ui/src/components/DecisionInbox.tsx`
- `ui/src/components/gate/GateReview.tsx`
- `ui/src/components/LeftRail.tsx`
- `ui/src/lib/navigation.ts`
- relevant `ui/src/styles/*`
- UI tests and browser verification

Required work:

- keep the woven canvas as the home and add product, question, and action altitudes;
- add focus-to-trace for relevant crew, provenance, disagreement, decisions, runs, and outcomes;
- make disagreement/evidence actionable on the canvas;
- keep one anchored gate decision path and return outcomes spatially;
- demote pipeline/capability inventory chrome without demoting pipelines themselves;
- remove duplicate counts and ambiguous scope.

Prompt:

```text
Enrich the existing woven canvas with product, question, and action altitudes plus focus-to-trace. Keep
persistent teammates at the perimeter and on work they own, pipelines as the action grammar, one gate review,
and outcomes returning toward product/coding context. Do not add a product-room dashboard, separate question
pages, duplicated gate review, decorative teammate embodiment, or new named canvas modes. Render every state
honestly and browser-verify the complete loop at desktop, keyboard-only, and narrow widths.
```

## Task 9 — Verification, deletion, and docs

Likely files:

- `brain/test/anti-cage.test.mjs`
- `brain/test/*`
- `ui/src/**/*.test.tsx`
- `docs/STATE.md`
- obsolete docs and dead UI files identified by `knip`/tests

Required work:

- add anti-cage checks for no policy/foundry/program revival;
- add wall and provenance checks;
- browser-verify product altitude → crew/question focus → pipeline → gate → outcome return;
- delete or mark superseded surfaces;
- update dated state only after behavior lands.

Prompt:

```text
Run the full verification contract from 13-verification-and-acceptance.md. Separate real regressions from
environment failures and pre-existing failures. Search for stale program/policy/foundry machinery, fixed
stage skeletons, raw machinery language, duplicate counts, and ungrounded metrics. Do not call the direction
complete until the browser flow and the end-to-end outcome return are both verified.
```
