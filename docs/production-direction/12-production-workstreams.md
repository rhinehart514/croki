# Production Workstreams

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

## Workstream 1 — Product-room read model

Deliver:

- product overview projection over current product model, truth, crew, questions/signals, actions, outcomes;
- honest empty/partial states;
- no new GTM intelligence subsystem;
- API route and MCP read parity.

Acceptance:

- a founder can understand product reality, active crew, open questions, recent actions, and outcomes from one
  product room.

## Workstream 2 — Product-level GTM crew

Deliver:

- crew membership and teammate souls scoped to product;
- relevant-pod projection for a question/action;
- teammate contributions with evidence, uncertainty, recommendation, and founder response;
- profile and crew-room redesign.

Acceptance:

- a teammate persists across actions and questions;
- founder learning changes future teammate context;
- teammates remain distinct and disagreement is preserved.

## Workstream 3 — Question/context layer

Deliver:

- optional product-scoped GTM question record/projection;
- links to evidence, product elements, crew, decisions, actions, and outcomes;
- question room UI;
- founder decision writeback.

Acceptance:

- a question can start from UI, MCP, signal, or agent;
- a direct action can still bypass a question;
- incomplete question context never blocks pre-gate work.

## Workstream 4 — Crew-aware operator

Deliver:

- operator can inspect product, ask crew, compare perspectives, propose moves, and then compose an action;
- existing direct run path remains available;
- durable conversation links to question and action records.

Acceptance:

- operator is not forced to compose a pipeline for every message;
- model-owned judgment remains in rented agent/tool steps;
- all writes and external effects stay scoped and gated.

## Workstream 5 — Product-shaped GTM actions

Deliver:

- action metadata for product changes, activation, instrumentation, public artifacts, microproducts, and other
  open GTM moves;
- preview/diff/gate path for durable product changes;
- product model and outcome links.

Acceptance:

- at least one code-native/product-shaped motion can be proposed, reviewed, authorized, executed, measured,
  and returned to the same question and crew.

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

- canonical tools for product, crew, question, evidence, decision, action, and outcome;
- project-scoped reads and writes;
- read/write classifier and wall enforcement;
- operator prompts updated to use the new surface.

Acceptance:

- a coding session can inspect and advance the same product question visible in the UI;
- no important UI-only state exists outside the shared durable model.

## Workstream 8 — Product-room UI reorientation

Deliver:

- product room as default home;
- contextual crew and question surfaces;
- graph/canvas demoted to action execution;
- gate and outcome surfaces preserved and clarified;
- responsive/accessibility/off-happy-path coverage.

Acceptance:

- the product no longer presents a pipeline fleet as its primary identity;
- a founder can move from product question to crew to action to gate to outcome without losing context.

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
```
