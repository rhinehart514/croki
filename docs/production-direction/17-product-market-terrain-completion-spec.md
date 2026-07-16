> **SUPERSEDED.** This completion target is implementation history. Its terrain, graph, gate, and
> acceptance models cannot direct current work. [FIRM-SPEC.md](../FIRM-SPEC.md) is the only product
> and build contract; [STATE.md](../STATE.md) is the only current proof record.

# Product-Market Terrain Completion Spec

Status: approved completion target. Deterministic implementation and Gate B passed on 2026-07-10; the full
Gate C matrix, T11, and Gate D remain open. See `docs/STATE.md` for the current receipt.

Stage: alpha. Passing this specification means the product is complete enough for the alpha bet; it does
not mean the market has validated Drover.

This specification is code-grounded. It refines the current production-direction package without replacing
Drover's scanner, product model, persistent crew, canvas, open pipelines, graph runner, founder wall, taste
memory, outcome ledger, local runtimes, or MCP surface.

Where this file conflicts with the statement in `09-product-room-and-ui.md` or
`16-product-room-ux-plan.md` that the living GTM operation is the primary object, this file wins.

## 1. Product decision

Mandatory product verdict: **revise**.

Drover's primary object is the founder's **living product-market terrain**. The current GTM operation is the
worked layer over that terrain. A pipeline is one chosen, executable move. It is not the home screen, the
product ontology, or the prerequisite for Drover to be useful.

The terrain contains five kinds of meaning without turning them into five new subsystems:

1. **What the product demonstrably is.** Cited repository truth and founder-stated facts.
2. **Where the product may meet the market.** Clearly labeled openings and tensions inferred by rented
   intelligence from product truth, the interpretive product model, market records, founder taste, current
   capabilities, prior decisions, and outcomes.
3. **What remains uncertain.** Optional questions, competing teammate positions, missing evidence, and
   falsifiers.
4. **What the founder chose to do.** Existing pipelines, graph runs, gates, and product-change proposals.
5. **What the market taught.** Joined outcomes, unattributed signals, learned teammate context, and proposed
   product implications.

The product should feel like this:

> You point Drover at a product. Before asking you to invent a goal, it shows what it understood, where the
> product appears to have leverage, where the story or experience is under strain, and what evidence would
> change each read. You choose what deserves attention. The crew can investigate it with you. When you choose
> a move, Drover turns that part of the terrain into a real pipeline, runs it to your wall, and brings the
> result back to the same place.

## 2. Fixed decisions and boundaries

These decisions are fixed for this build:

- The canvas remains the home.
- The existing product-scoped crew remains persistent and embodied on the canvas. Each teammate keeps one
  deterministic illustrated character across every product surface; initials are a render-failure fallback,
  not a compact presentation mode.
- Product truth remains citation-bound and read-only.
- Openings and tensions are model-owned hypotheses, never promoted to product truth by display or repetition.
- Questions remain optional. A founder can act directly without creating one.
- Pipelines remain open, editable graphs with no fixed GTM stage skeleton.
- The founder wall remains the only authorization checkpoint.
- Operator is for understanding, choosing, asking, and directing.
- Engineer is for making one chosen move real, inspecting its graph, and reviewing its execution.
- Outcomes return to product, question, move, crew, and decision context when those joins exist.
- Codex and Claude Code are interchangeable local runtimes for every core user journey. A provider-specific
  implementation name may remain internal for compatibility; provider-specific product behavior may not.
- No model call is required to render already-grounded truth or existing work. When intelligence is absent,
  Drover shows the deterministic terrain and an honest missing-read state.

Do not build:

- a durable Opportunity, Program, Policy, Foundry, TerrainItem, AgentInstance, or campaign-stage lifecycle;
- a second product-room dashboard beside the canvas;
- a ranked-card home page disconnected from the canvas;
- a required questionnaire, ICP form, measurement contract, or question before useful work appears;
- a host-side strategy/ranking engine that decides which opening is best;
- a closed list of GTM motion kinds;
- a second gate implementation;
- a Claude-only or Codex-only product path;
- a confidence score that presents model judgment as measurement.

## 3. Current code truth

The build starts from the code that exists today.

### Preserve as authorities

| Concern | Existing owner | Completion use |
|---|---|---|
| Repository truth | `brain/src/scan.mjs`, workspace report, `gtm-store.mjs` product truths | Terrain observations and receipts |
| Product interpretation | `product-model-store.mjs`, `product-model-generator.mjs`, domain events | Product shape supplied to the terrain read |
| Market evidence | `marketObjectStore`, market research routes, evidence records | Buyer-side support and contradiction |
| Founder taste and decisions | `feedback-ledger.mjs`, gate records, memory/taste distillation | Re-rank or suppress repeated weak hypotheses without inventing authorization |
| Questions and disagreement | `clarity-store.mjs`, operator/run artifacts | Optional question focus and crew positions |
| Persistent crew | crew roster, teammate souls, memory, bench/profile projections | Authors, investigators, falsifiers, and learned context |
| Chosen moves | project channels, flow store, graph, graph operations | Existing pipeline/action layer |
| Wall and execution | graph validation, run compiler, gate routes, execute connectors | Unchanged authorization boundary |
| Market return | outcome ingest/capture, Results, Learnings, implications | Terrain updates and next-read context |
| Shared canvas read | `operating-view.mjs`, `woven-graph.mjs`, object layout store | Deterministic terrain base |
| Local intelligence | runtime registry, Codex runtime, Claude Code runtime, agent bridge | Provider-neutral structured reads and operator work |

### Change, not replace

| Current behavior | Required change |
|---|---|
| `describeSurface` sends a grounded product with no pipeline to `GoalLauncher` | A grounded product always lands on the canvas in Operator |
| GoalLauncher leads with “What are you trying to make happen?” | The first screen proves product understanding and offers focus actions before a goal is required |
| Operator renders only built pipeline lanes | Operator renders product terrain first; built lanes are the worked layer |
| The default lens is Engineer below two built pipelines | Operator is the default whenever no pipeline is explicitly focused |
| `motion-plan.mjs` returns a ranked list of motions | Broaden it into a terrain read that returns openings and tensions; suggested moves remain optional |
| The operation-plan route uses a global latest workspace and a Claude-only reader | Make reads project-scoped and provider-neutral |
| Project grounding stores repository evidence, while cited `productTruthStore` records are populated later through object-graph scanning | Persist the already-available scan report into product truth during create/re-ground; the first terrain read must not depend on opening another surface |
| Product-model derivation is kicked with `createClaudeProductModeler` and no explicit scan grounding | Route every core structured read through one provider-neutral rented-task seam and pass the active project's scan report plus grounding revision |
| Operator/Engineer is UI-local state | Send surface, lens, and focused stable references with the next operator turn/session |
| Product-entry unknowns are static list items | Make canonical questions and hypotheses focusable from their source landmark |
| Outcomes return to a rail and pipeline nodes | Also mark the terrain read stale and visibly update affected product/hypothesis context |
| Provider-neutral runtime selection exists mainly in operator sessions | Apply it to product reading, terrain reading, market reading, crew work, composition, and product-shaped builds |

### Retire or demote

- `GoalLauncher` retires as a base surface. Its model picker and composer behavior may be reused inside the
  contextual canvas composer.
- A separate `MarketLayers` or product-understanding takeover may remain only as summoned detail. It cannot
  be the place where the founder has to discover the product-market read.
- `getBoard`, capability inventories, efficiency tables, project lists, and pipeline lists remain useful
  indexes or inspectors. None may become the primary product identity.
- `/api/operation-plan` and `derive_operation_plan` may remain as compatibility adapters during migration;
  new product code reads the terrain contract.
- Provider-specific copy such as “Ask Claude,” “Back to Claude,” and “Claude researches” is replaced with
  the selected teammate/runtime name or provider-neutral language on every reachable core surface.

## 4. Experience contract

### 4.1 First useful minute

For a new product:

1. The founder chooses a repository and the event or result that counts as a win.
2. The deterministic scanner renders progress and then cited product truth. This works without a model.
3. The canvas opens in Operator. It does not show an empty pipeline editor and does not ask for a goal first.
4. The product landmark states, in plain language, what Drover believes the product is, who it appears to
   serve, and where wins currently enter. Every factual statement has a receipt.
5. If a runtime is available, three to five openings or tensions arrive progressively on the canvas. Each
   is visibly an inference or a bet and states what would change the read.
6. If no runtime is available, the same terrain renders with an inline “Connect a runtime to read possible
   openings” state. The entire product is not replaced by a connection wall.
7. The founder can correct the product read, ask the crew, find evidence, park a hypothesis, or turn it into
   a pipeline. None of these actions sends anything.

The first-use success criterion is not “a pipeline was created.” It is:

> The founder can point to at least one displayed statement and say both “Drover got this from my product”
> and “I understand a credible place we could focus next.”

### 4.2 Returning product

A returning founder lands on the same terrain with:

- grounded product landmarks;
- current openings/tensions and their freshness;
- open questions and unresolved disagreement;
- active, waiting, and completed moves as a worked layer;
- one visible founder wall across active moves;
- what came back and what it may change;
- the relevant crew at the perimeter and on authored work;
- restored focus and geometry.

The view should answer in order:

1. What changed?
2. What needs my judgment?
3. What is the crew doing?
4. What did the market teach?
5. Where can I go deeper?

### 4.3 Operator and Engineer

**Operator** shows the terrain and lets the founder:

- inspect product truth and source receipts;
- inspect or correct an opening/tension;
- focus an optional question;
- compare distinct teammate positions;
- ask a teammate or the relevant crew;
- request research or evidence;
- make and preserve a founder call;
- choose or redirect a move;
- inspect active moves, gates, outcomes, and product implications;
- turn one focused hypothesis/question/direct request into a pipeline.

**Engineer** shows one chosen move and lets the founder:

- understand the objective, evidence, intended effect, measurement intent, and gate consequence;
- inspect and edit the real open graph;
- add, remove, wire, or redirect agents, skills, tools, code, MCP, query, switch, and terminal steps;
- watch execution and partial failure;
- review the exact delta at the wall;
- approve, reject, refine, retry, or record an outcome;
- return to the originating terrain focus without losing context.

The model receives this distinction as context. It must not infer the active mode by reading UI copy.

## 5. Full-stack data and authority contract

### 5.1 The deterministic terrain view

The canonical read is a pure project-scoped projection over existing authorities. Implement it by extending
`getOperatingView` or by adding a thin `getTerrainView` wrapper and retaining `getOperatingView` as a
compatibility alias.

Required response shape:

```ts
type TerrainView = {
  schemaVersion: 1;
  projectId: string;
  generatedAt: string;
  state: {
    kind: "ready" | "partial" | "empty";
    stale: boolean;
    issues: TerrainIssue[];
  };
  product: {
    projectRef: StableRef;
    repository: { path: string | null; winEvent: string | null };
    truths: TerrainObservation[];
    modelRef: StableRef | null;
  };
  hypotheses: TerrainHypothesis[];
  questions: StableRef[];
  moves: StableRef[];
  outcomes: StableRef[];
  implications: StableRef[];
  crew: StableRef[];
  relationships: TerrainRelationship[];
  geometry: ExistingCanvasGeometry;
};
```

`hypotheses` may be empty without making the rest of the terrain unavailable. The deterministic GET never
spends the founder's model subscription and never writes state.

### 5.2 The rented terrain read

The model-generated overlay is a read, not a new durable domain aggregate.

```ts
type TerrainRead = {
  schemaVersion: 1;
  id: string;
  projectId: string;
  generatedAt: string;
  inputFingerprint: string;
  runtime: { id: string; model: string | null };
  hypotheses: TerrainHypothesis[];
};

type TerrainHypothesis = {
  id: string;
  stance: "opening" | "tension" | "hypothesis";
  title: string;
  claim: string;
  whyItMatters: string;
  provenance: "inferred" | "speculative";
  evidenceRefs: StableRef[];
  productRefs: StableRef[];
  marketRefs: StableRef[];
  counterEvidenceRefs: StableRef[];
  unknown: string | null;
  falsifier: string | null;
  suggestedMove: {
    title: string;
    intendedEffect: string;
    measurementIntent: string | null;
  } | null;
  crewRefs: StableRef[];
};
```

Rules:

- The host normalizes shape and provenance; it never writes the claim or chooses the best hypothesis.
- A hypothesis claiming evidence without resolvable source references is demoted to speculative.
- A product citation must resolve to the active project's scanned repository and real line.
- A market claim must point to an existing market evidence record or remain speculative.
- The read consumes prior founder cuts/corrections, but those decisions never become authorization.
- The read consumes joined outcomes and proposed implications; approval/release alone is not an outcome.
- The host may bound the rendered set for legibility, but may not constrain GTM motion kinds or require a
  suggested move.
- Hypothesis ids are stable hashes of normalized claim plus source refs within an input fingerprint. They
  are addressable during the read but are not a new store.
- Founder correction, keep, park, or dismissal is written to the existing feedback/decision ledger with the
  terrain read id and hypothesis id as context references. The next read replays it.
- “Turn into pipeline” copies the founder-visible brief and stable source references into an existing
  operator/pipeline composition request. It does not persist the hypothesis as a prerequisite object.

### 5.3 Freshness

The terrain read's `inputFingerprint` covers:

- project id and repository scan timestamp;
- current product-model version;
- market-record revision or latest update time;
- latest founder terrain decision time;
- latest joined outcome and implication time;
- current capability inventory identity;
- relevant taste revision.

When the fingerprint changes, the deterministic terrain marks the previous model read stale. Product truth,
questions, moves, gates, and outcomes still render. A first read may run automatically after grounding. A
joined outcome may trigger one budgeted background refresh when a runtime is available; otherwise the canvas
offers an inline re-read action. Do not add another scheduler.

### 5.4 Stable references

Use the existing stable-ref grammar from `operator-tools.mjs`. Add `terrain-read` and
`terrain-hypothesis` only as projection reference types. They may be focused and included in context but may
not be treated as durable authorities by graph or gate code.

Every pipeline created from terrain carries optional existing metadata:

- `questionId` when one exists;
- `productRefs`;
- `participantRefs`;
- terrain read/hypothesis context refs;
- founder wording;
- intended effect and advisory measurement intent.

None is a pre-gate completeness contract.

## 6. Provider-neutral intelligence contract

Today the operator runtime can select Codex or Claude Code, while several core readers still call
`runClaudeQuery` directly. Completion requires one provider-neutral structured-task seam.

Add or extract one deterministic infrastructure adapter with this behavioral contract:

```ts
runStructuredTask({
  task,
  prompt,
  cwd,
  model,
  output: "object" | "items" | "text",
  readOnly: true,
  maxTurns,
  onText,
}) => { ok, value, runtime, model, error? }
```

The adapter:

- selects the runtime through the existing runtime registry and selected model;
- supports Codex and Claude Code subscription authentication;
- runs with repository read access and no external-write, send, publish, deploy, or gate-release power;
- parses structured output through the existing normalization boundaries;
- returns redacted, founder-safe errors;
- has injectable fakes for unit tests;
- does not own prompts, product records, graph state, decisions, or outcomes.

Migrate every core path required by the terrain journey:

- product-model derivation;
- terrain reading;
- market reading invoked from terrain;
- asking the crew;
- workflow composition and explanation;
- teammate narration and gate translation where a model is used;
- product-shaped/microproduct production.

A legacy Claude-only module may remain temporarily only when no reachable core flow calls it. Record it in
the cleanup inventory. New code must not add another `createClaude*`-only product path.

The project creation request carries the founder's selected model when available. With no explicit model,
the server selects the first available local runtime. With no runtime, grounding succeeds and the model read
degrades honestly.

## 7. API and MCP contract

Preferred HTTP surface:

- `GET /api/projects/:projectId/terrain` — deterministic canonical read, no model call, no write.
- `POST /api/projects/:projectId/terrain/read` — provider-neutral rented read; accepts `model` and optional
  `focusRef`; may stream progress but never mutates product/action state.
- `POST /api/operator/sessions` — accepts canvas context: `surface`, `lens`, `focusRef`, and stable refs.
- Existing focus/ask/record/run routes continue to operate over those references.
- `/api/operating-view` remains a compatibility alias during migration.
- `/api/operation-plan` becomes a compatibility projection over terrain suggested moves or is marked
  deprecated once no production caller remains.

Project scope is explicit on every route. Remove the operation-plan route's “first workspace” scan lookup;
the project repository and scan report are selected by project id.

MCP remains a small verb surface. Do not add CRUD tools for every terrain noun.

Preferred behavior:

- `inspect` on the product returns the deterministic terrain summary.
- `inspect` on a terrain hypothesis returns its claim, evidence, counterevidence, unknown, falsifier, crew,
  and suggested move.
- `focus` can bind a terrain hypothesis, question, product element, pipeline, gate, outcome, or teammate.
- `ask` can ask the relevant crew from that focus.
- `propose` may produce a pipeline brief from focus but cannot create authority.
- `record` writes founder feedback, evidence, or an observed outcome through existing authorities.
- `run` composes or executes an existing move to the wall.

`derive_operation_plan` remains a discoverable compatibility tool until consumers migrate. New agent prompts
prefer the canonical verbs and terrain read.

## 8. Canvas and interaction contract

### 8.1 Spatial hierarchy

The canvas has one hierarchy:

1. Product landmark and grounded truth.
2. Openings, tensions, and important unknowns.
3. Chosen moves branching from the focus they serve.
4. One founder wall across outward effects.
5. Outcomes returning to the affected terrain.
6. Crew attached to authored beliefs and work.

Pipeline lanes may use the current `goal → work → gate → outcome` compression, but only as the active layer.
They do not consume the whole initial canvas.

Render three to five terrain hypotheses at first altitude. Additional hypotheses are reached through focus,
search, or a quiet “more” affordance. Do not render the full product-model taxonomy as a card wall.

### 8.2 Navigation

- A grounded product always renders `GtmCanvas`.
- With no focused pipeline, Operator is active.
- Selecting a hypothesis or question keeps Operator active and opens an in-place focus sidecar.
- Turning a focus into a pipeline or selecting an existing pipeline activates Engineer.
- Escape from Engineer returns to the originating terrain focus when present, otherwise whole-terrain
  Operator.
- Changing the lens updates UI state immediately and is included in the next operator turn; it does not
  create a model call by itself.
- Product-entry truths and unknowns are keyboard-focusable and route to their canonical canvas refs.

### 8.3 Composer

The composer is contextual, not a second home screen.

At whole-terrain focus it asks, “What should we understand, change, or pursue?” At a hypothesis it names the
focus. At a question it offers Ask crew / Find evidence / Make the call / Turn into a pipeline. At Engineer
it directs or repairs the selected move.

The model picker remains one quiet control. The selected model is used by the next structured read or
operator action and persists locally. Product copy says “your runtime,” “your crew,” the teammate's name, or
the selected provider name where that distinction matters.

### 8.4 Truth display

- Observed/cited statements use the existing receipt behavior.
- Founder-stated facts name the founder as source.
- Inferences and bets are visually distinct from truth without using confidence percentages.
- “Why this read” reveals the evidence and reasoning boundary.
- “What would change this” reveals the falsifier or missing evidence.
- Missing evidence is local to the affected hypothesis; it does not blank the canvas.
- Product interpretation never feeds engine health or outcome measurement.

### 8.5 Required states

The complete surface must implement:

- deterministic scanning;
- model read streaming;
- grounded product with no runtime;
- grounded product with no hypotheses;
- partial product model;
- stale terrain read;
- no pipelines;
- one and many pipelines;
- focused question with no crew positions;
- preserved disagreement;
- running move;
- partial node failure;
- one and multiple gates waiting;
- released but unmeasured;
- observed no response;
- joined positive/negative outcome;
- unattributed signal;
- proposed/accepted/dismissed implication;
- runtime disconnect and reconnect;
- process restart and resumed session;
- narrow viewport, keyboard-only, and reduced motion.

## 9. Dependency-ordered implementation workstreams

Each workstream is complete only when its listed evaluations pass. Preserve unrelated dirty-worktree changes.

### T0 — Reconcile the product contract

Work:

- Make this file the final completion target in `00-index.md`.
- Change the primary object in `09-product-room-and-ui.md` to the living product-market terrain.
- Mark `16-product-room-ux-plan.md` as the operation-layer implementation receipt, not the final product
  mental model.
- Reconcile `README.md`, `VISION.md`, `STATE.md`, and reachable UI copy only after behavior lands.
- Keep historical docs historical; do not rewrite history into claims of current behavior.

Acceptance:

- Current docs do not alternately call a pipeline, operation, board, or terrain the primary object.
- State remains honest about the stranger and attributable-win alpha tests.

### T1 — Establish the provider-neutral structured-task runtime

Likely files:

- `brain/src/runtimes/index.mjs`
- `brain/src/runtimes/codex.mjs`
- `brain/src/runtimes/claude-code.mjs`
- `brain/src/agent-bridge.mjs`
- new small adapter only if no existing module can own the shared behavior cleanly
- current `createClaude*` callers on the core path
- `brain/test/runtimes.test.mjs`
- new structured-task contract tests

Work:

- Implement the contract in section 6 with injectable adapters.
- Preserve durable operator-session driving separately from one-shot structured reads.
- Convert product-model derivation first; a Codex-only project must receive the same normalized model shape.
- Keep sandbox, tool, error-redaction, and subscription-auth behavior provider-specific behind the adapter.

Acceptance:

- Identical fixture prompts normalize to the same contract through fake Codex and Claude adapters.
- A provider failure returns an honest partial terrain and never blocks deterministic grounding.
- No core first-use route directly requires `runClaudeQuery`.

### T2 — Build the terrain reader

Likely files:

- new `brain/src/terrain-read.mjs` or a deliberate refactor of `motion-plan.mjs`
- `brain/src/motion-plan.mjs` compatibility adapter
- `brain/src/run-grounding.mjs`
- `brain/src/evidence.mjs`
- `brain/src/feedback-ledger.mjs`
- relevant tests

Work:

- Define the prompt and normalization for section 5.2.
- Consume project-scoped scan truth, full product model, market objects, crew context, capabilities, founder
  taste/terrain decisions, joined outcomes, and implications.
- Preserve opening/tension disagreement and falsifiers.
- Demote unsupported claims and fake citations.
- Produce deterministic projection ids and input fingerprints.
- Keep suggested moves optional and motion kinds open.
- Replay founder corrections without turning them into a hidden filter or authorization.

Acceptance:

- The sample product produces at least one code-supported product-shaped opening and one honest uncertainty.
- A fake code citation is demoted.
- A read with no market evidence labels the market side missing instead of inventing demand.
- A read can return no hypotheses without failure.

### T3 — Extend the canonical terrain projection and routes

Likely files:

- `brain/src/operating-view.mjs`
- `brain/src/woven-graph.mjs`
- `brain/src/routes/operator.mjs`
- new terrain route module if it keeps route ownership clearer
- `brain/src/server.mjs`
- `brain/src/operator-tools.mjs`
- `brain/src/operator-tool-exec.mjs`
- `brain/test/operating-view*.test.mjs`
- new terrain route/project-isolation tests

Work:

- Add deterministic terrain fields and typed hypothesis relationships.
- Keep model spending out of GET.
- Add project-scoped terrain-read POST and optional streaming progress.
- Fix scan/project selection; never use the first workspace as the active product's evidence.
- During project create/re-ground, persist cited product truths from the workspace report through the existing
  idempotent `persistProductTruthsFromScan` path. Do not re-scan and do not wait for an object-graph read.
- Make product-model and terrain reads receive the same project-scoped scan report and grounding timestamp.
- Return honest partial/stale issues per owner.
- Keep existing operating-view response compatible until the UI and MCP migrate.

Acceptance:

- Empty, grounded, partial, stale, multi-project, archived-ref, no-runtime, and populated fixtures are truthful.
- The first terrain GET after project creation contains cited truths without first calling an object-graph,
  market, or pipeline endpoint.
- Reads never mutate project, product model, graph, gate, or outcome authorities.
- No cross-project citation, hypothesis, crew memory, question, or outcome appears.

### T4 — Make the terrain the first screen

Likely files:

- `ui/src/lib/navigation.ts`
- `ui/src/App.tsx`
- `ui/src/api.ts`
- `ui/src/types.ts`
- `ui/src/components/GoalLauncher.tsx`
- `ui/src/components/ProductEntry.tsx`
- `ui/src/components/ProductEntryColumn.tsx`
- `ui/src/components/canvas/GtmCanvas.tsx`
- focused styles and tests

Work:

- Route every grounded product to canvas.
- Default to Operator whenever no pipeline is focused.
- Render deterministic truth before the model read completes.
- Begin the first terrain read with the selected/available runtime and show progressive, contextual work.
- Embed the first goal/model controls in the canvas composer.
- Make runtime connection contextual rather than a full-screen prerequisite for read-only product value.
- Retire GoalLauncher as a base surface after its reusable controls move.

Acceptance:

- A fresh grounded product with zero pipelines never renders the pipeline goal takeover.
- The founder sees cited product understanding before being asked to state a goal.
- With no runtime, truth remains usable and the missing inference state is honest.

### T5 — Render terrain hypotheses and make them actionable

Likely files:

- `ui/src/lib/canvasProjection.ts`
- `ui/src/lib/wovenOverlay.ts`
- `ui/src/components/GraphCanvas.tsx`
- `ui/src/components/canvas/GtmCanvas.tsx`
- `ui/src/components/canvas/wovenNodes.tsx`
- `ui/src/components/ProductEntryColumn.tsx`
- `ui/src/components/canvas/QuestionFocus.tsx`
- new focused terrain component only if existing canvas nodes cannot express the behavior cleanly
- relevant styles and tests

Work:

- Add opening/tension anchors and relationships without rendering a card grid.
- Show provenance, missing evidence, falsifier, crew, and suggested move on focus.
- Make product truths and unknowns focusable.
- Support correct, keep, park, investigate, ask crew, pin as question, and turn into pipeline.
- Preserve product context while sidecars open.
- Keep the initial landmark budget bounded.

Acceptance:

- Observed and inferred claims cannot be visually confused.
- Every hypothesis action reaches an existing authority or operator verb.
- A hypothesis can be explored without creating a pipeline.
- A direct pipeline can still be created without a hypothesis or question.

### T6 — Bind the founder's view to the operator

Likely files:

- `ui/src/App.tsx`
- `ui/src/api.ts`
- `ui/src/components/ComposerDock.tsx`
- `brain/src/operator-store.mjs`
- `brain/src/operator-prompt.mjs`
- `brain/src/routes/operator.mjs`
- `brain/src/operator-tools.mjs`
- operator tests

Work:

- Add surface/lens/focus context to create and resume payloads.
- Persist only useful session context; do not persist transient viewport movement.
- Include active mode and stable refs in the operator system/context brief.
- Update context on the next turn rather than spawning model work on a lens click.
- Make “Ask crew” preserve distinct positions and falsifiers.
- Restore originating terrain focus after Engineer or question work.

Acceptance:

- An operator turn can state whether the founder is in whole-terrain Operator, question focus, or one-move
  Engineer without guessing.
- Project switching cannot reuse another project's focus or session.
- Ask/inspect/focus remain read-only; turn-into-pipeline uses the existing gated compose path.

### T7 — Make a chosen terrain move become the existing pipeline cleanly

Likely files:

- `brain/src/workflow-composer.mjs`
- `brain/src/composition.mjs` or its provider-neutral successor
- `brain/src/project-store.mjs`
- `brain/src/operator-tool-exec.mjs`
- `brain/src/graph.mjs`
- `brain/src/graph-operations.mjs`
- `ui/src/components/canvas/FocusedPipelineReadout.tsx`
- `ui/src/components/canvas/GtmCanvas.tsx`
- composition, anti-cage, wall, and UI tests

Work:

- Carry terrain/question/product/crew refs into the pipeline brief and run lineage.
- Compose an open graph from the selected move; do not stamp a terrain-specific skeleton.
- Switch to Engineer only after a move exists or is explicitly focused.
- Show the intended effect, evidence, uncertainty, measurement intent, and exact gate consequence before graph
  detail.
- Preserve direct graph editing, candidate ghosting where useful, watchable execution, and one gate.

Acceptance:

- Product-shaped, outbound, research, partnership, and unknown future motion shapes all validate through the
  same open graph contract.
- Terrain metadata remains advisory and cannot block pre-gate execution.
- Every execute path retains an upstream gate and composition cannot forge approval/autonomy.

### T8 — Make outcomes visibly teach the terrain

Likely files:

- `brain/src/outcome-ingest.mjs`
- `brain/src/outcome-capture.mjs`
- `brain/src/operating-view.mjs`
- `brain/src/feedback-ledger.mjs`
- `brain/src/memory.mjs`
- `ui/src/components/canvas/OutcomeReturn.tsx`
- `ui/src/lib/canvasProjection.ts`
- `ui/src/components/canvas/GtmCanvas.tsx`
- outcome and learning tests

Work:

- Ensure joined outcomes carry move, question, product, crew, run, and decision refs when available.
- Update deterministic terrain immediately on an outcome or implication.
- Mark the model read stale using its input fingerprint.
- Run at most one budgeted refresh for a significant joined outcome, or offer a founder-triggered re-read.
- Show positive, negative, no-response, unmeasured, and unattributed states distinctly.
- Feed the same joined outcome to future composition and teammate memory without copying its source body.

Acceptance:

- A gate approval alone never changes a hypothesis to “worked.”
- A joined outcome changes the affected terrain context and the next compose grounding.
- An unattributed signal remains visible but cannot claim which move earned it.
- Accepting an implication stages an existing product-change proposal; it never edits product truth directly.

### T9 — Complete UI/MCP and Codex/Claude parity

Likely files:

- `brain/src/mcp.mjs`
- `brain/src/operator-mcp.mjs`
- operator route/tool modules
- runtime modules
- `ui/src/components/AgentPicker.tsx`
- `ui/src/components/ConnectClaude.tsx` or a provider-neutral rename
- reachable provider-specific copy in App, GraphCanvas, ComposerDock, MarketLayers, and helpers
- parity tests

Work:

- Make inspect/focus/ask/propose/record/run address the same terrain refs as the UI.
- Keep legacy MCP tools discoverable while preferred prompts use canonical verbs.
- Complete the full core journey with only Codex connected and with only Claude Code connected.
- Remove provider-specific founder copy from shared behavior.
- Keep provider-specific setup instructions only inside the corresponding runtime card.

Acceptance:

- UI and MCP return the same source ids, question ids, pipeline ids, decision ids, and outcome ids.
- Codex-only and Claude-only contract suites pass.
- Neither runtime can resolve a founder gate, write outside allowed mutations, or access another project.

### T10 — Reliability, accessibility, visual hierarchy, and deletion

Likely files:

- UI state and style files touched above
- route/runtime recovery code
- `brain/test/anti-cage.test.mjs`
- new end-to-end browser tests
- `knip.json`
- current docs and dead components found after migration

Work:

- Cover every state in section 8.5.
- Preserve focus, geometry, active runtime, pending gate, and session on refresh/restart.
- Add keyboard alternatives for every drag/focus action and an ordered-list graph inspection path.
- Verify 1440, 1024, and 390 pixel widths; reduced motion; focus visibility; contrast; overflow.
- Remove the goal-launcher base path, duplicate operation/board surfaces, stale provider copy, and dead adapters
  only after callers migrate.
- Run dead-code inspection and document intentional compatibility shims.

Acceptance:

- No horizontal or modal collision hides the terrain, composer, or founder wall at required widths.
- A keyboard-only founder can reach a hypothesis, ask the crew, create/focus a pipeline, inspect the gate,
  and return.
- Process/runtime failure preserves completed work and offers a useful recovery.
- The terrain remains the dominant visual object when pipelines exist.

### T11 — Walk the alpha acceptance loop

Work:

- Use a real founder codebase, not only a fixture.
- Connect either Codex or Claude Code through the normal product setup.
- Let Drover produce the initial terrain without supplying a goal first.
- Choose one code-native or product-shaped opening.
- Investigate or correct it with the crew.
- Turn it into a real pipeline and run to the founder wall.
- Approve the outward effect through the real gate and any required second authorization.
- Capture a real market response and prove its attribution path.
- Re-open the product and show that the terrain, next composition, and coding context received the learning.
- Give the product to a founder Jacob did not recruit and observe whether they survive the same path without
  explanation.

Acceptance:

- The alpha loop produces one real attributable win or an honest negative result with complete lineage.
- A stranger completes the flow without intervention.
- A negative market result does not get renamed success.
- Only this live result can move the stage claim; unit and browser tests cannot.

## 10. Executable evaluation suite

The evaluation stack has four gates. A lower gate cannot substitute for a higher one.

### Gate A — deterministic contracts on every change

Run through the canonical `npm test` chain:

- scanner evidence and project isolation;
- terrain normalization, provenance demotion, and fingerprinting;
- provider-neutral structured-task contracts;
- deterministic terrain projection;
- operator context and stable refs;
- open graph composition;
- founder wall and browser-only authorization;
- outcome joins and learning;
- anti-cage tests;
- UI unit tests, lint, typecheck, and production build.

Required new/extended test files:

- `brain/test/terrain-read.test.mjs`
- `brain/test/terrain-view.test.mjs`
- `brain/test/terrain-routes.test.mjs`
- `brain/test/structured-task-runtime.test.mjs`
- existing product-model, motion-plan compatibility, runtime, operator, MCP, outcome, graph security, workflow
  composer, and anti-cage tests
- `ui/src/lib/terrainProjection.test.ts`
- navigation, ProductEntryColumn, GtmCanvas, QuestionFocus, OutcomeReturn, ComposerDock, and API wiring tests
- an App-level first-use state test proving grounded-with-zero-pipelines renders terrain, not GoalLauncher

### Gate B — deterministic browser journey for every release candidate

Add an automated browser suite that boots Drover with an isolated temporary store, the bundled sample repo,
and injectable fake structured-task/runtime responses.

It must prove:

1. Create or re-ground the sample product.
2. See cited truth before any goal field is required.
3. Watch three fixture hypotheses arrive progressively.
4. Inspect evidence and falsifier.
5. Ask two teammates, preserve disagreement, and keep each teammate's stable illustrated character visible
   from the canvas into the conversation.
6. Turn one hypothesis into a non-fixed-shape pipeline.
7. Switch to Engineer and inspect the intended effect/gate consequence.
8. Run to the wall; prove no release before a browser founder action.
9. Approve the fixture action; record a joined result.
10. Return to Operator and see the affected terrain and stale/refreshed read.
11. Refresh and recover the same project, focus, geometry, session, and gate/outcome history.

Run the same journey at 1440x900, 1024x768, and 390x844, plus a keyboard-only pass. Fail on console errors,
unhandled rejections, inaccessible unlabeled actions, clipped primary controls, or an initials-only teammate
shown during a normal rendered state.

### Gate C — local-runtime smoke before a candidate is called complete

Run separately with:

- only Codex authenticated;
- only Claude Code authenticated;
- neither authenticated;
- both authenticated with an explicit model selection.

For each connected runtime, prove product-model read, terrain read, crew ask, composition, run-to-gate, gate
resume, and session resume. The disconnected case must still render deterministic truth and existing state.

Live model output is graded on contract, not exact wording:

- product specificity;
- real citations where it claims derivation;
- honest market uncertainty;
- at least one product-shaped possibility when the code supports one;
- distinct teammate positions;
- no fixed motion-kind collapse;
- no raw runtime or prompt plumbing in founder copy.

### Gate D — alpha product eval

This is the human, real-product test from T11. Record:

- product and repository;
- runtime and model;
- the initial terrain screenshot;
- which claim was observed, inferred, or speculative;
- founder corrections;
- chosen move and graph;
- gate receipt and outward effect;
- outcome source and attribution join;
- what changed in the next terrain/compose/coding context;
- where the stranger hesitated or failed.

Pass requires the real loop and stranger survival. A beautiful fixture or green suite is not a pass.

## 11. Named evals

| ID | Eval | Pass condition |
|---|---|---|
| E0 | Anti-cage | No new required opportunity/question/program/policy/stage object; terrain hypotheses cannot gate a run |
| E1 | Grounded reveal | A zero-pipeline product opens on Operator terrain with cited truth before a goal request |
| E2 | Honest inference | Unsupported citations demote; absent market evidence is named; no inference renders as observed truth |
| E3 | Product specificity | The read names product-shaped leverage from real code instead of generic GTM advice |
| E4 | Crew judgment | Two teammates can disagree with separate evidence, uncertainty, recommendations, and falsifiers |
| E5 | Optional focus | A hypothesis/question can be explored without a pipeline; a direct pipeline can bypass both |
| E6 | Operator context | The runtime receives current surface/lens/focus on the next turn and preserves it across resume |
| E7 | Open move | Turning a focus into a pipeline composes an open graph with no fixed stage skeleton |
| E8 | Wall | Every outward or durable effect retains founder authorization; neither runtime can self-approve |
| E9 | Watchable execution | Real step progress, redirection, partial failure, retry, and one anchored gate remain visible |
| E10 | Outcome return | A joined positive, negative, or zero result returns to its actual product/question/move/crew refs |
| E11 | Terrain learning | The outcome immediately updates deterministic terrain and changes the next model read/compose context |
| E12 | Attribution honesty | Unjoined signals remain unattributed; approval/release is never counted as market success |
| E13 | Runtime parity | The complete core journey passes with Codex-only and Claude-only authentication |
| E14 | UI/MCP parity | Inspect/focus/ask/propose/record/run address the same durable refs in both surfaces |
| E15 | Project isolation | Product truth, hypotheses, sessions, crew memory, gates, and outcomes never cross projects |
| E16 | Recovery | Runtime disconnect, process restart, stale scan, and interrupted run preserve state and offer recovery |
| E17 | Accessible canvas | Desktop, narrow, keyboard, reduced-motion, focus, and overflow checks pass |
| E18 | Idle cost | Deterministic reads make no model calls; idle runtime makes no model/probe calls |
| E19 | Alpha loop | A real attributable result returns through the loop and an outside founder survives it |

## 12. Test fixtures

Maintain three fixtures:

1. **Bundled sample product.** Deterministic public fixture for CI. It must contain real code evidence for a
   win event, attribution gap, invitation/share behavior, and a product-shaped possible move.
2. **Dense operation fixture.** Two products, several pipelines of different shapes, shared objects, two
   pending gates, disagreement, positive/negative/unmeasured outcomes, an unattributed signal, and stale
   terrain data. This grades scale, joins, isolation, and visual hierarchy.
3. **Private real-product acceptance fixture.** EstateSaleUSA or another founder product, stored outside the
   repository. No private code, customer details, or screenshots are committed. It grades the alpha loop.

Fake model outputs live in tests and deliberately include:

- valid code-derived opening;
- speculative opening;
- tension with counterevidence;
- fake citation requiring demotion;
- no-hypothesis response;
- malformed output;
- provider timeout/quota error;
- disagreement from two crew members;
- outcome-driven changed read.

## 13. Parallel execution map

After T0, implementation may run in four lanes with these ownership boundaries:

- **Lane A — intelligence and truth:** T1–T2. Owns structured runtime, terrain prompt, normalization, and
  evidence demotion.
- **Lane B — projection and APIs:** T3 plus the backend portions of T6/T8/T9. Owns canonical refs, route
  shapes, project scope, operator context, and outcome projection.
- **Lane C — canvas experience:** T4–T5 plus UI portions of T6–T10. Owns navigation, hierarchy, focus,
  composer, state rendering, accessibility, and visual verification.
- **Lane D — execution safety and evals:** T7 wall/composition tests, the Gate A/B/C harness, fixtures,
  anti-cage checks, and cleanup inventory.

Merge order:

1. T1 structured-task contract.
2. T2 terrain normalization.
3. T3 deterministic route contract.
4. T4 first-screen navigation.
5. T5 focus interactions.
6. T6 view-context binding.
7. T7 pipeline handoff.
8. T8 outcome learning.
9. T9 parity.
10. T10 full verification and deletion.
11. T11 live alpha walk.

No lane may invent a parallel shape for another lane's authority. Shared response types land before UI and
MCP consumers. Wall changes merge only with their security regressions.

## 14. Definition of complete

This direction is complete only when all of the following are true:

- A grounded zero-pipeline product opens on the terrain, not a goal launcher or empty Engineer graph.
- The first screen proves product understanding with receipts and presents credible, clearly inferred areas
  of focus.
- The founder can understand, correct, investigate, ask the crew, and choose without first creating a
  pipeline.
- The chosen focus becomes the existing open pipeline and Engineer view without a new domain layer.
- The runtime knows the founder's active context.
- Codex and Claude Code both complete the same core journey.
- The founder wall is unchanged and tested across browser, API, MCP, code-change, send, and deploy paths.
- A real outcome visibly teaches the terrain, the next composition, the crew, and the coding context.
- UI and MCP address the same durable refs.
- Empty, partial, error, stale, resumed, narrow, keyboard, and no-runtime states work.
- `npm test`, deterministic browser evals, both local-runtime smokes, and the live alpha eval have recorded
  receipts.
- Dead goal-first and provider-specific core paths are removed or explicitly documented compatibility shims.
- `docs/STATE.md` reports only what the code and walked evals prove.

The final product statement should be true without explanation:

> Drover reads your product, shows where it may have leverage, gives you a crew to work the uncertainty,
> turns your choice into a safe go-to-market move, and brings the market's answer back to what you build.
