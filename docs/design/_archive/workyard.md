---
status: retained-bet-work-altitude-receipt
selected_by: Jacob
selected_at: 2026-07-14
implemented_at: 2026-07-14
surface: core-desktop-canvas
spine: The Workyard
graft: persistent-collapsible-conversation
prototype: http://localhost:4328/
authoritative_product_physics: ../FIRM-SPEC.md
authoritative_experience_direction: ../../DESIGN.md
---

# The Workyard

> **Retained design receipt.** The Workyard is still the near bet/exact-work altitude inside the
> Living Venture Atlas; it is no longer Drover's opening canvas model. Current whole-canvas direction
> lives in [`../FIRM-SPEC.md`](../FIRM-SPEC.md), [`../STATE.md`](../STATE.md), and
> [`venture-architecture-adaptation/LIVING-VENTURE-ATLAS-SPEC.md`](venture-architecture-adaptation/LIVING-VENTURE-ATLAS-SPEC.md).

## Decision

At bet/work altitude, the production canvas becomes a full-bleed territorial workyard. A **bet is a bounded attempt** that
expands into a spatial section. Durable work appears as independently targetable, open-shaped cards
inside that section. The persistent, resizable, and collapsible venture conversation remains beside
the canvas; it does not become a second route or inspector.

This replaces the single bet summary card plus oversized focus inspector. It does not add a task,
stage, card-kind, or executable graph model. “Card” and “territory” are visual grammar over durable
firm records, not new domain nouns.

## Declared hand

- **Composition:** full-bleed territorial archipelago with a persistent editorial conversation rail.
- **Signature element:** the wall is the literal world perimeter. An exact workpiece docks there;
  released work and returned reality stay visibly joined to that same origin.
- **Color:** inherit the production mineral room without adding a palette: `#e3e0da` room,
  `#e9e6e0` canvas, `#f4f2ee` lifted work, `#23211d` ink, `#1e5245` interaction, `#a9791a`
  founder-held wall, `#b4443a` destructive/failure.
- **Type:** inherit the production roles: restrained Geist Variable for major territory headings,
  system sans for work and controls, Geist Mono only for exact machine material.
- **Motion:** settling and causal. Territory focus, durable work arrival, wall docking, and market
  return may settle once through named transform/opacity transitions. No ambient work simulation.
- **Anti-reference:** not a Miro object palette, ClickUp board, kanban, workflow builder, agent grid,
  chat-with-diagram, or dashboard of activity.

The composition is distinct from the category default because the primary object is neither chat nor
a graph node. It is a real-world attempt with heterogeneous, attributable work living inside it and a
spatial authority boundary at its edge.

## Screens and states touched

### Venture return

Conversation remains open on the terse return account. Selecting a receipt focuses the originating
territory and exact workpiece without navigating or opening an inspector. “Show the wider firm”
restores the founder-authored canvas arrangement.

### Broad workyard

Bets read as territories, not cards. At far altitude each territory is a compact semantic mark. At
middle altitude it names the attempt, position, participants, and material work. At near altitude its
durable workpieces become readable and independently selectable. Fork and organization lines explain
lineage or relationship; they never execute.

### Bet territory

The territory header names the attempted real-world change, live/at-wall/ended position, fork
lineage, and involved teammates. Its body may contain any durable content the bet actually carries.
It has no columns, required slots, type picker, or stage progression. Empty means the teammate is
interpreting or no durable work exists yet; it does not render placeholder workflow lanes.

### Durable workpiece

Every targetable workpiece carries a stable `workRef`, open content, owner references, contributor
references, firm-definition revision, and timestamps when available. Content presentation may vary
by what is actually readable—prose, evidence, diff, outbound payload, receipt, or returned voice—but
presentation does not become a required stored kind.

The primary owner portrait sits at the workpiece corner. Additional contributors stack outward. Text
and ordering, not color alone, distinguish ownership from contribution. `CrewFace` remains the only
portrait implementation.

### Explicit direction

Selection is the supervision language:

- no selection targets the firm;
- one teammate targets that teammate;
- Shift-select targets several teammates;
- a territory targets the bet;
- a workpiece targets its exact `workRef` inside the bet.

The composer names and locks the full target before dispatch. Prompting never navigates away. The
selected primary teammate receives the direction; the host records all explicitly selected
participants but does not prescribe how they collaborate.

### The wall and return

A workpiece with an outward act shows a perimeter tether and opens review of the exact payload,
destination, provenance, and consequence. Release remains one founder act. Multi-selection never
creates batch release authority. A connected-account return lands against the same `workRef`; an
ambiguous or unattributed return remains outside a territory rather than receiving a false edge.

### Failure and scale

Loading, stale, offline, empty, long content, ten-times data, reduced motion, clear wall, populated
wall, targetable legacy work without a durable id, and ambiguous lineage all remain honest. The
outline is the deterministic keyboard and semantic-zoom fallback. The product is desktop-only and
is judged at 1440×900 and 1280×800.

## Hierarchy claim

The main screen puts the **currently consequential workpiece and the real-world boundary it may
cross** first. This claims something a generic AI canvas cannot: Drover makes delegated work
inspectable as part of one attempted market change, preserves who contributed, and carries reality
back to the exact originating work without turning judgment into a host workflow.

## Shipped references

- [Miro frame with heterogeneous objects](https://mobbin.com/screens/fd5b0ddc-8a20-46b6-9550-d32c67fb6866):
  a titled spatial boundary can scope many independently manipulable objects without making them one
  mega-card.
- [Zoom Whiteboard selected note](https://mobbin.com/screens/c18ecb2c-4cf9-4ff9-88e6-ae72e27fdd45):
  authorship belongs quietly on the artifact, separate from global collaborator presence.
- [Notion AI page conversation](https://mobbin.com/flows/938a3741-4b1e-403d-9872-30b4b6a40ac8):
  the source stays selected and visible while the adjacent prompt surface names its context.
- [Notion AI text revision](https://mobbin.com/flows/6463d199-92a5-4dc1-a19b-14a462c90ccb):
  generated work stays beside its origin and consequential disposition remains explicit.
- [Loops send flow](https://mobbin.com/flows/84180d16-2d3b-4aeb-8ce3-5b63a8ba18d2):
  outward release reviews the exact artifact and preserves that artifact after transition.
- [Eventbrite campaign return](https://mobbin.com/flows/845b9577-92f5-4f44-bf2d-0956014ae9da):
  pending and returned evidence belong to the same canonical origin.
- [ClickUp board counterpattern](https://mobbin.com/screens/180ebd25-bd1d-4943-a6a7-75f23f5ed75f):
  status lanes, required fields, view configuration, and equal-weight task cards are explicitly
  rejected.

## Implementation contract

- Extend the existing React 19 + Vite + Tailwind-token/feature-CSS stack.
- Extend `@xyflow/react` 12.11 nodes, selection, measured bounds, fit view, and placement; do not add
  a parallel canvas or state store.
- Use the existing Base UI-backed `Button`, `Textarea`, and `CrewFace` primitives.
- Use existing CSS motion tokens or the installed Motion 12.42 package only where layout continuity
  cannot be expressed honestly in CSS. No new motion dependency is earned.
- Context7 is not exposed in the current Codex harness; installed package manifests, TypeScript
  declarations, and existing production usage are the API authority for this implementation.
- Keep production UI components under 300 lines and brain services under 500 lines.

## Proof receipt

The selected prototype remains at [the local interactive direction](http://localhost:4328/). The
production build now proves:

1. the dense fixture renders bet territories with heterogeneous workpieces and several teammates;
2. selecting a workpiece scopes the existing composer to `betId + workRef` and preserves selection
   while drafting;
3. Shift-selecting teammates scopes one prompt to the explicit participant set;
4. a wall-bound workpiece opens the exact wall item and the same workpiece shows its returned outcome;
5. the oversized bet inspector is absent;
6. keyboard outline, broad view, reduced motion, stale/offline, long content, and 10× data remain
   usable at both supported desktop viewports;
7. 484 brain tests and 179 interface tests pass with lint, production build, and token parity;
8. all four deterministic desktop journeys pass together, including the faithful 125% layout;
9. browser screenshots and interaction receipts are stored under `docs/design/evidence/workyard/`.

The proof also covers design-agent polish findings: selected territories force near detail and refit
after measured-size or canvas-size changes; exact-work conversation excludes unrelated receipts; a
collapsed exact-work transcript retains its scoped composer; wall fetch failure is distinct from a
clear wall; context text retains normal token contrast; attribution controls provide 32px hit areas;
and avatar generator metadata never enters the visible interface.
