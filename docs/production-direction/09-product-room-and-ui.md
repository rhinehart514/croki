# Product Canvas and UI/IA

## Primary surface

The canvas remains Drover's home, product workspace, question focus, pipeline editor, gate location, and
outcome-return surface. Product truth, questions, evidence, decisions, and outcomes enrich the coordinate
space; they do not become dashboard sections or separate destination pages.

Primary object: the product's living product-market terrain.

The current GTM operation is the worked layer over that terrain. A pipeline is one chosen executable move;
it is not the home screen or the prerequisite for product-level understanding.

Primary action: steer the crew or advance a visible path.

## One canvas, three discrete altitudes

These are levels of detail and focus, not separate products or a fixed GTM sequence.

### Product altitude

- cited product truth and important unknowns form the main landmarks;
- clearly labeled openings and tensions show where the product may meet the market, with receipts,
  uncertainty, and falsifiers;
- active or waiting questions appear as optional anchors;
- pipelines branch from the product element, question, signal, or direct goal they serve;
- gates remain unmistakable thresholds;
- outcomes visibly return toward the product;
- the persistent crew remains reachable at the canvas perimeter;
- evidence volume compresses into provenance states, never scores or card counts.

### Question altitude

Focusing a question expands its causal neighborhood without leaving the canvas:

- supporting and challenging evidence remain distinct;
- unknowns sit visibly beyond the current evidence;
- each teammate's face attaches to its own claim, uncertainty, recommendation, and falsifier;
- disagreement remains separate branches, never a blended consensus;
- founder calls become stamped receipts where they settled or redirected work;
- primary actions are Ask the crew, Find evidence, Make the call, and Turn this into a pipeline.

### Action altitude

Focusing an action unfolds the existing open execution graph:

- teammate-owned steps show the teammate's identity and live first-person progress;
- product changes, sends, publishing, research, and measurement remain open graph shapes;
- the shared founder gate opens at its position on the path;
- partial results and local failures remain attached to their steps;
- outcomes grow return edges to their originating question, product element, and Measure node;
- accepted implications can stage a dashed product-change pipeline for founder review.

Retain the current Operator/Engineer controls as discrete altitude controls while this richer projection is
proved. Do not add more named canvas modes. Continuous semantic zoom is a later implementation option, not a
requirement for this direction.

The control mapping is exact:

- **Operator with no focused object** is product altitude: the whole woven operation.
- **Operator with a focused question** is question altitude: an in-place focus state, not a third control or
  route.
- **Engineer with a focused pipeline** is action altitude: the existing single-pipeline graph editor.

Focusing a question keeps the Operator control selected. Turning it into or selecting a pipeline switches to
Engineer. Escape from Engineer returns to the originating question in Operator when one exists, otherwise to
whole-product Operator context.

## Focus-to-trace

Selecting a product element, question, teammate, decision, pipeline, gate, or outcome illuminates its causal
neighborhood. Unrelated work recedes without disappearing. Escape steps outward through action focus,
question focus, and whole-product context. A compact focus trail communicates location without routing to a
new page.

Canvas layers reveal detail without creating competing modes:

- provenance and source receipts;
- selected teammate contribution network;
- live run path and current step;
- founder decisions and what each changed;
- outcome attribution and product/coding return path.

## Teammate experience

The product-scoped crew remains visible along the canvas edge, while active teammates appear on the specific
questions, steps, artifacts, and outcomes they own. Faces mean authorship or responsibility, never decoration.

Each teammate has one stable illustrated character derived from its durable ref. That character follows the
teammate through the left rail, canvas, conversation, crew room, creation flow, and profile. Do not swap to
initials on compact surfaces; initials are permitted only as a render-failure fallback. Presence and working
state may surround the character, but must not replace it.

Selecting a teammate focuses its connected beliefs, work, decisions, lessons, and outcomes. The anchored
teammate sidecar shows:

- who the teammate is and its GTM role;
- its current position on the focused question;
- evidence, uncertainty, recommendation, and what would change its mind;
- real track record and attributable outcomes;
- founder-taught lessons;
- recent contributions;
- Ask this teammate.

Do not expose raw prompts, source paths, internal soul keys, host machinery, fabricated activity, or mascot
animation.

## Gate and attention

There is one gate decision implementation and one authorization path. The gate may open in a contextual
sheet anchored to its canvas location or be entered from the chat's Review action. Both entry points mount or
route to the same `GateReview` behavior and authorization path; the ban is on duplicate decision logic, not
contextual access. Chat may show a compact gate receipt after resolution.
After resolution it remains as a stamped receipt.

The cross-product decision inbox routes attention to the exact canvas object. It never becomes a second place
to make the decision. When several gates wait, one may take focus while the others remain visible on their
lanes.

## Focused pipeline readout

At action altitude, the focused pipeline must state before the graph detail:

- the question or direct goal it serves;
- the relevant crew;
- the intended product or market effect;
- advisory measurement intent;
- known evidence and remaining unknowns;
- exactly what the gate will release if approved;
- whether the path is a reversible local build, staged external effect, or separately authorized deploy.

## State contract

- **Empty:** show the grounded product landmark, visible crew, and “What should we learn, change, or pursue?”
  composer; render the terrain even when no pipeline exists, and never force “Start your first pipeline.”
- **Loading:** preserve stable topology, name the read/run steps, current step, and elapsed time.
- **Partial:** show what loaded and mark missing truth or evidence locally.
- **Error:** attach failure and recovery to the affected node or edge; preserve completed work.
- **Disagreement:** preserve all positions and their evidence without synthetic consensus.
- **Running:** stream the path before completion and allow mid-run redirection.
- **Gate waiting:** focus the gate once without trapping the founder or hiding other work.
- **Outcome pending:** distinguish released, observed, no response, and not measured.
- **Resumed:** restore focus, geometry, active run, pending gate, and composer context.

## Narrow viewport and keyboard

Mobile keeps the map as an overview strip, one focused connected object in the main viewport, and the crew in
a bottom tray. Moving through connected objects must not collapse the product into dashboard cards.

Keyboard behavior:

- arrow keys pan; `+` and `-` zoom;
- Enter focuses; Escape steps outward;
- `[` and `]` move through connected objects;
- `E` toggles provenance;
- Command/Ctrl-K opens the focus-scoped composer;
- text inputs suspend canvas shortcuts;
- every drag action has a button/menu alternative;
- the action graph has an ordered-list alternative for inspection, retry, and gate navigation.

## Visual direction

- calm light ground and monochrome base;
- one semantic accent for the founder gate;
- optical hierarchy through scale, spacing, focus, and line weight;
- teammate faces used for identity, not decoration;
- one stable illustrated character per teammate across every surface, with initials only as failure fallback;
- evidence and uncertainty without score theater;
- no dashboard card grid, decorative gradients, glow, generic AI chat styling, or provenance hairball;
- deterministic layout preserves founder spatial memory across reloads.

## Surface disposition

- `GtmCanvas` coordinates product, question, and action altitudes.
- `GraphCanvas` remains the spatial renderer for open execution graphs and projected canvas objects.
- `ComposerDock` binds conversation to the focused canvas object.
- `AgentProfile` becomes an anchored teammate sidecar.
- `GateReview` remains the one decision implementation, anchored to the gate.
- `ProductReadout` becomes the focused detail for the product-truth landmark.
- `LeftRail` leads with product scope and persistent crew; pipeline and capability inventories become compact
  indexes or summoned trays.
- `DecisionInbox` routes to spatial context.
- `CrewRoom` retires once the canvas perimeter and teammate focus cover its useful behavior.

Preserve current shared-object weaving, candidate lanes, dashed ghost proposals, direct graph editing,
watchable teammate narration, and the single authorized gate path unless a later verified replacement covers
the same behavior.

## Correctable product decisions

These defaults make the refined product concrete while remaining founder-correctable:

1. Only founder-pinned questions become durable clarity anchors; crew-opened questions remain transient until
   pinned.
2. Active, waiting, and outcome-linked questions remain visible; older context appears through focus-to-trace.
3. A compact persistent crew perimeter remains visible, with active faces embodied on the work they own.
4. Disagreement offers both a founder branch choice and the smallest evidence-gathering pipeline that could
   settle it; the resolving pipeline is foregrounded when evidence can decide.
5. Joined outcomes automatically propose dashed product implications, but never apply them.
6. Accepting an implication stages a dashed product-change pipeline whose first node carries the brief.
7. Existing Operator/Engineer controls remain the discrete altitude controls until semantic zoom proves
   legible enough to replace them.
8. The keyboard shortcuts and mobile focus tray defined here are implementation defaults, adjustable after
   browser testing without changing the product model.

## Implementation prompt

```text
Enrich Drover's existing woven canvas; do not replace it with a product-room dashboard, question pages, or
another navigation system. Use discrete product, question, and action altitudes plus focus-to-trace. Keep
persistent teammates embodied on the canvas, pipelines as the open action grammar, one founder gate, and
outcomes returning spatially to product truth and coding context. Reuse current canvas, composer, profile,
gate, product-readout, and decision-inbox components. Browser-verify focus, provenance, disagreement, live
run, gate, outcome return, stable geometry, keyboard-only use, and narrow viewport.
```
