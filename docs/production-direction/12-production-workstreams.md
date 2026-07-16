# Production Workstreams

> **ARCHIVED WORKSTREAMS.** This sequence is not a current roadmap. Current direction and proof live
> in [FIRM-SPEC.md](../FIRM-SPEC.md) and [STATE.md](../STATE.md).

This is the implementation sequence for the full production direction. Each workstream must produce a
production-quality increment with tests, error states, browser verification where relevant, and a truthful
state update. These are dependency-ordered workstreams, not throwaway prototypes.

## Workstream 0 — Direction and source-of-truth cleanup

Deliver:

- this production-direction package;
- current docs map updated;
- stale DDD/program/foundry references clearly historical;
- product thesis and vocabulary aligned.

Acceptance:

- no current doc presents the old program/policy/foundry model as load-bearing;
- current code identifiers may remain historical but product UI language is consistent.

## Workstream 1 — Canvas projection read model

Deliver:

- one product-scoped projection over current product model, truth, crew, pinned questions/signals, pipelines,
  decisions, outcomes, and founder-owned geometry;
- honest empty/partial states;
- no new GTM intelligence subsystem;
- a tested backend projection contract that later UI and MCP work can consume.

Acceptance:

- empty, partial, stale, archived-reference, and populated fixtures produce truthful project-isolated
  projections;
- no canvas rendering or MCP tool is required to complete this backend dependency.

## Workstream 2 — Product-level GTM crew

Deliver:

- crew membership and teammate souls scoped to product;
- relevant-pod projection for a question/action;
- teammate contributions with evidence, uncertainty, recommendation, and founder response;
- stable references that the canvas can later use for perimeter and work ownership.

Acceptance:

- a teammate persists across actions and questions;
- founder learning changes future teammate context;
- teammates remain distinct and disagreement is preserved.

## Workstream 3 — Optional question, evidence, and disagreement focus

Deliver:

- optional founder-pinned question anchors and transient run/operator question projections;
- question-owned links to evidence, product elements, and crew, plus reverse-joined pipeline, run, outcome,
  and founder-decision references owned by those source records;
- question/evidence/disagreement projection data for the same canvas;
- founder decision writeback through the existing feedback/gate/taste authority.

Acceptance:

- founder, operator, and signal paths can create or project a question with stable references that later UI
  and MCP work can address;
- a direct action can still bypass a question;
- incomplete question context never blocks pre-gate work.
- no separate question destination or mandatory question lifecycle is introduced.

## Workstream 4 — Crew-aware operator runtime

Deliver:

- operator can inspect product, ask crew, compare perspectives, propose moves, and then compose an action;
- existing direct run path remains available;
- durable conversation links to a pinned question when present and to existing pipeline/graph/run records;
- no public MCP redesign yet; that surface follows stable canvas references in Workstream 7.

Acceptance:

- operator is not forced to compose a pipeline for every message;
- model-owned judgment remains in rented agent/tool steps;
- all writes and external effects stay scoped and gated.

## Workstream 5 — Product-shaped GTM pipelines

Deliver:

- open pipeline shapes for product changes, activation, instrumentation, public artifacts, microproducts, and
  other GTM moves;
- preview/diff/gate path for durable product changes;
- product model and outcome links.

Acceptance:

- at least one code-native/product-shaped motion can be proposed, reviewed, and staged safely; any effect the
  existing authority permits can then execute, be measured, and return to the originating pinned question
  when present and to the same crew.

## Workstream 6 — Outcome-to-product learning

Deliver:

- outcome interpretation and product implication path;
- accepted implications visible in coding context;
- teammate memory and product model can receive the same signal without duplicating its source;
- attribution and unmeasured states remain honest.

Acceptance:

- a real market signal changes the next GTM composition and is available in the next AI coding session.

## Workstream 7 — MCP and coding-session parity

Deliver:

- a small inspect/focus/ask/propose/record/run verb set over stable canvas references;
- project-scoped reads and writes;
- read/write classifier and wall enforcement;
- operator prompts updated to use the new surface.

Acceptance:

- a coding session can inspect and advance the same pinned question and pipeline references exposed by the
  canvas projection contract;
- the later canvas UI can consume those records without an MCP-only state or translation layer.

## Workstream 8 — Semantic canvas reorientation

Deliver:

- product, question, and action altitudes on the existing woven canvas;
- focus-to-trace for crew, provenance, decisions, live runs, and outcomes;
- persistent crew perimeter and contextual teammate embodiment;
- execution graphs revealed at action altitude;
- gate and outcome surfaces preserved and clarified;
- responsive/accessibility/off-happy-path coverage.

Acceptance:

- the product no longer presents a fleet dashboard, capability inventory, or duplicate count surface as its
  primary identity;
- a founder can move from product truth to question/disagreement to pipeline to gate to outcome without
  leaving the canvas or losing context;
- the browser flow and coding session address the same pinned question, pipeline, decision, and outcome
  references;
- no product-room dashboard, separate question page, or duplicate gate implementation is introduced.

## Workstream 9 — Reliability and deletion pass

Deliver:

- stale duplicate projections removed;
- current dirty work preserved;
- route/store/runtime ownership documented;
- dead UI and obsolete docs deleted or marked historical;
- full test/build/browser verification.

Acceptance:

- fewer concepts are visible to the founder;
- no duplicate count, scope, or state surfaces remain;
- the thin-host and anti-cage tests remain green.

## Master workstream prompt

```text
Execute the production workstreams in dependency order from this file.

For the workstream you are assigned, read the linked production-direction spec, AGENTS.md, current source
files, and tests first. Do not implement a prototype or a disconnected spike. Produce a production-complete
increment with durable state, UI/MCP parity where relevant, error/empty/loading/partial states, tests, and
browser verification for user-facing work.

Before coding, state: the current behavior, target behavior, files likely to change, records owned by each
module, the wedge advanced, the gate path, and the machinery explicitly excluded. Preserve current user
changes and historical data. Stop if the implementation requires a program/policy/foundry layer, fixed GTM
stages, a mandatory pre-run contract, or host-side fuzzy strategy; redesign it to stay thin.

The canvas, persistent teammates, open pipelines/graphs, and founder gate are fixed product decisions. A
workstream may enrich their projection and interaction model; it may not replace them with a dashboard,
document hierarchy, or parallel product shell.
```
