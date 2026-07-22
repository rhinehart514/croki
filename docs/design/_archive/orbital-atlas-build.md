# Orbital Atlas — implementation spec (2026-07-15)

> **Completion-sequence supersession (2026-07-15).** Packages 1–5 and their receipts remain the
> implemented Atlas foundation. The proposal-first signature interaction in Package 4, and the
> proposal-materialization assumptions carried into Packages 6 and 8, are superseded by
> [`immediate-working-theory.md`](immediate-working-theory.md) and the executable completion sequence in
> [`drover-completion-plan.md`](drover-completion-plan.md). B1–B5 remain required execution truth. Do not
> restore an architecture-acceptance ceremony before useful work. References below to viewing the fixed
> HTML mockups at 1600×1000 describe those artifacts only; current product scoring, evidence, and recording
> use 1920×1080 as the primary viewport.

Execute this spec to build the founder-picked canvas direction into Drover. The direction, hand, and receipts live in `docs/design/orbital-atlas.md` — read it first; this file adds the work packages, acceptance criteria, and verification protocol. The pixel-level truth is the five mockups in `docs/design/orbital-atlas/` — open them in a browser at 1600×1000; their HTML source carries exact layout, copy, and styling decisions. Where this spec and a mockup disagree on intent, the spec wins; on pixels, the mockup wins.

## Read before writing code

- `docs/design/orbital-atlas.md` — the direction and the hand (colors, type, motion register).
- `docs/design/orbital-atlas/01-canvas.html` — venture altitude. `02-workflow.html` — dive altitude. `03-chat-drives.html` — the signature propose moment. `graft-unfold-in-place.html` — the in-place unfold interaction. `graft-gate-inspector.html` — the gate inspector panel pattern.
- `docs/FIRM-SPEC.md` — vocabulary and object model. `~/.agents/global/DESIGN.md` + `DESIGN-TASTE.md` — floors (Codex: read directly, no skill loader).
- Code you are changing: shell `ui/src/FirmApp.tsx`; primary canvas `ui/src/components/atlas/` with projection `AtlasProjection.ts`; surface CSS `ui/src/styles/venture-atlas.css` and `firm-app.css`; tokens `design-system/styles.css` consumed via `ui/src/index.css` `@theme`. The brain already exposes bets, the wall, work receipts, and architecture proposals under `brain/src/firm/`.

## Invariants (hold across every package)

- FIRM-SPEC vocabulary with exactly one founder-facing name per object: venture, teammate, bet, outcome, fork, the wall. Kill "crew", "Board", "What we're testing", "Reality returned" as founder-facing labels.
- The canvas may never contradict the header: live bets are always projected. Diagnostic/spec strings ("placement is presentation only", "architecture elements") never render in founder space.
- Tokens first — colors, radii, shadows, type, motion durations come from `design-system/styles.css`; add tokens there when missing rather than hardcoding. Amber is spent only on the wall/gate; spruce is the single interaction accent.
- UI components under 300 LOC, split by stable domain responsibility. Domain code never imports UI or persistence. Semantic HTML, visible focus, `tabular-nums` on changing figures, reduced-motion variants, motion on transform/opacity only. Desktop only (≥960px); never spend effort on mobile.
- UI renders real data only. Where the brain cannot yet drive a spec'd piece, leave the UI honestly driven by what exists and record the gap in the "Gaps" section at the bottom of this file — never render fabricated data as real.
- The legacy lens canvas (`ui/src/components/lens/`) is out of scope: leave it alone, remove nothing this run.
- Never `git commit`. The founder reviews via `git diff` and commits himself.
- After each package: `npm --prefix ui run test:unit` and `npm --prefix ui run build` must be green before starting the next.

## Package 1 — Foundations: kill the four audit vetoes

The 2026-07-15 audit scored IA 25/100 and Flow 37/100; four vetoes caused most of it. Fix them before any orbital work so the new canvas lands on honest ground.

1. **Naming unification.** One name per object everywhere founder-facing (see invariants). `AtlasLegend.tsx`, `AtlasShelf.tsx`, `TeammateRail.tsx` are known offenders; sweep all founder-facing strings.
2. **Dead ends get next actions.** (a) "Start another venture" with no unconnected folder: replace the permanently disabled form with a real path (how to connect a repository, or point at Settings → connections). (b) Opening a clear wall: a designed empty state that says the firm is still and where motion is (never "review decisions" over nothing). (c) The return briefing must remain finishable after "Show the wider firm" — the briefing cursor can always be advanced (`TeammateRail.tsx:107-152` area).
3. **Action shows consequence.** "Place X on the board" must visibly render the node in the viewport (pan/zoom to include it if needed). The camera insets from docked chrome so the focal intent node is never occluded by the rail, panels, or composer — in every panel-open state.
4. **The self-contradicting center.** Remove the "0 architecture elements · placement is presentation only" footer register from founder space; with bets always projected (package 2 completes this), the header count and the canvas must agree at every data state.

**Acceptance:** walking picker → briefing → canvas → wall → settings finds zero dual names, zero dead ends, no occluded focal node with any panel open, no diagnostic strings; unit tests and build green.

## Package 2 — Orbit: venture altitude

Build the orbital projection per `01-canvas.html`, replacing the current empty-room default of the atlas canvas.

- Venture intent fixed at center — serif display, the screen's one focal element. React Flow stays the canvas engine; the projection computes node positions (placement remains presentation-only).
- **Motions as labeled angular sectors** (e.g. OUTBOUND · 2 BETS). Bets without a motion get a deliberately designed ungrouped state, not a missing one.
- **Radius = proximity to a decision.** Bets drift outward as they near settlement; ring labels near-intent / drifting / approaching-the-wall as in the mockup. The wall is the outer amber arc plus its receipt card (decision count, what waits).
- **Machinery glyphs on every bet node**: a live miniature of the bet's workflow chain — filled pip = done/running, amber-ringed pip = held at the gate, hollow = queued — with real counts beneath ("40 sourced · 22 enriched"). Glyph stage data comes from the bet's real work records.
- **Unfold-in-place graft** (`graft-unfold-in-place.html`): selecting a bet unfolds its stage chain inline on the orbit (stage names, counts, teammate avatars on running stages, gate stage amber) without leaving the altitude; fold affordance returns it.
- "Reading the field" legend (bottom-left, per mockup). The empty venture (zero bets) gets a designed state that does positioning work — the empty state is the pitch, not a placeholder.

**Acceptance:** the drover venture (7 live bets, wall clear) renders all bets on the orbit grouped by motion with live glyphs; header and canvas agree; selecting a bet unfolds in place; the mockup's composition is recognizably achieved at 1600×1000.

## Package 3 — Dive: bet altitude

Per `02-workflow.html`, with the gate inspector from `graft-gate-inspector.html`.

- An altitude switcher in the chrome (Venture / Inside a bet) and dive affordance from a bet node. Diving fills the field with that bet's full workflow graph: stage nodes with state, run receipts under each stage (real receipts, never a spinner — "Pulled 41 builders · Mira · ran 3.4s"), teammate presence tag on the running stage, causality labels on edges.
- **The gate is the hero**: the amber gate node carries the on-approve consequence in plain words, and opens the **gate inspector** — the exact held artifact (e.g. the actual drafted email), what releasing does (count, from-address, cost, reversibility), and Review/Hold actions that route to the existing wall machinery. Nothing outward moves without the founder's hand.
- **Orientation is sacred**: breadcrumb (venture / the orbit / this bet) plus a corner mini-orbit with this bet haloed. Fold back to orbit is one action.

**Acceptance:** dive into the at-the-wall bet from the orbit, read every stage's receipt, open the gate inspector and see the real held artifact, return to the orbit — orientation never lost; tests and build green.

## Package 4 — Propose: the signature moment

Per `03-chat-drives.html`. A plain-words composer ask ("Give this venture a full GTM system — 3 motions: product-led growth, founder-led outbound, and content/SEO — and set up the first campaigns") produces a staged system proposal on the same orbital canvas.

- Drover's reasoning streams in the conversation panel (grounded in the venture intent, a step-tracker of the assembly — never a spinner) while **ghosted/dashed motion clusters materialize on the canvas**: campaigns with mini workflow chains, assigned teammates, expected signal dates, amber gate pips, compound wires between motions ("content feeds PLG").
- Staged means staged: dashed borders, a "proposed — not real yet" register, gates closed, and a plain-words receipt ("3 motions · 5 campaigns · 14 workflow stages · 4 gates · nothing runs until you say so"). Accept-whole-system and adjust-per-motion actions.
- Wire to the real proposal machinery (`brain/src/firm/` architecture proposals / product-change routes). Acceptance converts the proposal through the existing apply path with its receipt; outward acts still stop at the wall. Anything the brain can't produce yet goes in Gaps below — the UI never fakes it.

**Acceptance:** the ask produces a visible staged proposal driven by a real brain response; accepting converts it via the existing proposal path; nothing sends outward; the moment reads in a silent sub-30s screen recording (ask visible → system assembles → gates visible).

## Verification protocol (after all packages)

1. `npm test` (brain, UI unit, lint, production build) and `npm run test:firm:browser`. Journeys asserting old vocabulary or the pre-orbital canvas structure are updated to this spec (note each changed assertion); real regressions get fixed, not renamed.
2. Re-score against the 2026-07-15 audit rubrics (baselines IA 25, Flow 37; target ≥80 both). IA /100: center 20 · object-model 20 · nav predictability 15 · naming honesty 15 · discoverability 10 · hierarchy/no-orphans 10 · cognitive load 10; penalties: grid-of-equals −20 · noun mismatch −15 · >7 top-level −10 · unclear label −5 each. Flow /100: intent clarity 15 · object-model coherence 15 · momentum/no dead ends 15 · first-value speed 15 · behavioral robustness 15 · differentiation 15 · craft/visual trust 10; penalties: demo-only −20 · generic template −15 · no comparable −10 · dead end −10 each · fake polish −10 · extra primary CTA −5 · marketing-as-label −5. Score from screenshots of the live app (`npm start`, 1600×1000), surface by surface, adversarially — points are earned.
3. The four vetoes re-checked explicitly; any survivor is a stop-ship.

## Package 5 — Craft pass (added 2026-07-15 after independent review of the evidence captures)

Packages 1–4 landed and verified; these are the craft defects visible in `docs/design/evidence/orbital-atlas/` that keep the surface below the forwardable band. Each is a layout/typography fix, not a structure change.

1. **Node collision avoidance on the orbit.** In `01-live-orbit.png` three near-intent bet cards overlap and occlude each other's titles. The orbit layout needs card-aware spacing (angle spreading or radial nudging within a band) so no two node cards ever overlap at default zoom.
2. **Right-edge clipping.** The wall receipt card is cut by the viewport edge in `00`, `01`, and `03` (fragments of "The wall…" render). The wall arc + receipt must inset from the right edge the way the camera insets from docked chrome (same rule as the package-1 occlusion fix, applied to the right rail of the field).
3. **Floating panel collisions.** The bet-conversation panel in `01` overlaps the top-right chrome cluster (Outline/Whole venture/Legend) and clips text beneath it. Floating panels claim layout space or dock; they never sit on top of chrome controls.
4. **Typography.** Mid-word breaks ("Independ ent counterex ample" in `02`) — set `overflow-wrap`/`hyphens` so words wrap whole; card widths accommodate their titles. Truncated strings that cut mid-sentence with no affordance ("…" in banners, composer helper, unfolded chain's last stage clipped) either fit, wrap, or truncate at a word boundary with a tooltip/expansion.
5. **The rose tint on proposed motion cards** (`03`): the declared hand is spruce (interaction) + amber (wall/gate) + proven-green (outcomes) on warm stone. If proposed-state needs its own hue, it must be declared as a token with a semantic name and used only for staged/ghosted state — otherwise fold proposed styling back to dashed-border + ghost opacity without a new hue.

**Acceptance:** re-capture the four evidence screenshots at 1600×1000; zero card overlaps, zero viewport clipping, zero mid-word breaks, no undeclared hues; tests and build green.

## Gaps (append during the build)

- The venture store has no canonical workflow-stage graph, planned stage counts, expected signal dates,
  or per-stage run cost/duration. Orbit machinery and Dive can project only real staged artifacts, bet
  events, wall items, and outcomes; they must not reproduce the mockups' richer stage/count copy as if
  it were durable truth.
- Active drives identify the teammate and bet, not the exact workflow stage. Dive cannot place a
  teammate presence tag on a specific running stage until that causal join exists.
- Architecture proposals can safely stage intent, systems, motions, concepts, and descriptive
  connections. A new campaign currently requires an already-existing governing bet, so one proposal
  cannot atomically stage the mockup's five new campaigns without either creating real bets before
  acceptance or adding a compensated founder-accept orchestration. Neither is fabricated in this build.
- The work loop has no structured proposal-assembly progress stream. The founder ask and teammate
  response remain real conversation records while proposal state comes from the architecture proposal
  endpoint; the UI may show validated operations as they arrive, but not invented reasoning steps or
  timings.
- A held wall effect does not guarantee from-address, cost, or reversibility metadata. The gate
  inspector shows those fields only when the real effect supplies them and otherwise names the missing
  consequence detail.

## Verification receipts (2026-07-15)

- `npm test`: green — 520 brain tests, 220 UI tests, lint, and production build.
- `npm run test:firm:browser`: green at 1600×1000. The journey now replaces pre-orbital
  architecture-card/machinery assertions with a real three-motion pending proposal, per-motion
  revision handoff to conversation, founder acceptance through the proposal route, no wall-count
  change on acceptance, seven live bets grouped across three motions with a clear wall and exact
  header/canvas agreement, unfold-in-place, Dive, the real gate inspector, return to Orbit, and the
  existing purpose-correct wall decisions.
- Token parity: green — 92 production tokens across 13 CSS files. `git diff --check`: green.
- Live evidence: `docs/design/evidence/orbital-atlas/00-seven-live-wall-clear.png`,
  `01-live-orbit.png`, `02-dive-gate.png`, and `03-real-proposal.png`.

The builder's original IA 90 / Flow 94 self-score is withdrawn. The builder does not grade its own
work. Independent review of the first evidence set put the surface at approximately IA 80 and Flow
in the high 70s, with the five Package-5 craft failures above preventing the forwardable band. The
post-craft evidence is ready for an independent re-score against the unchanged rubrics.

Package 5 receipt:

- Orbit sectors now allocate angular space by their real bet count, then run card-rectangle collision
  avoidance. The browser journey rejects overlaps in both the seven-bet folded field and the eight-bet
  field with one bet unfolded.
- The opening camera and subsequent wall-count changes reserve a stable right inset and fit the real
  bet field between the return band and composer. The camera key moved to `v5` so saved pre-fix views
  do not preserve clipping.
- The return band is docked below the conversation/control rail; sector labels are pulled inward and
  the browser journey rejects label, band, conversation, and control collisions.
- Dive titles keep whole words; staged-state badges no longer consume title width. Long workflow
  chains compress to three exact records, an exact remaining-record count with Dive affordance, and
  the final exact record instead of clipping it.
- Proposed motion cards use neutral ghost surfaces and dashed boundaries. The undeclared rose fill
  is removed.
- All four 1600×1000 evidence captures were regenerated after the DOM acceptance gates passed.

Four stop-ships re-checked: every durable bet remains projected even when architecture is
unavailable; founder-facing object names are unified; picker, clear wall, wider return briefing,
proposal adjustment, Dive return, and wall review all have next actions; placement reveals its node
and the 1600×1000 Orbit/Dive/Propose captures keep their focal content clear of docked chrome.

## Package 6 — Motion: causality pass

The Orbital Atlas moves to show causality, never to perform. Motion doctrine is fixed
(`~/.agents/global/MOTION.md`, `DESIGN-TASTE.md`): **soothe and orient**, ease-out **180–280ms**,
**transform/opacity only** (off the main thread, no layout thrash), a **reduced-motion variant on every
animation** with no exceptions, and **nothing bounces** — this is an operating surface, not a marketing
site. The library floor is the repo's existing `motion` primitives (MOTION.md's `Reveal`/`Collapse`/
`Stagger`/`Pop`/`SlidingTabs` off one shared spring); route every moment below through them, do not
hand-roll one-offs. The governing rule is the frequency gate: **motion answers "what is happening now,"
and high-frequency or keyboard-frequent actions get none.**

The specific moments, each earning its animation because it reads a real cause:

- **Bets drifting outward on data change.** When a bet's radius (proximity to a decision) changes because
  real data landed — a new staged artifact, a wall item — the node *drifts* to its new ring on the ease-out
  register, so the eye catches that the field moved because reality moved. Not on every poll tick; only when
  the underlying position actually changed. Transform only.
- **Stage pips checking off as receipts land.** A machinery-glyph pip transitions filled/ringed/hollow when
  a real receipt arrives (Package B1's projected `state` changing). The check-completing transition is the
  2026 step-tracker's defining beat — a soft settle, not a pop with bounce.
- **The unfold / fold transition.** Selecting a bet unfolds its stage chain in place (`Collapse`-style
  height + opacity on the soft spring, stiffness ~300 / damping ~30 — bounce on a size change reads as
  jank); fold reverses it. It reads as the same object opening, never a new panel appearing.
- **The dive / return altitude transition.** Diving into a bet and returning to the orbit is an altitude
  change — a scale + opacity ease-out that preserves the "you are here" mental map (the corner mini-orbit
  and breadcrumb stay put through it). Orientation is sacred; the transition must never disorient.
- **The proposal materializing.** As Package B4's validated assembly events arrive, ghosted/dashed motion
  clusters enter with a `Stagger` (~30ms apart), one cluster per validated operation — the step-tracker
  rhythm made spatial. This is the signature moment: the canvas assembles *in step with real validation*,
  never ahead of it, never on invented timings.
- **Gate hold / release stillness.** The gate is sacred — **still, not animated.** Fast and fluid right up
  to it, then the gate node and its inspector are calm and specific. A held gate does not pulse, breathe, or
  draw attention with motion; its amber and its shape carry the state. Release is a quiet settle, not a
  celebration.

High-frequency actions get no animation: pan, zoom, drag, selection cycling, and anything keyboard-frequent
(the tab/arrow node traversal of Package 7) are instant. Animation is spent only on the rare, causal moments
above.

**Acceptance:** with `prefers-reduced-motion: reduce`, every surface renders instantly (final state, no
transition) and remains fully legible and operable; no animation fires on pan/zoom/drag/selection or any
keyboard-frequent action; the propose moment reads in a silent sub-30s clip (ask visible → clusters
materialize in validation step → gates visible, still), proving causality without a word of narration. The
`design-motion-principles` audit passes its frequency-gate and duration checks.

## Package 7 — Accessibility hard pass (ship gate)

A canvas product is only shippable if a keyboard can drive it. This is a gate, not a nicety: the whole
Orbital Atlas journey — picker → briefing → orbit → unfold → dive → gate inspector → wall → settings — must
be operable without a pointer. Desktop only (the build's standing stance); this package is about keyboard,
focus, contrast, and non-color signal, not viewport size.

- **Keyboard navigation across chrome then canvas.** A predictable tab/focus order: chrome (altitude
  switcher, composer, wall band, panels) first, then canvas nodes in a stable reading order. Within the
  canvas, arrow-key or tab traversal moves focus node to node deterministically (the same order the orbit
  projects, not DOM-accidental). React Flow's node focus is wired, not left default.
- **Enter unfolds/dives, Escape folds/returns.** On a focused bet node, Enter unfolds its chain (and a
  second affordance dives); Escape folds or returns up an altitude — the keyboard twin of the Package 6
  transitions. The altitude switcher is itself keyboard-operable.
- **The gate inspector is fully keyboard-operable.** Open, read every detail, move to Review / Hold, and
  close (Escape) with the keyboard alone. Focus moves into the inspector on open and returns to the gate
  node on close (focus trap + restore). This is the highest-stakes surface — no pointer-only action anywhere
  in it.
- **Visible focus on every node and control.** A clear, AA-contrast focus ring on every focusable node,
  button, and the composer — spruce or an equivalent that reads on the warm stone ground, never the browser
  default outline suppressed with nothing in its place.
- **Icon-only controls are named.** Every icon-only button (fold, dive, wall band chevron, inspector close,
  altitude switcher) has an accessible name (`aria-label` or visually-hidden text). The machinery glyph's
  `aria-label` count summary (already present) is the pattern.
- **Contrast AA on the warm ground.** All text and meaningful UI meet WCAG AA against `#e9e6e0`/`#f4f2ee`;
  the amber gate, spruce accent, and proven-green each verified against their real backgrounds. Fix tokens
  in `design-system/styles.css`, not per-component.
- **Color is never the sole signal.** The amber gate also reads by **shape and label** (the ringed pip, the
  "At the wall" text, the Shield icon), so a founder who cannot distinguish amber still reads the gate. Every
  state the atlas encodes in color (done/gate/queued pips, proposed-vs-real) carries a redundant shape,
  label, or icon.

**Acceptance:** the full journey — picker through gate inspector and back — is driveable by keyboard alone,
demonstrated end to end. An automated axe pass (via the existing `test:firm:browser` harness, or a dedicated
axe check) reports zero critical violations on Orbit, Dive, the gate inspector, and the propose surface; the
named manual checks (focus order, Enter/Escape, focus trap+restore in the inspector, visible focus ring,
icon-button names, AA contrast, non-color gate signal) each pass and are recorded. Any keyboard dead end is
a stop-ship.

## Package 8 — Completion protocol

The surface is done when it survives an independent judgment, not the builder's own.

1. **Independent re-score, fresh context.** Spawn fresh-context critics (no memory of building this) and
   re-score the live app against the rubrics already fixed in the "Verification protocol" section above —
   IA /100 and Flow /100 with their exact criteria and penalties, scored adversarially from 1920×1080
   screenshots of `npm start`, surface by surface. **The gate is ≥80/80 on both, and a builder's own
   self-score does not count** — only an independent re-score clears it. A survivor below the band is a
   FIX, not a ship.
2. **The four vetoes and the five brain gaps re-checked.** The original four audit vetoes (header
   contradiction, dual naming, dead ends, action-without-consequence) and the five honest-gap fallbacks
   (now closed by `orbital-atlas-brain.md`) are each re-verified against the live app; any survivor is a
   stop-ship.
3. **The silent sub-30s clip is the final proof.** A single unedited screen recording under 30 seconds of
   the propose moment: a plain-words ask visible → the system assembles on the canvas in validation step
   (Package 6's staggered clusters, Package B4's real events) → every outward node gated amber and still.
   It must read without narration, sound, or captions — if the causality isn't legible in the silent clip,
   the moment isn't done.
