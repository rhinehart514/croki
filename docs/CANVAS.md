> **SUPERSEDED — 2026-07-01.** This describes the build-your-own canvas of the earlier
> "IDE for GTM" version of the product. The current plan of record is
> **docs/GTM-ENGINE-REBUILD.md**, where the canvas is repurposed into a phased read-only
> then interactive reasoning surface (Phases 3 and 7). Where this doc conflicts with
> that spec, the spec wins. Kept for history only.

---

# CANVAS — the object-model canvas (P10)

## North star

The canvas is a **projection over an object model**, not a fixed diagram. At scale
(10–30+ sources, intertwined pipelines, many ICPs, concurrent experiments) a single
spatial diagram dies — 30 pipelines drawn as one node graph is unreadable, and 30
swimlanes hide the very thing that matters: the intertwining. The canvas survives by
becoming one lens onto a shared object model — the IDE pattern (tree + search +
find-references + a Problems panel + lenses), where the editor tab shows one thing and
the structure handles scale.

## The finding that sets the route

**Product mode already does this.** `ProductCanvas` projects the `ProductModel`
(`things` / `relationships` / `userGoals` / `states`) through five lenses (Conceptual
object-graph with a radial hub, Jobs, IA, Workflow, Interaction), with selection that
persists across lens switches. No swimlanes; shared objects are shared nodes. **GTM
mode** (`GraphCanvas`) is the laggard — a single workflow graph, or a swimlane union via
`portfolio-graph.mjs`.

P10 converges GTM mode onto the Product-mode pattern: **one canvas engine, two object
models, across the truth wall.**

## The model

- **One canvas engine** renders `projection(objectModel, lens)`. Lenses give altitude;
  shared objects are shared nodes (the intertwining shows as convergence, not adjacency);
  selection persists across lenses; focus-to-trace highlights an object's subgraph and
  recedes the rest (find-references, rendered spatially). Semantic zoom manages density.
- **Two modes = two object models:**
  - **Product mode** projects the interpretive `ProductModel` — truth-walled, never feeds
    health.
  - **GTM mode** projects the **GTM operational object model** — real state: Pipelines
    (`channel` in code), Sources, People, Claims, Experiments, ICPs, Outcomes.
- **The truth wall** (`docs/PRODUCT-MODEL.md`): the product-understanding model is
  interpretation and must never feed engine/measure health. The GTM operational objects
  are real state and DO drive health. The two object models never cross.

## The object layer — what exists, what's the gap

Already first-class shared (in `project.sharedContext`, referenced across pipelines):
**ICP**, **Positioning**, **Claims** (flat `string[]`), **Experiments**
(`hypothesis` / `variable` / `heldConstant` / `successSignal` / `status`), **Outcomes**,
**FounderTaste**; **AgentInstance** shared by `ref`. The object layer is more built than
it looks — most of the substrate already exists.

The keystone gap: **Person.** Entrants are ephemeral run items (they live only inside the
last 50 runs and roll off); there is no durable identity and no cross-pipeline reference.
A `contacts: {}` stub already sits in `sharedContext` as the slot waiting for this object.

Smaller gaps: **Claim** needs structuring (string → object with provenance + version);
**Experiment** needs variant-vs-control tracking.

## Person — the keystone object

- Durable, project-scoped, shared across pipelines. Stable identity key (email / handle /
  domain), so the same human is one object everywhere.
- Created by **promoting run entrants**: when a run produces items that name a real
  person or org, upsert a `Person` and append an appearance
  `{ channelId, runId, role, trigger, at }`. The per-appearance trigger is the why-now
  that found them in that pipeline.
- Carries: identity, the appearances across pipelines, and a derived view (where seen, how
  many pipelines, last touch).
- Enables **find-references** (where does this person appear), **dedup**, **fatigue
  control** ("don't hit them from three angles this week"), the **experiment matrix**, and
  the **portfolio Problems rail**.
- New store `brain/src/person-store.mjs`; the `contacts` stub becomes real People. It is
  real GTM state derived from runs — never seeded — and it never sends. Identity and any
  enrichment are read-only state.

## Cross-reference index

"Where does X appear" as a real query for Person / ICP / Claim / Experiment across all
pipelines. New `brain/src/cross-reference.mjs` (or folded into the relevant stores). Powers
focus-to-trace on the canvas and the portfolio Problems rail.

## GTM lenses (replace swimlanes)

- **Pipeline flow** (the `channel-flow` lens) — today's `GTMGraph` (one pipeline's
  Source → … → Gate → Measure).
- **People** — the shared People and their cross-pipeline appearances.
- **Experiment matrix** — ICP × claim × pipeline grid of live hypotheses: which cell runs,
  which claim wins in which ICP, what to kill.
- **Portfolio map** — pipelines and experiments as tiles (health + ICP + claim + status),
  zoomable down into one pipeline's flow.

Swimlane rendering (`portfolio-graph.mjs` lane bands, `GraphCanvas` overview lanes)
retires.

## Composer controls the canvas, locked to the project

- **One operator conversation per project** is the dock's default thread — durable,
  resumable. Past sessions are reopenable history.
- `projectId` is threaded **explicitly** through create/resume, never inherited from a
  mutable global. This removes the `viewingMismatch` band-aid — there is nothing to
  mismatch when the composer can only be talking about the project the canvas shows.
- **Two channels, composer → canvas:** *view-control* (free, instant — focus / frame /
  select / highlight-problem) and *mutation* (proposed, ghosted, gated). View-control is
  navigation and never touches the wall; mutation stays behind the founder gate.

## Card language re-axed to GTM objects

Cards are typed by **GTM object**, not mechanical kind. Headline = the job; mechanism =
a quiet label; a **judgment verdict** (grounded / assumed / generic / blind) replaces the
bare health number; the indigo is killed (proposed / cursor read through the ink ramp +
dashing, not a fourth hue). Card types: **Source / Teammate / Step / Gate / Measure**,
plus a lane-level **Claim** header every card inherits and traces to. Extends
`docs/design/node-cards.md`. The Source card is designed (`.design-shots`).

## Phases (P10 sub-steps)

Status (2026-06-27): **P10.1–P10.6 landed.** `npm test` green — 354 backend tests, lint clean
(one pre-existing unrelated warning), tsc + Vite build compiles. The object-model canvas, the four
GTM lenses, the re-axed cards, the Person/Claim/Experiment objects, and the project-locked composer
are all in; swimlanes and the `viewingMismatch` band-aid are deleted.

- **P10.1 — Person keystone (backend).** `person-store.mjs`, run-entrant promotion,
  cross-reference index, MCP + server read endpoints, tests.
- **P10.2 — Claim + Experiment (backend).** Structure Claims (string → object with
  provenance + version); add Experiment variant-vs-control tracking; tests.
- **P10.3 — One canvas engine (frontend).** Extract the projection + lens shell from
  `ProductCanvas`; GTM mode projects the operational object model through the GTM lenses;
  retire swimlanes.
- **P10.4 — Card language re-axed.** Source / Teammate / Step / Gate / Measure / Claim;
  verdict badge; kill indigo.
- **P10.5 — Composer controls canvas + locked to project.** View-control channel; one
  conversation per project; `projectId` threaded, not inherited; remove `viewingMismatch`.
- **P10.6 — Cleanup + docs.** Delete legacy (swimlanes, cut-lens traces, dead taxonomy
  remnants); update docs; `npm test` green; browser-checked.

## Done = proven

Each sub-step ships with `npm test` green and the visible behavior checked. The truth wall
holds: the product-understanding model never feeds health. Person / Claim / Experiment are
real GTM state derived from real runs, never seeded; the canvas never sends or publishes —
it stays vibe-up-to-the-gate.
