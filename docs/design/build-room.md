> **SUPERSEDED.** This separate build-room direction predates the open canvas. See
> **docs/OPEN-CANVAS-SPEC.md** and the current `ComposerDock` implementation.

# The build room — composer expanded view

Status: BUILT in the product (2026-06-28). Reference-grade prototype
(`~/design-showcase/chat/fusion.html`) verified by the design-critic ("clears the
substitutability test and the craft bar; would not embarrass itself shipped next to Claude or
Linear"), then wired into `ComposerDock.tsx`. The expanded dock now renders the two-zone build
room from the real graph. Successor to the basic `cnv-*` transcript.

## What shipped in the product

When the dock is **expanded** and a real graph exists, `ComposerDock` renders a two-zone body:
the conversation on the left, and a `BuildRail` on the right (`.dock-build`) — a dot-grid canvas
slice that renders `graph.nodes` (flow-ordered by canvas position) as `BuildCard`s in the real
node-card language: 28px icon tile keyed to the node `category`, uppercase eyebrow, label, **amber
gate**, and the node whose id matches `runningNodeId` wears the rainbow ring (the "happening now"
signal, reusing `@property --composer-ang` / `@keyframes composer-spectrum-spin`). App passes
`graph` + `runningNodeId`. Verified live against the rodent-radar Tier 2 PCO program (7 nodes,
amber gate, rainbow on the running node). Files: `ui/src/components/ComposerDock.tsx`
(`BuildRail`/`BuildCard`, `buildRoom` gating, the split body), `ui/src/index.css`
(`.dock-build*`, `.composer-dock-body.split`, the live ring), `ui/src/App.tsx` (passes graph).

## What it is

The expanded composer (`ComposerDock` already has the expand toggle) becomes a two-zone
**build room**:

- **Left — conversation.** Claude's prose with inline evidence chips (`GOAL.md:14`, `run·4`),
  completed work as **reversible receipt cards** (Built · 11 steps; Graph change with
  `email → contact_path` and **Rollback to here**), and the amber gate band. Calm, light.
- **Right — a live slice of the real canvas.** The workflow assembles in real time in the
  product's own node-card language on a dot-grid: Source → Enrich → Gate → Draft, connected by
  edges, the card being built **right now** wearing a rotating rainbow ring. A `live · 7s`
  badge and a `4 contacts · 2 agents · 1 gate` tally.
- **Foot — the composer stays live.** "Redirect Claude, or ask anything while it builds —
  your message lands without interrupting the run." This is the "keep talking" half.

Default (un-expanded) dock keeps the Work-Cards transcript; expanding opens the build room.

## The hand

- **Palette: black / white / rainbow.** Monochrome ink, ONE product accent = **amber for the
  gate** (kept — the product's existing semantic), green for grounded/observed. The **rainbow
  is reserved strictly for "happening now"**: the live badge dot, the building card's ring +
  icon tile, the cross-zone coupling line, the voice-input ring. Never decoration; never a fill
  (mask-ring so card interiors stay white).
- **Canvas-consistent by construction.** The right zone reuses the real node-card vocabulary
  (`docs/design/node-cards.md`, `canvas-refine.css` `.loop-node*`): 28px icon tile, uppercase
  eyebrow + label, grounded/gated badges, amber gate, strong rounding. Geist + Geist Mono.
- **The coupling (highest-leverage move).** The two zones are *coupled*, not co-present: the
  chat line about the in-progress work shares the rainbow token + the object label ("Draft")
  with the card assembling on the canvas, so sentence and card read as one event. This is what
  makes it a build room instead of "a chat next to a diagram."
- **Motion** is bespoke CSS (registered `@property` conic spin for the rainbow; pop/rise/draw
  for cards and edges). Reduced-motion freezes it.

## Grounding (Mobbin, cited)

- Activity rail / answer-as-document — ChatGPT Deep Research https://mobbin.com/screens/73833b79-1dd5-4354-8fc4-a2e99c33a75e
- Reversible work receipts + rollback — Replit https://mobbin.com/screens/9d5d7187-c5ad-49ff-9555-2bc3c7c53a07
- Inline source/evidence chips — Perplexity https://mobbin.com/screens/b576fc91-d13a-4f5f-85c9-6bbb2d3b8ab5

## Build plan (not yet done)

1. Two-zone layout inside the expanded `ComposerDock` (conversation | canvas slice), composer pinned.
2. Feed the right zone from REAL run state — the graph nodes, the step ledger, the gate — rendered
   through the existing canvas card components, not a bespoke mini-diagram. Lock demo copy to the
   real RodentRadar/Buffalo acceptance fixtures (no invented numbers).
3. The "building now" state: the node currently executing wears the rainbow ring; completed nodes
   settle to their normal canvas appearance; the chat coupling line mirrors it.
4. Harvest (per the critic): extract a named `building` / `live-now` rainbow token primitive (shared
   by this, the canvas in-progress node, and the live operator cursor) and the build-room two-zone
   layout primitive — only after the coupling exists.

## Already shipped (related)

The voice-rainbow composer input is live in `ComposerDock.tsx` (`docs/design/composer.md`). The
build room is the next, larger build — the expanded view wired to real run state.
