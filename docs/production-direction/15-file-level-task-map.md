# File-Level Task Map

This map translates the production direction into likely repository work. It is guidance for ownership and
discovery, not permission to edit every listed file. An implementation agent must inspect current code and
tests before choosing the final patch boundary.

## Task 0 — Documentation and vocabulary

Likely files:

- `docs/STATE.md`
- `README.md`
- `docs/GTM-ENGINE-REBUILD.md`
- `docs/GTM-MACHINE.md`
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

## Task 1 — Product room read model

Likely files:

- `brain/src/project-store.mjs`
- `brain/src/product-model-store.mjs`
- `brain/src/gtm-store.mjs`
- `brain/src/feedback-ledger.mjs`
- `brain/src/operator-store.mjs`
- `brain/src/routes/projects.mjs`
- `brain/src/routes/product-model.mjs`
- new projection module only if an existing read cannot be composed cleanly
- corresponding backend tests

Required work:

- return one project-scoped product room projection;
- include product truth, product model, crew, questions/signals, actions, outcomes, and decisions;
- preserve honest blanks and provenance;
- avoid a new intelligence engine.

Prompt:

```text
Build a product-room read model from existing stores. First list the current reads and their owners. Add
only a projection or thin route seam. Every displayed count or status must derive from real state. Test empty,
partial, project-isolated, stale, and populated cases. Do not add strategy or ranking logic to the projection.
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

- make product association and question/action contributions durable;
- preserve soul lineage and founder lessons;
- expose relevant crew pods;
- preserve disagreement and evidence;
- ensure no teammate sees another project’s memory.

Prompt:

```text
Extend the existing crew/soul/memory system into a product-level GTM crew. Do not create a policy or agent
instance system. Store the minimum contribution/context links required for evidence, uncertainty,
recommendation, founder response, and outcomes. Keep names and voices founder-safe. Add isolation and
lineage tests before changing UI.
```

## Task 3 — GTM question/context layer

Likely files:

- `brain/src/gtm-store.mjs` or a thin question projection beside it
- `brain/src/feedback-ledger.mjs`
- `brain/src/product-model-store.mjs`
- `brain/src/domain-commands.mjs` only if durable lineage is required
- `brain/src/domain-events.mjs` / `brain/src/program-projection.mjs` only if a rebuildable event is necessary
- new `brain/test/*question*.test.mjs`

Required work:

- create/update/link questions;
- attach evidence, crew, decisions, actions, and outcomes;
- allow questions to be optional;
- preserve multiple interpretations;
- support signal → implication → founder decision.

Prompt:

```text
Implement the smallest optional GTM question/context layer. Prefer a projection or thin store over existing
records. Do not make it a program, a lifecycle machine, or a required input contract. Preserve competing
agent contributions and provenance. Prove that a direct action still works with no question.
```

## Task 4 — Crew-aware operator and MCP

Likely files:

- `brain/src/operator-tools.mjs`
- `brain/src/operator-runtime.mjs`
- `brain/src/operator-run-core.mjs`
- `brain/src/operator-tool-exec.mjs`
- `brain/src/operator-mcp.mjs`
- `brain/src/routes/operator.mjs`
- `brain/src/routes/product-model.mjs`
- `brain/test/operator*.test.mjs`
- `brain/test/mcp*.test.mjs`

Required work:

- understand/question/ask/compare before compose when appropriate;
- preserve direct compose/run;
- bind sessions to product/question/action context;
- keep tool descriptions founder-safe;
- enforce project scope and wall rules.

Prompt:

```text
Update the operator so it can work on GTM questions and ask the product crew before composing an action.
Preserve direct run and gate behavior. Keep fuzzy work model-owned. Add only canonical tools with durable
backing. Update the naked set, schemas, route tests, wall tests, and raw-machinery anti-leak tests.
```

## Task 5 — Product-shaped GTM actions

Likely files:

- `brain/src/gtm-store.mjs`
- `brain/src/run-compile.mjs`
- `brain/src/graph.mjs`
- `brain/src/graph-operations.mjs`
- `brain/src/gate-pattern.mjs`
- `brain/src/gate-delta.mjs` or the current gate-delta owner
- `brain/src/microproduct-composer.mjs`
- `brain/src/feature-builder.mjs`
- `brain/src/routes/runs.mjs`
- `brain/src/routes/artifacts.mjs`
- `brain/test/run-compile.test.mjs`
- `brain/test/microproduct*.test.mjs`
- `brain/test/operator-in-repo-change.test.mjs`

Required work:

- represent product-shaped GTM actions without closing the action vocabulary;
- review product/code diffs at the gate;
- preserve deploy and send authorization;
- connect action to question, crew, product elements, and outcomes.

Prompt:

```text
Extend the existing action/graph/gate spine to support product-shaped GTM moves. Reuse gate-delta,
microproduct, feature-builder, and deploy protections. Never let composition forge authorization. Show the
founder the intended product effect, evidence, preview/diff, measurement intent, and rollback path.
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

## Task 7 — Product-room UI

Likely files:

- `ui/src/App.tsx`
- `ui/src/components/WorkspaceView.tsx`
- `ui/src/components/canvas/GtmCanvas.tsx`
- `ui/src/components/GraphCanvas.tsx`
- `ui/src/components/crew/CrewRoom.tsx`
- `ui/src/components/AgentProfile.tsx`
- `ui/src/components/ComposerDock.tsx`
- `ui/src/components/ProductReadout.tsx`
- `ui/src/components/DecisionInbox.tsx`
- new product-room/question-room components where composition improves clarity
- `ui/src/lib/navigation.ts`
- relevant `ui/src/styles/*`
- UI tests and browser verification

Required work:

- make product room the default;
- show relevant crew and questions;
- make disagreement/evidence actionable;
- demote pipeline fleet and capability inventory;
- preserve graph, gate, and outcome surfaces as focused views;
- remove duplicate counts and ambiguous scope.

Prompt:

```text
Reorient the UI around a product, its GTM crew, open questions, evidence, decisions, actions, and outcomes.
Do not add a generic dashboard. Compose from existing components where possible, but create a product-native
question/crew surface when the existing canvas cannot express the concept. Render every state honestly and
browser-verify the complete loop at desktop and narrow widths.
```

## Task 8 — Verification, deletion, and docs

Likely files:

- `brain/test/anti-cage.test.mjs`
- `brain/test/*`
- `ui/src/**/*.test.tsx`
- `docs/STATE.md`
- obsolete docs and dead UI files identified by `knip`/tests

Required work:

- add anti-cage checks for no policy/foundry/program revival;
- add wall and provenance checks;
- browser-verify product room → crew → question → action → gate → outcome;
- delete or mark superseded surfaces;
- update dated state only after behavior lands.

Prompt:

```text
Run the full verification contract from 13-verification-and-acceptance.md. Separate real regressions from
environment failures and pre-existing failures. Search for stale program/policy/foundry machinery, fixed
stage skeletons, raw machinery language, duplicate counts, and ungrounded metrics. Do not call the direction
complete until the browser flow and the end-to-end outcome return are both verified.
```

