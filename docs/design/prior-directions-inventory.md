# Prior design directions — inventory for the ADE exploration

**Dated:** 2026-07-15. **Audience:** frontier coding agents and the founder.
**Purpose:** classify every prior design direction under `docs/design/` so the upcoming ADE/docked-shell
exploration can carry forward the good ideas and retire the dead ones deliberately.

## How to read this

The current build direction has three authoritative anchors, in order:

1. `ux-divergence-2026.html` (2026-07-15) — **the ADE frame itself**: left rail / center-stage atlas /
   docked right inspector / bottom activity console, plus the spatial-integrity engine, semantic altitude,
   and language rebuild. This is the doc the exploration extends. It is grounded against the live app and
   names its own unproven risks. Treat it as the design spine.
2. `immediate-working-theory.md` + `drover-completion-plan.md` — **the signature interaction contract**:
   one plain sentence draws a provisional editable working theory and begins useful inward work; no
   empty-architecture approval first; founder language never exposes internal nouns.
3. `venture-architecture-adaptation/LIVING-VENTURE-ATLAS-SPEC.md` — **the durable model and grammar**:
   five architecture roles (concept, product loop, system, motion, campaign), placement-is-presentation,
   evidence joins, semantic-zoom altitudes, the wall.

`../FIRM-SPEC.md` governs product physics; `../STATE.md` is the dated proof boundary; `DESIGN.md` is the
extracted design-system record. Everything classified below is judged against those anchors.

Verdicts: **LIVE** = still describes shipped or committed-current behavior. **MINE** = superseded as a
whole but holds specific ideas/components worth carrying into the ADE frame. **DEAD** = fully superseded,
history only.

## Summary table

| Doc | Verdict | What to carry forward (or why retired) |
|---|---|---|
| `ux-divergence-2026.html` | **LIVE** | The ADE frame + four moves. This is the exploration's spine. |
| `immediate-working-theory.md` | **LIVE** | Signature-interaction + language contract. North star. |
| `drover-completion-plan.md` | **LIVE** | Executable completion sequence (WT1–WT7) for the signature flow. |
| `venture-architecture-adaptation/LIVING-VENTURE-ATLAS-SPEC.md` | **LIVE** | Durable model, visual grammar, altitude spec, wall, evidence joins. |
| `venture-architecture-adaptation/` (prototype, polish gate, mobbin, evidence) | **LIVE** | Standalone atlas prototype + ship-gate checklist + Mobbin receipt. |
| `drover-working-theory-spec/index.html` | **LIVE** | Narrative product bible / signature-moment framing. |
| `DESIGN.md` (design/) | **LIVE** | Canonical design-system record: tokens, atlas grammar, primitive inventory. |
| `orbital-atlas.md` | **MINE** | Dive-as-spine, machinery glyph, gate inspector, radius=proximity — implemented; propose-first ceremony is DEAD. |
| `orbital-atlas-build.md` | **MINE** | Packages 1–3, 5–7 (foundations, dive, craft, motion, a11y) LIVE; Package 4 propose-first DEAD. |
| `orbital-atlas-brain.md` | **LIVE** | B1–B5 brain projections (workflow projection, drive→stage join, effect metadata) are required execution truth. |
| `orbital-atlas-elevation.md` | **MINE** | Elevation decisions (retractable chrome, named gaps, camera insets) LIVE; orbit-specific pixels superseded. |
| `frontier-ux-research.md` | **MINE** | "Living proof scene" = current direction; shipped-comparable map (Codex/Cursor/Linear/Notion/Figma/Miro/GitHub) is high-value. |
| `PRODUCTION-UX-PLAN.md` | **MINE** | Non-negotiable experience contract + Mobbin research + gap ledger. Workyard-era but the rules and comparables carry. |
| `workyard.md` | **MINE** | The bet/work near-altitude — still the Focus depth inside the atlas. Territory-with-workpieces + selection-as-supervision language. |
| `LIVING-PIPELINE-PLAN.md` | **MINE** | Switch node + living grammar (conviction=weight, moving-dot tense, retired-collapse) as canvas vocabulary; pipeline framing DEAD. |
| `node-cards.md` | **MINE** | Brand-glyph MCP treatment (monochrome-at-rest, brand-on-focus) + read/write lane chip. Workflow-node framing DEAD. |
| `connect-capability.md` | **MINE** | The wall pattern: read/write seam, amber=gated, weighty "loosen" confirm. |
| `agent-profile.md` | **MINE** | Role-as-identity monogram (family-tinted) + "what I'm learning" spine for the inspector's machinery depth. |
| `agent-picker.md` | **MINE** | Fit-at-this-slot matching (input contract vs emitted tokens) for any future picker. |
| `composer.md` | **MINE** | Voice-state rainbow as the one bespoke hero moment on a monochrome composer. |
| `composer-redesign.md` | **MINE** | Three-zone composer + @-mention crew/capability chips + summoned parts tray + "one tile, four places." |
| `build-room.md` | **MINE** | Coupling (chat line + canvas card share one token/label) + reversible receipt cards. |
| `outcome-switcher.md` | **MINE** | Flat-unless-nested IA discipline for lists/switchers. |
| `add-step-menu.md` | **MINE** | `.menu-primary` elevated lead-action row primitive. |
| `workflow-authoring-contract-audit.md` | **MINE** | Contract-audit panel: scannable graph-issue list, focus-node-on-select. |
| `capability-density/` (12 explorations) | **MINE** | Explicit-edge causal reasoning, evidence→artifact directness, whole-venture branching, meaningful-signal filtering, single-mind facade, config-as-canvas-projection. |
| `PORTFOLIO-FRONTIER-GATE.md` | **LIVE** | Proof-gated venture-transfer contract (export/import schema, refork rules). |
| `PRODUCTION-FOUNDER-SCRIPT.md` | **LIVE** | Outside-founder comprehension proof harness (seven-question script). |
| `frontier-ux-research.md` comparables | (see MINE above) | — |
| `shell-ide-ia.md` | **DEAD** (mines one idea) | Channel/explorer IDE ontology retired; carry only "one-object tree + summonable panels" IA reasoning. |
| `ide-done-right-ia.md` | **DEAD** (mines one idea) | Outcome/program ontology retired; carry Approvals-as-VS-Code-Source-Control-badge + review-first home reasoning. |
| `one-canvas.md` | **DEAD** | Altitude-ladder + belief-board + pipeline ontology, zinc/blue skin. Fully superseded. |
| `gtm-engine-canvas.md` | **DEAD** | "GTM engine / channels / feeds / two cursors" ontology + glass skin. Superseded. |
| `emergent-motion-engine.md` | **DEAD** | Ground→Gate→Measure→Learn stage frame + motion-enum removal. Its anti-cage lesson lives in FIRM-SPEC. |
| `workflow-builder-native.md` | **DEAD** | Drover is not a workflow builder. Zinc/Retool skin retired. |
| `project-opportunity-studio.md` + `-results.md` | **DEAD** | Six-screen opportunity-studio flow; surface removed from code. Conflicts with "help this venture grow." |
| `bet-regions/` (prototype) | **DEAD** (mines one idea) | Bet-room/command-map compositions superseded by spatial-integrity auto-layout; carry only the wall. |
| `engine-canvas-directions.html` | **DEAD** | Shared-engine topology study for a different product (GTM IDE / RodentRadar). |
| `venture-architecture-adaptation/DECISION-PACKAGE.md` | **DEAD** (as UX) | Decision rationale + rejected alternatives; its ontology/UX explicitly superseded by the sibling SPEC. Keep as dated evidence. |
| `venture-architecture-adaptation/AUTHORITY-CHANGESET.md` | **DEAD** (applied) | Doctrine-edit ledger, already applied to FIRM-SPEC/STATE/DESIGN. Not a live backlog. |
| `evidence/` (screenshots, a11y notes) | **LIVE** (as evidence) | Workyard receipts under `evidence/workyard/`; current atlas receipts under `evidence/venture-atlas/`. |

## Carry-forward ideas (every MINE idea, with source and why it matters for the ADE frame)

The ADE frame is four regions — **left rail** (the firm), **center stage** (the atlas), **docked right
inspector** (context on selection), **bottom activity console** (live agent work) — plus a command
palette and minimap. The ideas below are grouped by which region or layer they feed.

### Center stage — the atlas canvas

- **Dive-as-spine + machinery glyph + gate inspector** — `orbital-atlas.md`, `orbital-atlas-build.md`
  (Packages 3, 5), `orbital-atlas-brain.md` (B1, B5). Selecting a bet unfolds its workflow chain in
  place; each work node carries a live miniature of its run chain (filled/ringed-amber/hollow pips with
  real counts); the gate opens an inspector showing the exact held artifact, what releasing does
  (count, from-address, cost, reversibility), and Review/Hold. This is the implemented Focus-depth
  vocabulary — it maps directly onto the ADE's "Focus" altitude and the right inspector's gate/effect
  detail. The brain projections (`projectBetWorkflow`, drive→stage causal join, effect consequence
  metadata) already supply the data honestly (absence rendered as absence).
- **Radius = proximity to a decision** — `orbital-atlas.md`. Spatial position encodes how close work is
  to needing the founder. A carry-forward *encoding principle* even if the literal orbit rings are
  superseded by collision-free auto-layout.
- **Workyard territory-with-workpieces** — `workyard.md`. At Focus depth, a unit of work is a bounded
  spatial territory containing independently targetable, heterogeneous workpieces (prose, diff, payload,
  receipt, returned voice) — not one summary card and not a kanban. Owner portrait at the corner,
  contributors stacked outward. This is the atlas's near/Focus altitude; keep it.
- **Selection-as-supervision language** — `workyard.md`. No selection targets the venture; one teammate
  targets that teammate; a territory targets the work; a workpiece targets its exact `workRef`. The
  composer names and locks the full target before dispatch and prompting never navigates away. This is
  the interaction contract that makes the docked composer + right inspector coherent.
- **Living grammar: conviction=weight, moving-dot tense, retired-collapse** — `LIVING-PIPELINE-PLAN.md`.
  Conviction shown as ink darkness + stroke weight (never hue); "live now" as a moving ink dot on the
  edge (causality, not glow); retired work collapses to a count chip. A skin-independent visual language
  for showing state on the canvas without color abuse — directly useful for the altitude renderings.
- **Switch node** — `LIVING-PIPELINE-PLAN.md`. Conditional routing as a first-class, open (non-enum)
  node kind if branching logic ever needs to be visible on the canvas. Lower priority; the pipeline
  framing around it is dead.
- **Brand-glyph capability treatment** — `node-cards.md`. MCP/capability nodes show the real service
  mark monochrome-at-rest, blooming to brand color on focus; a read/write "lane chip" (Runs free / Behind
  your gate). Recognition where attention already is, calm otherwise. Feeds capability nodes on the stage
  and in the left rail's capabilities section.

### Left rail — the firm

- **Fit-at-this-slot matching** — `agent-picker.md`. When picking a teammate/capability, compare its
  input contract against what the context emits and show start/fits/partial/needs/unknown. Useful for any
  crew/capability picker summoned from the rail.
- **Flat-unless-nested IA** — `outcome-switcher.md`. One row per item; introduce nesting/grouping only
  when the work actually spans 2+ children. A hierarchy discipline for the rail's venture/crew lists.
- **One-object tree + summonable panels** — `shell-ide-ia.md`, `ide-done-right-ia.md`. The Cursor-class
  IA insight: the rail holds one primary object type as a legible tree, and secondary concerns
  (approvals, problems, runs) are summoned panels, not competing nav modes. The *channel/outcome
  ontology* those docs carried is dead; the IA reasoning is exactly what the ADE left rail needs.

### Docked right inspector — context on selection

- **Role-as-identity treatment** — `agent-profile.md`. Present a teammate as a person, not a file:
  family-tinted circular monogram (research/qualify/write function families), role name, mission, and a
  "what I'm learning" timeline (the gate-decision → lesson loop made visible). This is the machinery-depth
  inspector content when a crew member is selected.
- **Contract-audit panel** — `workflow-authoring-contract-audit.md`. A scannable list of derived issues
  for a selected structure, focusing the governed node on selection. A pattern for surfacing "what's
  incomplete here" in the inspector without inventing a status field.
- **Effect consequence metadata** — `orbital-atlas-brain.md` (B5). At the wall/gate, the inspector shows
  from-address, destination, cost, and reversibility *only when the real effect supplies them*, and names
  the genuinely-missing detail otherwise. The honesty contract for the inspector's release view.

### Docked composer + conversation

- **Three-zone composer + one-tile-four-places** — `composer-redesign.md`. Chrome / response / input
  zones; @-mention crew and capabilities as inline chips that autocomplete from the real bench; a summoned
  (not always-on) parts tray; the same crew tile appears in the @-menu, tray, response, and plan. Lets a
  dense composer hold many affordances without reading as clutter — the docked-composer design.
- **Coupling (chat + canvas share one token/label)** — `build-room.md`. The chat line that describes an
  act and the canvas card that materializes it share a token and object label, so sentence and node read
  as one event. This is the mechanism behind the signature "type a sentence → theory draws itself"
  moment; reversible receipt cards give it undo.
- **Voice-state rainbow** — `composer.md`. The one place the monochrome system erupts into full spectrum
  is the voice-input state — color earned by a state, not resting decoration. A candidate for the single
  bespoke hero moment on the docked composer.

### Bottom activity console — live agent work

- No prior doc designed this region directly (it is new in `ux-divergence-2026.html`), but the **watchable
  work** contract from `PRODUCTION-UX-PLAN.md` (rule 7: real host-observable events, elapsed time, first
  durable artifact, cost receipt — never a progress percentage or looping theater) and the
  `ActiveWorkReceipt` primitive in `DESIGN.md` are exactly what the console renders. Carry that honesty
  contract into the console.

### Cross-cutting — research, comparables, and contracts

- **Shipped-comparable map** — `frontier-ux-research.md` and `PRODUCTION-UX-PLAN.md`. The two richest
  comparable inventories in the repo, each citing what a shipped product proves and what to reject:
  - Codex app (project threads, worktrees, inline diff, review queue) — borrow isolated work + in-thread
    review; reject a per-task scheduler.
  - Cursor Agents/Canvases/worktrees — borrow direct pointing + background/foreground handoff; reject a
    tiled wall of agent chats.
  - Linear Agents / coding sessions — borrow separation of contribution/ownership/authority; reject
    issues+statuses as the universal model.
  - Notion Custom Agents — borrow versioned access + failure receipts; reject per-agent trigger builders.
  - Figma design agent — borrow selection-scoped prompting + parallel alternatives; reject letting the
    canvas own durable truth.
  - Miro Sidekicks — borrow quiet canvas presence + attached suggestions; reject format libraries + Flows.
  - GitHub deployment protection — borrow a boundary that withholds the capability itself; reject
    admin-bypass and bundled approve-and-deploy.
  - `venture-architecture-adaptation/MOBBIN-RESEARCH-RECEIPT.md` adds: Fibery text-to-entity (delayed
    structure), Reflect graph (semantic reduction at distance), Google Maps (scale-dependent
    representation), Airbnb selected-place (anchored detail), Mural direct manipulation; n8n rejected as
    machinery-dominant. These directly inform the altitude system and the inspector.
  - `PRODUCTION-UX-PLAN.md` also cites Linear inbox split, Asana requires-your-action, Klarna delivery
    detail (disclosure order), Reddit/WRITER/Relevance/Manus (delegate-watch-review). All Mobbin-verified.
- **The wall pattern** — `connect-capability.md`, `bet-regions/`, `workyard.md`. A boundary that divides by
  class (read runs free / write waits), amber as the safety semantic, weighty confirmation to loosen. The
  wall is load-bearing across the whole ADE (composer, inspector, console all defer to it).
- **Non-negotiable experience contract (12 rules)** — `PRODUCTION-UX-PLAN.md`. Return outranks prompt;
  the wall is the return surface; firm speaks/canvas proves; selection preserves place; truth has visible
  grammar (receipt vs join vs inference vs unattributed, distinguishable without color); work is watchable
  and leaveable; stop ≠ end; no machinery creep. These translate FIRM-SPEC into build constraints and
  apply unchanged to the ADE.
- **Capability-density explorations (12)** — `capability-density/`. Superseded as whole directions, but
  each names one idea worth testing inside the ADE:
  - *Explicit-edge causal reasoning* (01-causal-canvas): connections state *why* two things relate, not
    just that they do — keeps the canvas legible as agents add to it.
  - *Evidence→artifact directness* (02-artifact-studio): pin evidence to the exact choice it informs;
    experience variants directly rather than described.
  - *Whole-venture branching* (03-venture-multiverse): fork product + positioning + channel as one
    coherent operation, not isolated feature variants.
  - *Meaningful-signal filtering* (04-ambient-firm): return only what changes future work — the
    attention-tax discipline for the activity console and return briefing.
  - *Single-mind facade* (agents/01-venture-mind): one coherent intelligence over multi-agent internals;
    memory belongs to the venture, not synthetic personas. Likely the better fit than surfacing an
    agent roster.
  - *Config-as-canvas-projection* (configurable-firm/03 + 05-chat-canvas): configuration and canvas are
    two views of one versioned state; direct-manipulation config shapes the live stage, language edits
    return inspectable diffs. Feeds "configuration is use, not administration."
- **Completion + proof harnesses** — `drover-completion-plan.md` (WT1–WT7 build sequence for the
  signature flow), `PRODUCTION-FOUNDER-SCRIPT.md` (seven-question outside-founder comprehension test),
  `PORTFOLIO-FRONTIER-GATE.md` (venture-transfer schema), `venture-architecture-adaptation/PRODUCTION-POLISH-GATE.md`
  (ship-gate checklist). LIVE scaffolding the exploration should build toward, not re-derive.

## Contradictions to retire deliberately

These prior docs actively conflict with the ADE/docked-shell direction. They already carry supersession
banners, but the exploration should treat their *interaction models* as retired, not merely archived —
because fragments of each are still tempting and some still leak into production (see STATE.md "What
remains unproven").

- **`ide-done-right-ia.md` and `shell-ide-ia.md` — the channel/outcome IDE ontology.** Both center a
  *different* primary object (Channels; then Outcomes/Programs) and a Design/Simulate/Run/Review/Learning
  lifecycle nav. The ADE keeps their *shell shape* (rail + center + inspector) but the atlas — not a
  program list or a wiring graph — is the center object, and there is no lifecycle-mode nav. Retire the
  ontology; keep only the IA reasoning noted above. Risk: their rail models are close enough to the ADE
  left rail to be re-imported wholesale by mistake.
- **`gtm-engine-canvas.md` — "your GTM is one engine with channels and feeds."** Directly contradicts the
  Living Venture Atlas ("show the venture, not the machinery"). Channels-as-primary-object and the
  two-cursor co-pilot model are superseded. The glass skin conflicts with the warm-mineral system in
  `DESIGN.md`.
- **`one-canvas.md` — the altitude-ladder over a pipeline/belief-board.** Its L0–L3 altitudes are a
  pipeline zoom, not the atlas's semantic altitude; its 9-layer belief board and zinc/blue/Geist project
  skin are both retired. The *word* "altitude" survives but means something different now.
- **`workflow-builder-native.md` and `emergent-motion-engine.md` — Drover as a workflow/pipeline builder.**
  FIRM-SPEC's deletion ledger explicitly kills "the executable graph as the product." The ADE stage is a
  venture atlas, not a node-wiring surface. `emergent-motion-engine`'s anti-cage lesson (no fixed motion
  enum) is preserved in FIRM-SPEC; its stage-frame UI is not.
- **`project-opportunity-studio.md` — the six-screen opportunity-selection flow.** A pre-work approval
  wizard (pick product → scan → review candidates → compose → canvas). Directly contradicts "help this
  venture grow" (no approval before useful work) and the surface is already removed from code. Do not
  revive a pre-canvas wizard.
- **`orbital-atlas.md` / `-build.md` Package 4 — the propose-first signature moment.** The single most
  important contradiction to hold: the orbital-atlas foundation is LIVE, but its climactic moment ("a
  plain ask materializes a staged whole-system proposal the founder accepts") is *explicitly superseded*
  by `immediate-working-theory.md`. The signature moment is useful work beginning immediately, not a plan
  to approve. `drover-completion-plan.md` WT4 exists specifically to delete the empty-architecture
  approval ceremony. Any exploration that reintroduces "assemble the system → founder accepts → then it
  works" has regressed to the retired direction.
- **`bet-regions/` — bet-as-container compositions.** The room/command-map/yard triage predates the
  spatial-integrity engine that makes hand-placement collisions obsolete. Carry the wall; retire the
  compositions.

## Pointers

- Product physics: `../FIRM-SPEC.md` · Proof boundary: `../STATE.md` · Design system: `DESIGN.md`
- ADE frame: `ux-divergence-2026.html` · Signature contract: `immediate-working-theory.md`
- Durable model: `venture-architecture-adaptation/LIVING-VENTURE-ATLAS-SPEC.md`
- Current evidence: `evidence/venture-atlas/` · Workyard evidence: `evidence/workyard/`
