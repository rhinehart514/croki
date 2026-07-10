# Product Room UX Plan (Flow Architect pre-code gate)

> **Scope correction — 2026-07-10.** This document is the implementation plan and receipt for repairing the
> operation layer: readable pipeline lanes, one founder wall, question focus, crew embodiment, and outcome
> return. Its statement that “the GTM operation is the canvas” is superseded by
> `17-product-market-terrain-completion-spec.md`. The terrain is the primary object; this operation is the
> worked layer over it. Keep the shipped operation-layer repairs and use file 17 for the completion target.

Status: design-only planning artifact. No UI/CSS/test/backend/doc code changes accompany this file. It
re-derives the product room's mental model from the founder's job and the existing architecture, diagnoses
the two browser screenshots, lays out the real candidate mental models with the rejected ones kept as
correctable receipts, and specifies the six Flow Architect pre-code artifacts before any implementation.

Evidence inspected: the RodentRadar Fit View screenshot (`output/playwright/drover-current-fit-2.png`) and
the estatesaleusa crew-open screenshot (user clipboard), the live UI (`ui/src/App.tsx`,
`components/canvas/GtmCanvas.tsx`, `components/GraphCanvas.tsx`, `lib/wovenOverlay.ts`,
`components/canvas/wovenNodes.tsx`, `components/canvas/QuestionFocus.tsx`,
`components/canvas/FocusedPipelineReadout.tsx`, `components/canvas/OutcomeReturn.tsx`,
`components/AgentProfile.tsx`, `components/ProductReadout.tsx`, `components/ProductEntryColumn.tsx`,
`components/DecisionInbox.tsx`, `components/LeftRail.tsx`, `components/FloatingDock.tsx`,
`components/gate/GateReview.tsx`, `components/crew/*`, `lib/navigation.ts`), and the production direction
(`00`, `01`, `04`, `05`, `06`, `07`, `09`, `12`, `13`) plus `AGENTS.md`.

---

## Diagnosis: why the screenshots carry no coherent mental model

Both screenshots fail the same way: the canvas has **no primary object and an inverted hierarchy**, so Fit
View averages into noise and the founder cannot answer the one question a session exists to answer —
"what is the state of my go-to-market, and what needs me right now?"

Concrete failures, mapped to the nine requested dimensions:

- **Hierarchy (inverted).** The largest visual mass is the least important content: roughly sixty faint
  product-model detail cards (things, goals, states, workflows, interactions) stacked into one vertical
  ladder down the left. The most important content — the three real pipelines, the founder wall, the pinned
  questions — is shrunk to postage stamps at the top. The screen spends its pixels on reference detail and
  starves the operation.
- **Primary object (absent).** Nothing dominates. Product truth, the shared-object weave, pipelines, the
  gate, crew, composer, and outcomes all compete at equal weight, so the eye has no anchor.
- **Spatial meaning (unclear).** Controls are scattered to four corners with no legible relationship: the
  "By shared objects / By GTM type" axis toggle top-left, a "Where wins enter" collapsed tab far-left, a
  "Log what happened" pill bottom-left, and a vertical "CLAUDE" rail far-right. Nothing tells the founder
  what a region *means*.
- **Product-to-GTM relation (severed).** Product truth reads as a wall of cards with no visible tie to the
  pipelines. The weave (shared objects drawn once where motions cross) — the entire premise — is invisible
  at Fit zoom because the ladder consumes the vertical budget.
- **Crew rail (broken).** In the second screenshot the crew opens as a roughly forty-percent-width panel
  with a large black robot mascot blob overlapping and obscuring the teammate rows. A mascot is banned
  doctrine and it is actively hiding real content.
- **Mode/altitude (weakly expressed).** The first screenshot shows no Operator/Engineer control at all
  (since fixed); even with it present, the axis toggle sits as a same-size peer top-left and competes with
  the altitude control for "what mode am I in."
- **Focus (confetti).** With nothing focused, every node renders equally faint, so focus-to-trace has no
  resting state to depart from and the default view looks like scattered debris.
- **Gate (not legible as the wall).** The one founder wall is a single small amber node mid-canvas in one
  screenshot and a bottom-right card in the other; it never reads as the single threshold every path
  crosses.
- **Density (unbounded).** A canonical projection of about one hundred thirty anchors is laid into
  coordinate space raw, so the layout is dominated by whichever list is longest — here the product-model
  taxonomy.

Root cause, stated plainly: the current UI treats the **entire interpreted product model as product-altitude
landmarks.** The direction (`09`, product altitude) says the opposite — "cited product truth and important
unknowns form the main landmarks" and "evidence volume compresses into provenance states, never scores or
card counts." The product-model taxonomy (sixty things/goals/states) is reference detail, not truth
landmarks; promoting it into the landmark ladder is the defect that collapses the mental model.

---

## Chosen mental model: "the GTM operation is the canvas; product truth is its compact source; the product model is reference summoned by relevance"

The founder's job (from `01`, `05`, `09`, `13`): point Drover at a real codebase; the crew reads what the
product does and where wins enter; the founder states a go-to-market goal in plain words; the crew composes
product-shaped pipelines that stop at the founder wall; the founder approves; outcomes return and teach the
next run. The recurring session question is "what is the state of my go-to-market, and what needs me now?"

From that job, the mental model reads the canvas left-to-right as one operation, like a river:

- **Primary object: the product's living GTM operation** — pipelines flowing rightward toward the single
  founder wall, over a shared-object weave, with outcomes pooling on the right and returning.
- **Product truth is the compact source (left headwaters), not a ladder.** A bounded landmark set: the
  product root, "where wins enter," a small number of cited truths, and the important unknowns. Evidence
  volume is compressed to provenance, never sixty cards.
- **The product-model taxonomy is reference, not landmark.** It never lays into the landmark ladder by
  default. Individual product elements surface only when they are causally connected to a question,
  pipeline, run, or outcome (relevance), or when the founder focuses their kind. Everything else folds into
  one compact per-kind summary chip near the source. (This re-frames the semantic-collapse work already in
  the repo: the default stance becomes "the product model is reference, summoned by relevance," not "lay all
  of it and then collapse.")
- **Altitude is the reading level, expressed by the existing two controls plus focus.** Operator with no
  focus is product altitude — the whole operation legible at Fit View. Operator with a focused question is
  question altitude — the question's causal neighborhood lit, its sidecar open, the Operator control still
  selected. Engineer with a focused pipeline is action altitude — the pipeline's execution graph plus the
  focused-pipeline brief.
- **Crew is a compact persistent perimeter**, embodied on the steps, questions, and outcomes it owns. No
  mascot, no forty-percent panel by default; the anchored teammate sidecar opens on focus.
- **The gate is the one wall** — a legible vertical amber threshold each pipeline crosses; pending items
  pull a single focus.
- **Outcomes return spatially** — they pool at the right and send dashed edges back toward the pipeline, the
  question, the product source, and the contributing crew.

This preserves every fixed architectural decision from `12`'s master prompt (one woven canvas as home,
persistent teammates, open pipelines/graphs, one founder gate) and enriches their projection rather than
replacing them with a dashboard, a document hierarchy, or a parallel shell.

---

## Rejected alternatives (kept as correctable receipts)

Every real candidate the founder's job admits, why it lost as the primary model, and the idea grafted from it
into the chosen model. The founder may overturn any of these.

- **B. Situation room / plain-language headline over lanes.** A one-line status ("3 pipelines running, 1
  waiting on you, 2 outcomes back") atop pipeline lanes, product truth as a collapsible strip.
  Rejected as the primary identity because it drifts toward the fleet dashboard `12` (Workstream 8
  acceptance) explicitly forbids as the product's primary identity. Grafted: its one-line operation status
  is adopted as a quiet header line on the existing dock — an orienting sentence, never a dashboard section.
- **C. Product-at-center hub-and-spoke.** The product sits at the center; pipelines, questions, crew, and
  outcomes radiate as spokes. Rejected because a radial layout fights the left-to-right, lane-based
  `GraphCanvas` engine, does not scale to three-plus pipelines with long step chains, carries high
  implementation cost, and buries the "what needs me" signal. Grafted: the product-to-GTM relation it
  foregrounds is delivered instead by the shared-object weave plus focus-to-trace, which the engine already
  supports.
- **D. Focus-first: hide the operation until the founder focuses something.** Fit View shows only the source
  spine plus the pending gate; the operation appears on focus/zoom. Rejected as the default because product
  altitude is defined as "the whole woven operation" at a glance; hiding the operation contradicts the
  direction. Grafted: its discipline — Fit View shows a bounded, high-signal set — becomes the landmark
  budget that bounds the overlay.
- **E. Three fixed rails: product left, canvas center, crew right.** Product truth becomes a bounded,
  scrollable left rail outside canvas coordinate space; the center is only the GTM weave; crew is a right
  rail. Rejected as primary because pulling product truth into a separate scrolling rail risks the
  "dashboard section or separate destination page" `09` forbids and severs the weave (product-to-GTM is
  shown by shared objects, not by adjacency in a side panel). Grafted: its correct instinct — bound the
  product taxonomy outside the infinite ladder — is honored by the compact source spine plus per-kind
  summaries plus relevance surfacing, kept inside the one canvas.

---

## What must be removed or demoted from the current screenshots

Not only what to add. The plan is net-subtractive where the screen is overloaded.

- **Remove the sixty-card product-model landmark ladder** from the default landmark layer. Replace with the
  compact source spine (root, where-wins-enter, cited truths, unknowns), per-kind summary chips, and
  relevance-surfaced elements. This is the central fix.
- **Remove the robot mascot blob** entirely. It is banned doctrine and it obscures the crew rows.
- **Demote the crew from a forty-percent panel to a compact perimeter rail** by default; the full teammate
  dossier is the anchored `AgentProfile` sidecar on focus, not a permanent third column.
- **Demote the "By shared objects / By GTM type" axis toggle** from a top-level peer to a quiet in-Operator
  refinement. It is not an altitude and must not compete with the Operator/Engineer control for "what mode
  am I in."
- **Consolidate the scattered corner controls.** Fold "Log what happened" into the outcome-return
  affordance; fold "Where wins enter" into the source spine; keep the altitude control on the dock (already
  landed); stop presenting four unrelated corner controls at equal weight.
- **Demote the permanent composer column.** The composer and gate review open contextually near the object
  they act on, not as a standing third region that splits attention with the canvas and crew.

---

## UX Plan

**Exact user goal.** For the product on screen (RodentRadar, estatesaleusa), the founder wants to answer,
each session, "what is the state of my go-to-market, and what needs me right now," then steer the crew or
clear a gate — without leaving the canvas or reading reference detail they did not ask for.

**Primary object.** The product's living GTM operation: crew-owned pipelines flowing to the one founder
wall, woven over shared objects, with outcomes returning to product truth.

**Entry (entry points).** Three real entries: (1) opening a grounded product lands on the woven canvas at
product altitude (the default); (2) the cross-product decision inbox routes a waiting gate to its exact
canvas object; (3) an AI coding session addresses the same pinned question and pipeline references. All
three enter the same canvas; none is a separate destination page.

**First meaningful action.** At product altitude, the first meaningful action is to read the operation and
either focus a pinned question, open a pipeline, or clear the one gate that says it needs the founder — each
a single click on a legible object, not a hunt through a card wall.

**Primary action.** The primary action is to advance the one visible path that needs the founder: clear the
pending gate, focus a question the crew is working, or open and run a pipeline. The primary action is always
a single click on the primary object, never buried in a filter or a mode dropdown.

**Primary path.** Product altitude (read the operation) to question or pipeline focus (understand the crew's
positions and evidence, or the pipeline's brief) to the one anchored gate review to approval to the outcome
returning spatially to the product, the question, and the crew.

**Alternate path (alternate paths).** A direct pipeline with no question (compose and run straight to the
gate); accepting an outcome implication, which stages a dashed reviewable product-change pipeline; expanding
a product-model summary chip to inspect the reference taxonomy; steering the crew mid-run from the composer.

**Dead ends and how they are avoided.** The current sixty-card ladder is a dead end (nothing to do with it,
nowhere to go). It is removed. A stale focus that matches nothing collapses to product altitude rather than
dimming every node to confetti. An empty product shows the grounded source and a "what should we learn or
change" composer, never a "start your first pipeline" dead end.

**Moment of value.** The founder sees, at Fit View, the whole operation legibly: the product source on the
left, the real pipelines flowing right, the one wall, the pending "needs you" focus, and outcomes returning
— and can act on the one thing that needs them in a single click. Value lands before any run finishes.

**Trust moment (trust/proof moment).** At the gate, the founder reads the exact consequence of approving
(the canonical "what your yes does"), the safety class, the evidence and unknowns, and the crew that
produced the work — with provenance visible and inferred visibly distinct from grounded. Nothing sends,
publishes, or charges until the founder approves; that wall is the trust anchor.

**Return loop.** A joined outcome returns spatially to the pipeline, the question when present, the product
source, and the contributing crew, and proposes a dashed product implication; accepting it stages a
reviewable product-change pipeline. The next composition and the next coding session receive the learning.
The loop closes on the same canvas.

---

## Component Match Table

Each screen slot, its interaction type, the chosen component, its source, semantic fit, required states,
accessibility obligation, rejected alternatives, and whether the choice is reuse, an approved package, or
bespoke. Repo reuse is the default; existing repo components, tokens, and primitives are preferred; no new
package is proposed anywhere in this plan.

| Slot | Interaction type | Choice | Source | Fit | Required states | Accessibility obligation | Rejected alternatives | Decision |
|---|---|---|---|---|---|---|---|---|
| Canvas home | Spatial workspace | `GtmCanvas` over `GraphCanvas` (React Flow) | Existing repo component | High; it is the fixed home and renders the weave | default, loading, empty, error, running | Keyboard pan and zoom, focus ring on nodes, semantic node roles | A new dashboard shell (rejected: forbidden identity) | reuse |
| Altitude control | Peer mode switch | Operator/Engineer segmented control on `FloatingDock` | Existing repo component (landed) | High; two discrete altitudes | default, active, focus, disabled | Segmented control semantics, aria-pressed per segment, keyboard reachable, visible focus | Dropdown among filters (rejected: mode buried) | reuse |
| Product source spine and per-kind summaries | Landmark plus summary-expand | `buildCanvasAnchorLayer` plus `CanvasAnchor` node | Existing repo primitive, re-scoped | High once the landmark budget is bounded | default, focus, dim, group-summary, expanded, empty | Node is a button-like target, accessible name per landmark, count announced on summary, keyboard focus | Laying all model elements as landmarks (rejected: the ladder) | change |
| Shared-object weave | Read plus focus-to-trace | `ObjectChip`, `KindCluster`, `wovenOverlay` ties | Existing repo primitive | High; the moat, drawn once | default, focus, dim, in-flight | Chips are focusable, tie edges non-interactive, non-color state indicator | Adjacency in a side rail (rejected: severs the weave) | reuse |
| Question altitude | Anchored in-place sidecar | `QuestionFocus` | Existing repo component | High; preserves distinct teammate positions | default, empty, focus, disabled, long text | `role=complementary` landmark (not dialog), keyboard focus, labelled region, escape steps outward | Modal dialog (rejected: it is non-modal) | reuse |
| Action altitude brief | Contextual readout | `FocusedPipelineReadout` | Existing repo component | High; states meaning before graph | default, running, gate-waiting, empty | Collapsible with aria-expanded, keyboard toggle, faces are labelled buttons | A separate detail page (rejected: leaves canvas) | reuse |
| Teammate dossier | Anchored sidecar | `AgentProfile` | Existing repo component | High; belief, evidence, falsifier, lessons | default, loading, empty, focus | Sheet focus management, escape close, accessible name, no raw prompt leakage | A permanent 40-percent crew column (rejected: splits attention) | change |
| Crew perimeter | Persistent rail plus embodiment | `CrewRoom` / `CrewFace` / `LeftRail` crew section | Existing repo component | High as a compact perimeter; faces mean authorship | default, focus, empty, hover | Faces are labelled buttons, keyboard reachable, no mascot animation | Robot mascot blob (rejected: banned, obscures content) | change |
| Product truth readout | Compact read-out | `ProductReadout` / `ProductEntryColumn` | Existing repo component | High; cited truth and unknowns, honest blanks | default, empty, partial, blind-attribution | Semantic headings, citation labels, non-color status | A taxonomy card wall (rejected: the ladder) | reuse |
| Founder wall | Anchored review | `GateReview` (one implementation) | Existing repo component | High; the single decision path | default, gate-waiting, approve, reject, refine, disabled | One authorization path, focus into the review, escape, labelled actions | A second gate surface (rejected: duplicate wall) | reuse |
| Outcome return | Product-altitude rail | `OutcomeReturn` | Existing repo component | High; routes outcomes home | default, empty, outcome-pending, dashed implication | Return chips are labelled buttons, only-when-resolvable, keyboard reachable | A separate outcomes page (rejected: leaves canvas) | reuse |
| Cross-product attention | Popover index | `DecisionInbox` via `navigation.ts` popover | Existing repo component | High; routes to the exact object | default, empty | Popover semantics, focus, dismiss, does not become a second decision place | A modal that makes the decision (rejected: duplicate wall) | reuse |
| Weave axis refinement | Quiet filter | `woven-axisbar` segmented toggle | Existing repo primitive | Medium; a within-Operator refinement, demoted | default, active, focus | aria-pressed, keyboard, demoted below altitude | A top-level peer of altitude (rejected: mode confusion) | change |
| Operation status line | Orienting status | Small dock header line composed from `operatingView` counts | Existing repo tokens plus data, no package | Medium; one orienting sentence | default, empty | `role=status` polite live region, plain language, non-color | A full status dashboard (rejected: dashboard identity) | bespoke on primitives |
| Composer | Contextual conversation | `ComposerDock` | Existing repo component | High; steer and compose | default, generating, gate, empty, error | Contextual open, focus management, cancel control | A permanent third column (rejected: splits attention) | change |

Bespoke is proposed only for the one-line operation status, and only as composition over existing tokens and
the existing `operatingView` read — it is domain-specific orienting behavior, not cosmetic novelty, and it
adds no dependency.

---

## Placement Rationale

For each primary control: what object it affects, its category (navigation, mode, filter, command, status,
proof, feedback), how often it is needed, whether it governs one object or the whole screen, why here, why
the alternatives lose, and the risk of a wrong choice.

- **Operator/Engineer altitude control — on the dock, top center.** Category: mode switch. It governs the
  whole screen. Frequency: high, every session, so it must stay visible. Why here: the dock is the persistent
  "where am I" cluster and a peer mode switch belongs as a visible segmented control, not buried among
  filters (design decision rules, control defaults). Alternatives lose: a dropdown hides the mode; a corner
  toggle competes with the axis filter. Risk if wrong: the founder loses altitude legibility, which is the
  spine of the whole model.
- **Weave axis toggle (By shared objects / By GTM type) — demoted, quiet, inside Operator.** Category:
  filter, not mode. It governs how the Operator view is projected, not the whole app's altitude. Frequency:
  occasional. Why here: a filter must read as subordinate to the mode; placing it as a same-size top-left
  peer created the "two mode controls" confusion. Alternatives lose: keeping it a peer of altitude
  mismatches its category. Risk if wrong: the founder conflates a refinement with an altitude.
- **Product source spine and summaries — left headwaters of the canvas.** Category: status plus navigation
  landmark. Governs a region (product context) and traces into pipelines. Frequency: read every session,
  acted on occasionally. Why here: the operation reads left-to-right, so the product source belongs at the
  left where the current begins, bounded to a legible budget. Alternatives lose: a full taxonomy ladder
  starves the operation; a separate scrolling side rail severs the weave. Risk if wrong: the ladder returns
  and Fit View collapses.
- **Founder wall — a vertical threshold each pipeline crosses.** Category: proof plus command. Governs the
  single most consequential action. Frequency: whenever something is staged. Why here: the wall must read as
  one threshold the whole operation crosses, anchored to the pipeline it gates. Alternatives lose: a corner
  card or a modal detaches the decision from its object. Risk if wrong: the founder approves without
  understanding the consequence.
- **Crew perimeter — compact right edge, embodied on owned work.** Category: navigation plus status.
  Governs teammate identity, per object. Frequency: glanced constantly, opened occasionally. Why here: a
  persistent perimeter keeps the crew reachable without a forty-percent panel that competes with the canvas;
  the dossier opens as an anchored sidecar on focus. Alternatives lose: a standing panel splits attention; a
  mascot obscures content. Risk if wrong: the crew either dominates or disappears.
- **Outcome return rail — bottom-left at product altitude.** Category: feedback plus command. Governs
  returned outcomes and proposed implications. Frequency: after runs. Why here: outcomes return toward the
  product source, so the rail sits near it and routes home. Alternatives lose: a separate outcomes page
  leaves the canvas. Risk if wrong: the return loop becomes invisible.
- **Decision inbox — a dock popover.** Category: navigation. Governs cross-product attention. Frequency: as
  gates accumulate. Why here: it routes attention to the exact canvas object and must never become a second
  place to make the decision. Alternatives lose: a modal that decides duplicates the wall. Risk if wrong: two
  decision paths.

---

## State Matrix

Every promised state, its trigger, its rendering, and its accessibility contract. Accessibility is part of
the design here, not a cleanup pass. Native semantic elements are used first; aria is added only where it
expresses real semantics; the target is WCAG AA and APG patterns for custom widgets.

| State | Trigger | Rendering | Accessibility (a11y) contract |
|---|---|---|---|
| Default (product altitude) | Grounded product, no focus | Bounded operation: source spine, pipelines, wall, crew perimeter, outcomes | Semantic landmark regions, visible focus ring, keyboard pan and zoom, sufficient contrast and non-color status |
| Loading | Projection or run in flight | Stable topology preserved, read/run steps named, current step and elapsed time | `role=status` polite live region, focus not stolen, reduced-motion variant |
| Empty | No pipelines yet, or no outcomes | Grounded source plus "what should we learn or change" composer; honest "no runs yet"; never "start your first pipeline" | Labelled empty region, keyboard-reachable primary action, plain copy |
| Recoverable error | A node or projection read fails | Failure and retry attached to the affected node or edge; completed work preserved | Error announced near the object with `aria-live`, retry is a labelled focusable control |
| Destructive-adjacent | Retire a pipeline, dismiss an implication | Confirmation before an irreversible or outward step; the founder wall itself is the irreversible-send confirmation | Alert-dialog pattern where blocking, initial focus, escape, focus restoration; nothing sends without the wall |
| Disabled | No runnable graph, no release role | Run disabled with no fake affordance; gate release gated by session token | Disabled conveyed to assistive tech, keyboard behavior defined, not color-only |
| Hover, focus, active | Pointer or keyboard on any control | Segmented control, chips, faces, and return chips show hover, focus, active | Visible focus indicator on every focusable element, target size adequate |
| Permission or auth | Convex team down, no signed-in Claude, expired session | First run refuses half-broken with a clear message; gate release checks a session token; permission blocking is explicit | Route and action blocking proof, labelled recovery path |
| Offline or unstable network | Projection or transport unreachable | Last known view kept; the next tick may recover; no fabricated success; connector readiness is never shown as an outcome | Retry strategy, no silent data loss, status announced politely |
| Responsive breakpoints (desktop, tablet, mobile) | Desktop, tablet, narrow or mobile | Desktop is primary (1440); tablet keeps the canvas with a narrower crew perimeter; the narrow and mobile layout keeps the map as an overview strip with one focused connected object in the main viewport and the crew in a bottom tray | Primary action and mode remain reachable at every breakpoint including mobile; no control hidden without an alternative |
| Long text and localization | Long product labels, long teammate claims, long disagreement branches | Landmarks clamp to two lines with title-attribute overflow; the question sidecar scrolls; long branches never overlap controls or shift interaction targets | Overflow does not clip focusable controls; wrapping preserved |
| Feature-flag variants | Convex sync on or off, transport connected or not | Team sync guarded off by default; the gate copy names honestly whether a yes sends | Variant-specific copy is accurate, non-color status |
| AI generating | A pipeline runs | Streaming assembly with per-teammate first-person narration and a live step tracker; a Stop control | Continuity of partial output, cancel outcome is clear, focus not stolen, reduced-motion variant |
| AI low confidence and missing evidence | A teammate is unsure or evidence is absent | Confidence reads as precedent, not a percentage; inferred looks visibly distinct from grounded; missing evidence is exposed, never fabricated | Non-color distinction plus label for inferred versus grounded; caveats surfaced |
| AI action pending and failed | A step is about to act, or a step failed | Show what will happen before it acts; on failure show retry, rollback, or manual path; nothing crosses the wall without approval | The pending action is an editable object; failure has a labelled recovery |
| Gate waiting | Items staged at the wall | The wall focuses once without trapping the founder or hiding other work; one gate takes focus while others remain visible on their lanes | Focus into the review, escape, labelled approve, reject, and edit; one authorization path |
| Outcome pending | Sent, observed, no response, not measured | Distinguished honestly as released, observed, no response, or not measured; a gate approval is never reported as market success | Status distinguished by label and shape, not color alone |
| Resumed | Reload or resume | Focus, geometry, active run, pending gate, and composer context restored; stable founder geometry after refresh | Focus restoration after async, spatial memory preserved |
| Product-model long tail (100-plus anchors) | A canonical projection with about sixty-plus model details | Default renders a bounded high-signal set: source, cited truths, all questions, connected details, per-kind summary chips; the unconnected tail folds into one summary per kind; a summary expands its members on focus | Summary chip is a labelled button announcing its count; expansion is keyboard reachable; nothing canonical is discarded |

No external action state exists that escapes the founder wall: nothing sends, publishes, deploys, or charges
from any state without explicit founder approval, and the microproduct deploy requires two authorizations.

---

## Validation Plan

Deterministic checks first, then browser and accessibility evidence, then acceptance thresholds. This mirrors
the production direction's browser-acceptance list and the Flow Architect repair loop.

- **Static checks.** Run typecheck (`tsc -b`), lint (`eslint`), the UI unit test suite (`vitest`), and the
  production build (`vite build`). All must pass; pre-existing unrelated failures are reported separately,
  never hidden.
- **Overlay geometry tests.** Extend the existing `wovenOverlayAnchors` unit tests with a 100-plus-anchor
  fixture proving the default overlay is bounded and legible: total landmark nodes stay within a small
  budget, vertical extent stays bounded (no multi-thousand-pixel ladder), all questions are retained as
  individual clickable landmarks, causally connected product elements are retained, the unconnected tail is
  summarized with counts and nothing canonical is dropped, a summary expands its kind on focus, and selection
  stays stable across the collapse.
- **Browser checks (Playwright).** Drive the happy path (product altitude to question focus to pipeline to
  gate to outcome return), the alternate path (direct pipeline with no question), and the coding-session
  parity path. Capture Fit View screenshots for RodentRadar and estatesaleusa-like data and confirm the
  operation is legible: the three pipelines and the wall dominate, the product source is compact, no
  sixty-card ladder, no mascot.
- **Breakpoint screenshots.** Capture desktop (1440), tablet, and narrow breakpoints; confirm the primary
  action and the altitude mode remain reachable at each and that long text neither clips nor shifts targets.
- **Accessibility assertions (a11y).** Assert the accessibility contract: the Operator/Engineer segmented
  control exposes aria-pressed and is keyboard reachable with a visible focus ring; the question sidecar is a
  `role=complementary` landmark, not a dialog; the gate review is the one authorization path with focus
  management and escape; every landmark and face is a labelled focusable control; status uses `role=status`;
  contrast meets WCAG AA and status is conveyed by shape and label, not color alone; APG patterns hold for
  the segmented control, the sheet, the popover, and the menu. A keyboard-only path must complete the primary
  task end to end.
- **State checks.** Confirm every promised state in the matrix renders and behaves: empty, loading,
  recoverable error, partial, running, gate-waiting, outcome-pending, and resumed, plus the AI generating,
  low-confidence, missing-evidence, pending, and failed states.
- **Acceptance thresholds.** The change is accepted only when static checks pass, the geometry tests pass,
  the browser storyboard renders legibly at all three breakpoints, the accessibility assertions pass, and the
  production-direction browser-acceptance list (`13`) is satisfied without a dashboard or duplicate gate
  surface. Score this plan at or above 90 out of 100 with no hard failure before implementation begins, and
  re-score after implementation.

---

## Browser acceptance storyboard (real RodentRadar and estatesaleusa-like data)

1. The founder opens RodentRadar. The canvas lands at product altitude. Fit View shows a compact product
   source on the left (RodentRadar, "where wins enter: install_completed," two cited truths, one unknown),
   three pipelines flowing right to a single amber wall, the crew as a compact right perimeter, and a
   "1 needs you" focus on the parked pipeline. No sixty-card ladder. No mascot.
2. The founder reads the one-line status: "3 pipelines, 1 waiting on you." They click the pinned question
   "Which segment does the AI-visibility scorecard attract?" The Operator control stays selected; the
   question sidecar opens in place with two distinct teammate positions, their evidence split into supporting
   and challenging, the unknowns, and the founder's prior call. Disagreement is preserved, not blended.
3. The founder clicks "Turn into a pipeline." The view switches to Engineer on the composed pipeline; the
   focused-pipeline brief states the goal, the crew, the intended effect, the measurement intent, the
   evidence and unknowns, the exact gate consequence, and the safety class before the graph detail.
4. The founder watches the run: per-teammate first-person narration, a live step tracker, a Stop control.
   The pipeline reaches the wall. The gate review blooms in place: the canonical "what your yes does," the
   safety class, the offer, the crew's steps. The founder approves through the one authorization path.
5. For estatesaleusa, an outcome returns: "Got 3 replies" pools at the right and sends dashed return edges to
   the pipeline, the question, and the two contributing teammates, and proposes a dashed product implication
   ("buyers understand the promise but cannot find the first useful action"). Accepting it stages a dashed
   reviewable product-change pipeline; nothing edits the product until the founder approves it at the wall.
6. The founder expands the "Workflows" summary chip to inspect the reference taxonomy, then collapses it; the
   operation stays legible throughout and geometry is stable after a reload.

---

## Proposed Diff

Files to add, change, and leave untouched, each with the reason it exists. This plan authors no code; this
section is the pre-code contract for the future implementation pass.

Add:

- `docs/production-direction/16-product-room-ux-plan.md` — this planning artifact (the only file this pass
  creates).

Change (future implementation, not this pass):

- `ui/src/lib/wovenOverlay.ts` — re-frame the landmark budget so the product model is reference summoned by
  relevance: keep the product source (root, truths, questions, outcomes) and causally connected elements
  individual, fold the unconnected tail into per-kind summaries, and keep expansion on focus. Reason: kill
  the ladder at its source; this is the central fix.
- `ui/src/components/canvas/wovenNodes.tsx` and `ui/src/styles/woven-canvas.css` — render the source spine
  and summary chips with the existing light monochrome craft; make landmarks legible targets. Reason:
  hierarchy and clickability.
- `ui/src/components/FloatingDock.tsx` and `ui/src/styles/floating-dock.css` — add the quiet one-line
  operation status; demote the axis toggle beneath the altitude control. Reason: orient without a dashboard;
  end the two-mode-control confusion.
- `ui/src/components/crew/*` and `ui/src/components/LeftRail.tsx` — demote the crew to a compact perimeter and
  remove the mascot. Reason: stop the forty-percent panel and the banned decorative blob.
- `ui/src/App.tsx` — wire the compact crew perimeter, the contextual composer, and the demoted axis toggle;
  preserve the Operator/Engineer control, focus-to-trace, and the one gate path. Reason: assemble the model
  without a new surface.

Leave untouched:

- `brain/**`, all backend projection code, and the canonical `woven.canvas` contract — the projection is
  correct; the fix is UI-side rendering discipline.
- `docs/production-direction/00` through `15` and `AGENTS.md` — this plan does not rewrite the direction; it
  implements `09` and `12` Workstream 8 faithfully.
- `ui/src/components/gate/GateReview.tsx` — the one authorization path stays the one path.
- The existing anchor overlay, object/tie/kind weaving, `QuestionFocus`, `FocusedPipelineReadout`,
  `OutcomeReturn`, and the Operator/Engineer control — reused as-is or minimally re-scoped, not replaced.

---

## Escalation note

This plan changes the product room's rendering discipline and demotes several surfaces, but it introduces no
new dependency, no destructive workflow, no new permission boundary, and no new top-level product concept. It
stays inside the fixed decisions (one woven canvas, persistent teammates, open pipelines, one founder wall)
and enriches their projection. It should be reviewed by the founder as the option field above before the
implementation pass begins, since the chosen mental model and its rejected alternatives are the founder's
call to confirm or overturn.

---

## Implementation-verification receipt (post-implementation)

This receipt records the implementation pass against this plan. It is appended, not a rewrite; the plan
above is unchanged.

**Files changed (UI scope only; no backend, no `AGENTS.md`, no docs 00-15):**

- `ui/src/components/crew/CrewFace.tsx` — default variant flipped from the decorative hand-drawn character
  to the clean monogram roundel, removing the robot mascot everywhere it rendered by default (faces mean
  authorship, never decoration). The character variant remains for explicit opt-in callers, of which the
  shipped surfaces have none.
- `ui/src/components/FloatingDock.tsx` and `ui/src/styles/floating-dock.css` — added the quiet one-line
  operation status as a polite `role=status` region, subordinate to the breadcrumb and the Operator and
  Engineer altitude control.
- `ui/src/App.tsx` — derives the operation status from real state (built pipelines, how many wait on the
  founder, how many outcomes returned) and passes it to the dock; only the non-zero parts render.
- `ui/src/styles/woven-canvas.css` — demoted the By shared objects and By GTM type axis toggle to a quiet
  in-Operator refinement (lighter chrome, muted, still keyboard reachable); it no longer reads as a peer of
  the altitude control. The parked "N need you" chip stays prominent.
- `ui/src/index.css` — an interim width cap on the docked composer. NOTE: superseded by the repair pass
  below, which makes the composer a contextual, collapsed-by-default slim rail at product altitude rather
  than a capped-but-still-open 340px column. The cap remains as a secondary bound; it is no longer the
  mechanism that keeps the composer from dominating.
- `ui/src/components/crew/CrewFace.test.tsx` (new) and `ui/src/components/FloatingDock.test.tsx` — focused
  tests: the default face is the roundel and not the character avatar; the operation status renders as a
  polite status region and is omitted when absent.

The product-model long-tail collapse (source spine plus per-kind summaries plus relevance surfacing) landed
in an earlier pass in `ui/src/lib/wovenOverlay.ts` and `ui/src/components/canvas/wovenNodes.tsx`, with the
100-plus-anchor bounded-geometry tests in `ui/src/lib/wovenOverlayAnchors.test.ts`; this pass preserved it.

**Static verification:** typecheck (`tsc -b`) passes, lint (`eslint`) passes, production build
(`vite build`) passes, and the full UI unit suite passes at 177 tests across 29 files with zero failures
outside the pre-existing, unrelated ComposerDock localStorage environment cases (which are green in the
integrated environment). New and adjusted tests cover the mascot removal, the operation status region and
its absence, the altitude control state, and the bounded 100-plus-anchor overlay geometry.

**Browser verification (Playwright/Chrome against the live app on port 4317, screenshots in
`output/playwright/`):** captured at desktop 1440 (`drover-16-desktop-1440.png`), tablet 1024
(`drover-16-tablet-1024.png`), and narrow 768 (`drover-16-narrow-768.png`). Judged against this plan: at
desktop the robot mascot is gone and every teammate reads as a clean monogram roundel; the one-line
operation status reads "1 pipeline · 1 waiting on you"; Operator and Engineer are visible; the pipeline
reads clearly in the center with no product-model card ladder; the crew and composer perimeter is bounded
and does not crowd the canvas. At tablet and narrow the composer stays capped at about a third of the
viewport, the pipeline stays visible, and nothing overlaps.

**Honest remaining defects:**

- The full narrow bottom-tray behavior (map overview strip plus crew in a bottom tray) is not implemented;
  at 768 the layout is bounded and non-overlapping but cramped, and the dock's status and Engineer label
  begin to clip. Drover's standing target is desktop 1440, where the layout is clean; the narrow tray is a
  follow-up.
- The corner-control consolidation is partial: the mascot, the wide panel, and the axis-toggle demotion are
  done, and the operation status is added, but folding "Log what happened" and "Where wins enter" into their
  destinations is not yet complete.
- The live browser check ran against the currently active project (a LocalSeoData-shaped product with few
  product-model details), so the specific RodentRadar 100-plus-anchor Fit View was not re-captured live; the
  ladder removal is proven by the bounded-geometry unit tests and the absence of any card ladder in the
  captured views.

---

## Implementation-verification receipt — repair pass (P0/P1 blockers)

This section records the repair pass against a fresh Opus critique and SUPERSEDES the earlier receipt's
claims where they conflict — specifically the "compact perimeter via a `max-width: 34vw` width cap" and any
implied responsive tablet/narrow parity. The supported target is desktop 1440 (project desktop-only
doctrine); the earlier width-cap remains only as a secondary bound.

**P0 — composer dominance (resolved).** The docked composer no longer stays a 340px open column at product
altitude. At Operator (product / question altitude) it now rests as the existing SLIM 48px perimeter rail —
its running and gate state still visible on the rail's orb and shield — and opens only on the founder's
explicit focus. Files: `ui/src/components/ComposerDock.tsx` (a `preferCollapsed` prop; the pure, tested
`composerStartsCollapsed` decision in `ui/src/lib/composerCollapse.ts`; and a small altitude-sync effect
that re-asserts the slim rail on a cold project-load or a live-session gate, browser-verified), and
`ui/src/App.tsx` (`preferCollapsed={effectiveCanvasLens === "operator"}`). Because the composer is slim by
default at product altitude, the LEFT roster is the single persistent crew home there — the two-crew-homes
problem is gone by construction.

**P0 — no mascot (resolved, prior pass, preserved).** `CrewFace` defaults to the clean monogram roundel;
no decorative robot avatar renders.

**P1 — one wall (resolved).** On the merged Operator canvas with two or more gated pipelines, every lane's
gate is aligned onto one shared x and a single vertical amber founder-wall threshold is drawn across the
lane band. Files: the pure, tested `alignGatesToWall` in `ui/src/lib/wovenOverlay.ts`, a `FounderWall` node
in `ui/src/components/canvas/wovenNodes.tsx` registered in `ui/src/components/GraphCanvas.tsx`, and
`ui/src/styles/woven-canvas.css`. The gate CARDS stay individually actionable through the one `GateReview`
path; backend and authorization are untouched. Browser DOM check on estatesaleusa: wall present, three gates
aligned at a single x (2548).

**P1 — positive source (resolved).** At Operator the left source is expanded and shows the product
root/name, where wins enter, cited truths (from the canonical `woven.canvas` product-truth anchors), and the
important open unknowns (the founder's pinned questions) — bounded, never fabricated. The old vertical
"Where wins enter" tab is demoted to the collapsed state. Files: `ui/src/components/ProductEntryColumn.tsx`,
`ui/src/styles/product-entry.css`, `ui/src/App.tsx` (expanded at Operator; truths/unknowns computed from the
canvas). Product-model detail remains relevance-only or per-kind summary chips.

**P2 — hierarchy/proof (resolved).** Operator/Engineer stays visible; the axis toggle stays quiet and
subordinate. This receipt is aligned to the desktop 1440 target; the earlier responsive/width-cap framing is
superseded.

**Deterministic tests added/updated (full UI suite: 31 files, 186 tests, 0 failures; typecheck, lint, build
all clean):** `ui/src/lib/composerCollapse.test.ts` (composer default/context: slim at product altitude even
with a live session; opens at action altitude; explicit cold-open wins; slim with no/terminal/floating
session); `ui/src/lib/wovenOverlayAnchors.test.ts` (`alignGatesToWall`: gates align to one shared x, wall
band reported, no-op with fewer than two gated lanes; plus the existing 100+ anchor bounded-geometry tests);
`ui/src/components/ProductEntryColumn.test.tsx` (source renders name, where-wins-enter, cited truths, and
open unknowns; omits truth/unknown sections when empty; demotes to the quiet tab when collapsed);
`ui/src/components/crew/CrewFace.test.ts(x)` (no mascot by default); `ui/src/components/FloatingDock.test.tsx`
(operation status region).

**Browser proof (Playwright/Chrome against the live app on port 4317, 1440 desktop, Operator, no focus, Fit
View, composer collapsed):** `output/playwright/drover-16-rodentradar-final.png` and
`output/playwright/drover-16-estatesaleusa-final.png`. Both show: the composer as the slim rail (48px,
DOM-verified), a bounded source with no 60-card ladder (rodentradar's ~60 product details render as 8
per-kind summary chips, DOM-verified `summaryChips: 8`), the single left crew roster, no mascot, the
Operator/Engineer control with a quiet axis toggle, the operation status line, and 3 (rodentradar) / 4
(estatesaleusa) crew-owned pipelines with the founder wall present (DOM-verified `wallPresent: true`, gates
aligned). Also captured: `output/playwright/drover-16-engineer-pipeline.png` (action altitude — the single
`GateReview` "Your call" with staged actions and Approve/Send back/Edit) and
`output/playwright/drover-16-operator-check.png` (the localseodata Operator view showing the same
collapse/source/summary behavior).

**Honest remaining defects:**

- At Fit View on estatesaleusa/rodentradar the crew-owned pipeline lanes read faint and small: the founder
  wall spans the full multi-lane band, which pushes Fit to zoom out, so the operation is structurally
  dominant but not as punchy as it should be. Tuning the Fit padding / wall extent and lane contrast is a
  follow-up; the structural blockers (composer, wall, source, one crew, no mascot, no ladder) are resolved.
- A focused-question altitude screenshot was not captured for these two products in this pass (no pinned
  question was readily present to focus); question altitude is covered by unit tests and the `QuestionFocus`
  component, not by a fresh screenshot here.
- Corner-control consolidation is still partial: the mascot, the wide composer column, and the axis demotion
  are done and the operation status is added, but folding "Log what happened" and "Where wins enter" fully
  into their destinations is not complete.
- Narrow/tablet layouts are not a supported target (desktop 1440 doctrine); the earlier receipt's responsive
  claims are superseded.

---

## Implementation-verification receipt — second visual repair (Operator semantic projection)

This section records the second visual-repair pass and SUPERSEDES earlier claims that Operator was legible
by rendering the merged Engineer graph. It was not: Fit View shrank four full step graphs to microscopic
text. The fix is a semantic projection change, not a backend ontology change.

**Operator is now a semantic operation projection (P0 mental-model failure — resolved).** On the Operator
(product) altitude the merged Engineer step graph is no longer rendered. Each pipeline becomes ONE bounded,
readable horizontal lane: the pipeline goal/name at the left, a single crew/work summary in the middle
(faces plus step count, not every step), its gate crossing aligned to the ONE shared founder wall, and the
outcome (a real joined market return, or an honest empty state — see the truth-integration section below,
which corrected an earlier version that showed internal produced counts) at the right. A lane click opens
that pipeline in Engineer — the full step graph
and the one `GateReview` — so nothing is lost. Files: the pure, tested `ui/src/lib/operationLanes.ts`
(`buildOperationLanes`), the compact nodes in `ui/src/components/canvas/operationNodes.tsx` and
`ui/src/styles/operation-lanes.css`, and the wiring in `ui/src/components/GraphCanvas.tsx` (an
`operationMode` prop that renders the operation lanes and their single wall instead of the merged graph,
skips the heavy merged build so Fit frames the lanes, routes a lane click to `onOpenLane`, and suppresses
the cursor-follow overlay) plus `ui/src/components/canvas/GtmCanvas.tsx` (Operator sets `operationMode`).
Engineer is untouched: the full graph and `GateReview` remain the only action path.

**The wall is plainly visible and labeled (P1).** In the operation projection all lane gates align on one
shared x and a single vertical amber `Your wall` threshold spans the lane band (DOM-verified `wallLabel:
"Your wall"`, and visible in both captures).

**The product source is consistently open at Operator for both products (P1).** DOM-verified
`sourceOpenPanel: true, sourceTab: false` on both RodentRadar and estatesaleusa. Truths and open-unknown
signals are now clipped so the source stays a compact headwaters, not a wall of text
(`ui/src/components/ProductEntryColumn.tsx`). The 8 taxonomy summaries remain secondary reference and do not
form a new ladder.

**Orphan control removed.** The floating "Back to Claude" cursor-follow pill no longer renders at Operator
altitude; the 48px Claude rail is the affordance (DOM-verified `backToClaude: false`).

**Failure diagnostic made audience-aware (correction to the prior receipt).** The "Drover saw a failure"
chip is a BUILDER diagnostic (Drover logging its own run failures, per the code's own comment "Drover
watching its OWN runs"); it is not a founder-GTM failure, is not caused by this flow, and is read-only (it
clears when the underlying code is fixed, not by a dismiss). An earlier iteration gated it off the canvas
with a constant `DOGFOOD_FAILURE_CHIP_ON_CANVAS = false`; that was WRONG because the chip is the only
observed entry point to the `FailureLogPanel`, so the constant made the diagnostic unreachable while this
receipt claimed the panel was preserved. Corrected: the constant is removed and the visibility is derived
from the effective canvas lens via the pure `showSelfObservedFailureChip` (`ui/src/lib/failureChipVisibility.ts`,
used in `ui/src/App.tsx`). The chip is now HIDDEN at Operator/product altitude — so the founder operation
reads clean — and REACHABLE at Engineer/builder altitude when failures exist, where it opens the fully
intact `FailureLogPanel`. The failure log store, API, and panel are unchanged: this is audience placement,
not suppression. Proven deterministically by `ui/src/lib/failureChipVisibility.test.ts` (hidden in Operator,
reachable in Engineer, nothing when no failures, and off while the panel is open or off the canvas view).

**Exactly one persistent crew home, no mascot, Operator/Engineer visible, axis subordinate** — all preserved
and DOM-verified (`mascot: false`, one left roster while the composer is the slim rail).

**Deterministic tests (full UI suite: 32 files, 192 tests, 0 failures; typecheck, lint, build clean):**
`ui/src/lib/operationLanes.test.ts` — one bounded four-node lane per BUILT pipeline (never the full graph);
goal carries name/goal/gate-aware status; work summarizes crew + step count (a 8-step pipeline stays one
work node); the gate carries the pending count; all gates align on one shared x with a single wall band;
no lanes/wall when nothing is built. Existing `alignGatesToWall`, `composerCollapse`, `ProductEntryColumn`,
`CrewFace`, and 100+ anchor tests remain green.

**Browser proof (Playwright/Chrome, 1440 desktop, Operator, no focus, Fit View, clean state), inspected at
original resolution:** `output/playwright/drover-16-rodentradar-final.png` (3 lanes) and
`output/playwright/drover-16-estatesaleusa-final.png` (4 lanes). In each, every pipeline's name/goal, crew
faces, `Your gate` crossing on the one wall, and the outcome node (a real joined return, or `No outcome
yet` — see the truth-integration section below) are readable; the source is open with
the product name and where-wins-enter truths; there is no failure toast, no "Back to Claude" bubble, no
mascot, and no full composer column (the slim Claude rail only). `output/playwright/drover-16-engineer-
pipeline.png` proves a lane click opens Engineer: the focused-pipeline readout (goal, relevant crew,
intended effect, measurement, evidence, "what your yes does", safety class) over the full 8-node step graph
with the one GateReview reachable.

**Honest remaining defects:** the source card on a product with long pinned questions is still somewhat
text-dense even after clipping (a further "expand for detail" affordance is a follow-up); the operation
lanes sit in the right portion of the canvas beside the ~300px source column, which is legible at 1440 but
could be centered with further Fit-padding tuning; the axis toggle is subordinate but inert in the operation
projection (it drives object-weave axes that the compressed lanes do not show) and could be hidden at
Operator; and a focused-question altitude screenshot was not re-captured (no pinned question was present to
focus — covered by unit tests and `QuestionFocus`). No P0/P1 remains unresolved.

---

## Implementation-verification receipt — final canvas truth integration

This section records the truth integration against Sol's backend fix and CORRECTS the earlier claim that the
Operator outcome node showed a "produced count". That was a semantic lie: `ChannelMeta.lastRunResult.produced`
is internal per-node emitted-item throughput (it can count the same item repeatedly) and is NOT a market
outcome. It has been removed from the outcome card entirely.

**Operator outcome nodes now mean REAL joined returns.** Each lane's outcome node is derived from the
canonical `operatingView.woven.canvas.outcomes` projection (`canvasOutcomes`), matched to the lane ONLY by
the backend's typed pipeline `channelId` (the outcome lineage's `pipelineRef.id`). It shows the newest real
joined outcome (honest label + kind + optional value); a pipeline that ran with no joined outcome shows
`No outcome yet`; one that never ran shows `Not measured yet`. Internal produced counts never appear. A
connector name (Gmail/Slack/…) is never a pipeline id, so it can never be matched as a lane's outcome. The
outcome card stays a native canvas node on the lane; the one wall and the lane-click-into-Engineer path are
intact. Files: `ui/src/lib/operationLanes.ts` (new `outcomes` param + `newestOutcomeFor`, matched by typed
channelId; `OpOutcomeData` carries a real outcome or an honest empty state, never `produced`),
`ui/src/components/canvas/operationNodes.tsx` (the outcome node renders the real return or the honest empty
line), and `ui/src/components/GraphCanvas.tsx` (feeds `canvasOutcomes(woven.canvas)` into the builder).

**Product-implication acceptance is now fully server-derived.** The accept route derives the one allowlisted
add_node proposal from trusted outcome lineage, requires browser + owner authority, and REJECTS any client
`graphId`/`operations`. The UI was updated to match: `ui/src/api.ts` `acceptProductImplication` sends only
the project scope and (optionally) the founder's wording — its `ImplicationAcceptBody` type has no
graphId/operations field, so a caller cannot even construct one. `ui/src/App.tsx` `acceptImplication` calls
the canonical route directly for a proposed OR already-staged implication, loads (never drives) the returned
session, and enters the existing proposal-review canvas path; the honest composer fallback runs ONLY when the
backend judges the lineage not actionable. `ui/src/lib/canvasProjection.ts` and `ui/src/types.ts` preserve
the backend `review` object, the raw `status`, and the proposal lineage (`pipelineRef`/`graphRef`) for
status/display/DEDUPE, but never as executable client authority; the executable `canvasImplicationBodies`
helper (which forwarded graphId/operations) was removed.

**OutcomeReturn / typed pipeline lineage.** The outcome rail's `onOpenPipeline` uses the outcome's typed
`channelId` (the backend's `pipelineRef.id`), so it opens the correct pipeline and a connector name can never
be treated as a pipeline id.

**Deterministic tests (full UI suite: 33 files, 200 tests, 0 failures; typecheck, lint, build clean):**
`ui/src/lib/operationLanes.test.ts` — the outcome node shows the newest real joined outcome matched by typed
channelId, never `produced`; a Gmail/Slack connector name never matches a pipeline id; `No outcome yet` when
a pipeline ran without a joined outcome and `Not measured yet` when it never ran. `ui/src/api.canvasWiring.
test.ts` — the accept body can carry only wording, never graphId/operations, for both a bodied and an empty
call. `ui/src/lib/canvasProjection.test.ts` — `canvasImplications` preserves the server-derived `review` and
raw `status` for display/dedupe while carrying no client-executable graph authority; the removed
`canvasImplicationBodies` executable helper is gone.

**Browser proof (Playwright/Chrome, 1440, Operator, no focus, Fit, clean state), inspected at original
resolution:** `output/playwright/drover-16-rodentradar-final.png` (3 lanes) and
`output/playwright/drover-16-estatesaleusa-final.png` (4 lanes). Every lane's outcome node now honestly reads
`No outcome yet` (these pipelines ran but have no joined market result) instead of a fabricated produced
count — DOM-verified `hasProduced: false`. The source is open, the lanes are readable, the one amber wall is
visible, the composer is the slim rail, and there is no mascot, no orphan control, and no failure chip.
`output/playwright/drover-16-engineer-pipeline.png` reconfirms a lane click opens Engineer (the full 8-node
step graph with the focused-pipeline readout and the one GateReview path reachable; DOM-verified
`engineerPressed: true, opLanes: 0, stepNodes: 8, gateReachable: true`).

**Honest remaining defects:** unchanged from the prior receipt (source text-density on long-question products,
lanes sit right of the source column, the axis toggle is inert at Operator, and no focused-question
screenshot). No P0/P1 remains unresolved, and no claim that internal output volume is a market outcome
survives in this document.
