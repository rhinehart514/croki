# ADE Hybrid Routing — direction decision (2026-07-16)

Founder-selected navigation architecture for the Drover ADE. Supersedes the flat radial "effort cloud"
that projected every semantic role (product loop, system, motion, campaign, outcome) into one
undifferentiated field. Decision reached by building both candidate worlds as a clickable prototype on
real Buffalo data and letting the founder feel them.

Prototype (source of visual + interaction truth for the build):
`scratchpad/drover-routing.html` → artifact `c4b58bd8-22d0-4fb4-b3a6-e37ba8fe1879`. Built in Drover's
own token system (`ui/src/index.css`), so it is a faithful preview, not a separate identity.

## The decision

**Hybrid.** Two altitudes of one product: *route to operate, orbit to understand.*

- **Routed Workspaces** is the everyday operating IA. A workspace spine routes the stage to a
  purpose-built view per GTM dimension. This is what answers "where does everything stand" fast, and
  it gives the founder's core principle — *push new things consistently* — a literal home.
- **Deep Orbit** is the "Atlas" home: one dense, interconnected living world you drop into to
  understand how the venture actually hangs together and to trace relationships. Founder bar, stated
  explicitly: the orbit only earns its place if it *feels deep and complex* — a real web, not a thin
  decorative radial. Proven in v2 of the prototype.

Both share the ADE frame: docked conversation/console rail (left), the swapping stage (center), one
content-swapping inspector (right). Chat stays the easy handle that drives the canvas.

## Routed Workspaces — the spine

Tabs, each routing the stage to a distinct purpose-built view:

- **Atlas** — the whole-picture home. Hosts the Deep Orbit world (below). Entry point.
- **Systems** — durable reusable machinery (read-only project brief, matched-cohort matching, vouch
  loop). Each shows what it powers. The thing that outlasts any campaign.
- **Motions** — the repeatable ways to reach people: strategic approaches (A–D) as framing, live
  channels (Warm list, Incubators, Recent-grad cohort) as routes with a mini funnel + health.
- **Campaigns** — a pipeline board (Sourcing → Contacted → Replied → Live → Returned) with each live
  push as a card carrying progress; a visible push-cadence ("3 pushes this week · 1 queued"); a
  "push a new campaign" affordance. **This is where new things ship.** The held department-champion
  outward act renders here, flagged amber ("needs you"), never auto-sent.
- **Product** — product state, first-class and currently absent from production: what the product is,
  Shipped / In flight / Next push columns, a ship-rhythm strip. Ties the GTM loop to the thing being
  built.
- **Returned** — what the market said back: outcome cards with the real quote, joined-by-provider-
  identity honesty line, causality explicitly not claimed.

## Deep Orbit — the living world (the "Atlas" tab)

A single interconnected value-web, not a filtered node set:

- **Core**: the venture's reason (serif voice), a breathing green core.
- **Layered tiers** encode hierarchy (= depth): systems as full nodes (inner), channels as full
  drillable nodes (mid), strategic approaches as faint framing chips (outer), campaigns as compact
  chips riding their parent motion/approach, the returned signal as an outer satellite joined by a
  dashed line, crew as tiny presence dots near their work, and the product loop (real work → project
  drop → brief viewed → activation) as inner micro-pills threaded through the center.
- **Traceable edges**: system→motion (powers), motion→campaign (rides), campaign→return (joined,
  dashed), crew→work (dotted). The web is the point — you can follow how anything connects to anything.
- **Lens = focus, not filter**: selecting Systems / Motions / Campaigns / Product / Returned pulls that
  layer (and its edges) forward and dims the rest to ~0.34. The whole world stays present; depth is
  never hidden. Default lens is "Whole world."
- **Altitude = depth-as-travel**: double-click a motion → camera pushes in (scale+fade) to that
  motion's campaigns → double-click a campaign → its pipeline (reached → replied → live → returned) +
  the exact returned quote. Breadcrumb (Buffalo › Warm list › first 10 drops) + Esc to rise.
  Reduced-motion removes the camera travel, keeps the state change.
- **Base strip** (docked): product state + push cadence + "Ship next push", always visible.

## Invariants carried from doctrine

- Founder language only; the six-noun contract holds (venture · conversation · effort · teammate ·
  capability · record). Systems/motions/pipeline/campaign are made *visible and legible*, never
  ontology the founder must administer.
- Placement is presentation only; the projection still composes durable architecture + existing
  execution truth (bets/work/wall/outcomes). No second execution store.
- Every world-touching act waits for the founder's hand. Held acts render in-place, flagged, never
  auto-sent. Amber is needs-you only, never decorative.
- Desktop-only. 1920×1080 is ship-evidence; the layout re-fits around docked chrome at any desktop
  viewport.

## Cursor-tier standards (Mobbin-grounded, 2026-07-16)

Founder bar: compete with Cursor on UX; be a top SF design engineer, not analogy-driven. References
pulled from Mobbin and folded into the prototype:

- **⌘K command palette is table stakes.** Keyboard-first jump to any workspace, node, campaign, motion,
  system, action, or venture, grouped by section, with a scope chip, keyboard-hint footer (↑↓ navigate ·
  ↵ open · esc close · N results) and per-item shortcut hints. This *is* the "10/10 routing." Opens on
  ⌘K / `/` / the top-bar trigger. Refs: [Linear](https://mobbin.com/screens/8a6d227b-63e6-483c-925f-d256d0989a10),
  [Vapi](https://mobbin.com/screens/593d7acd-2e16-4365-bcd6-02ce52f48f3b),
  [Clay](https://mobbin.com/screens/9112b54f-92d1-4a46-a48f-6f1150b4c03f).
- **Quiet bottom-floating canvas toolbar** on the orbit: rise-an-altitude, recenter/fit, current-altitude
  label, jump. Refs: [StackAI](https://mobbin.com/screens/670596bd-6812-46f4-8336-aeeba79e2a69),
  [OpenAI Platform](https://mobbin.com/screens/36df35a8-eb28-4c80-98aa-bc38b3c8504b),
  [Runway](https://mobbin.com/screens/16aa61e3-22ee-4ce3-be85-054705981f11).
- **Substantial docked inspector** with real sections + a primary action (not a thin card). The agent-
  builder inspectors (StackAI, OpenAI, Langdock, Clay) are the bar.
- **Keyboard affordances everywhere**, dense mono/tabular meta, status dots, calm neutral ground with a
  single green accent; semantic status color kept separate from the accent. Restraint over flourish.
- **Top-right carries the primary consequential action** (Ship next push / Review decisions), matching
  the Run/Publish/Deploy convention of every agent-builder shell.

Applied in prototype v3 (`scratchpad/drover-routing.html`): ⌘K palette, top-bar jump trigger, orbit
canvas toolbar, keyboard bindings. Still to elevate: inspector depth, board drag/interaction, orbit
camera-push feel.

## Ownership frame — the experience is a system, not screens (founder-directed 2026-07-16)

Own the product EXPERIENCE, not the interface. All design work is governed by six layers, in order of
authority — a lower layer may never violate a higher one:

1. **User goals** (the North). For the solo founder who vibe-codes: (a) see the whole venture at a
   glance, product vision → distribution; (b) push new things consistently — one intent per campaign /
   artifact / product change; (c) explore & choose GTM + product approaches with confidence; (d) run
   many things in parallel without losing control; (e) decide only what touches the world, trust the
   rest; (f) learn from the market and let it shape what's next; (g) use own Claude Code + Codex subs,
   no cage; (h) return after time away to a clear account, not a mess.
2. **Experience architecture** — one coherent shape (chosen, not a menu). Candidate theses under
   evaluation: canvas-is-the-product · generative-ideation-machine · intent-driven-agentic-OS.
3. **Information architecture** — objects and movement among them: the vision→distribution spine
   (semantic zoom), approaches, campaigns, agents-and-roles, the wall, returned evidence. Founder
   language only; never internal nouns.
4. **Interaction design** — the loop (intent → materialize → steer → approve → return) and its
   gestures: type intent, descend for detail, branch/ideate from any node, release/hold. Keyboard-first.
5. **Feedback & edge cases** — the hard states, enumerated, not skipped: agent streaming vs. done,
   provisional vs. durable, held-at-wall, away-state, offline/stale, budget exhausted, conflicting/zero
   outcomes, dense scale, provider failure, every empty state.
6. **Long-term coherence** — invariants that never break as it scales across ventures / transfer /
   functions: founder language, the wall, no host-composed DAG, one-venture-is-one-file,
   open-architecture-never-a-cage. FIRM-SPEC's four scale axes and five fatal modes are the guardrails.

Deliverable is ONE Product-Experience System spanning all six layers, synthesized from the three
experience-architecture ideations — not another screen.

## Unified surface architecture — ONE canvas, altitudes by zoom (2026-07-16)

The surfaces are NOT separate widgets. They are one React Flow canvas (already in the repo:
`@xyflow/react` 12.11, `d3-force`, and the pure `atlasLayoutEngine.ts` "layout → fold onto Flow nodes"
seam) shown at three altitudes via semantic-zoom level-of-detail. Zoom in = descend = more complexity —
the founder's exact ask. The relationship "Map" and the top-down "Outlook" are the SAME graph under two
layout functions (radial vs `d3-hierarchy` tree); add the tree as a second layout MODE in the existing
engine, not a new renderer.

**The altitude ladder (LOD tiers, depth-gated by zoom):**
1. **Venture Outlook** (top): top-down hierarchy — venture → pillars → motions → campaigns. "Understand
   my venture top-down." Simple at the top.
2. **Agent Workspace** (descend into a campaign/effort): the execution graph — live streamed agent steps,
   experiments (A/B/C), tool calls, artifacts-in-progress. "How my agents work." Steal LangGraph Studio
   (stream steps onto the graph + state inspection + edit-and-resume), Cursor (parallel attempts →
   compare → promote), Vellum/Braintrust (variant score columns + run-diff), Dify (per-node cost).
3. **Artifacts & experiments** (leaf): the real outputs — landing-page preview nodes, variant results.
   React Flow nodes are DOM, so previews render inline (`<img>`, tables, sandboxed `<iframe>`), wrapped
   in `NodeResizer`/`NodeToolbar`.

**Depth = complexity mechanic:** read zoom from React Flow store; quantize into tiers with hysteresis
(steal Figma/tldraw stability); depth-gate by setting `hidden` on nodes deeper than the zoom-derived
visible depth. At full zoom-out, render a near-empty `dot` tier (avoids the cull-bypass freeze).

**The two persistent ADE handles that bind it:**
- **Chat = the spatial handle** (the divergence worth taking): the console drives the canvas, and agent
  activity + artifacts render as NODES on the canvas, bidirectionally focused with the thread — not a
  linear side pane. Cursor/Claude/Devin stay linear; Drover's console is spatial. Build with Vercel AI
  SDK 6 (client tool-parts, `needsApproval`) + vendored shadcn-ai/AI Elements; assistant-ui runtime for
  branching. NOT RSC generative UI (paused + CVE-2025-55182) — use a typed component allowlist.
- **The Wall = the review gate**: world-touching acts render as an inline approval (`needsApproval`) — a
  diff you Release/Hold. This is the ADE-native review gate.

**Cross-cutting:** ideate from any node at any altitude — click → provisional (dashed) children until the
founder commits (matches the "visibly provisional first theory" doctrine).

Substrate decisions (repo-verified by the component-research agent): keep React Flow everywhere (MIT,
DOM, already load-bearing). tldraw disqualified (mandatory watermark license); litegraph archived; Thesys
C1/RSC-genUI out. Full report in the run notes.

## Main-surfaces decision (founder-delegated, 2026-07-16)

Founder put the IA call to the design lead: the relationship map is NOT the main surface. Committed IA:

**Persistent ADE frame:** Console (left, chat + intents — drive) · Wall (right, appears on a decision —
the review/diff gate, decide). Grounded in what an ADE is today (Cursor/Graphite/Replit/GitHub): chat
drives, the artifact is the stage, a diff/review gate holds world-touching acts, agent activity is
legible inline, clean/flat/keyboard-first.

**The Stage — ONE main surface, two altitudes:**
- **The Venture (home, default):** the GTM *right now*, work organized by **state** — Needs you · Live ·
  Building · Returned — with product state as a quiet band on top. Where the founder lives; where "push
  new things" happens. An operating picture, not a floating web.
- **Inside a push:** double-click a card → the stage flies into that one piece of work (its pipeline,
  staged acts awaiting the hand, what returned).

**The relationship map is demoted to a lens** ("show me how it connects"), lifted on demand — never the
home. Systems/motions/campaigns/product are facets you focus, not tabs.

**Open-ended work visualization (do NOT hard-scope node types).** The cards on the stage are polymorphic:
the work's `kind` decides its treatment, and the set is open. Built examples: an **artifact** renders a
real beautiful preview (a landing page the agent built); an **A/B/C test** renders live variants with a
leader; a **campaign** shows progress; an **outcome** shows the returned quote. New kinds of agent work
(microproducts, content, calculators, creative) get fitting treatments without a schema migration —
"internal distinctions become durable only when they must change execution."

Three magical moments carry it: intent → materializes work · fly into a push · lift into the map.

## The graph IS the real projection (the leverage, 2026-07-16)

The Atlas node graph is not decorative and must not be faked. It is a direct visualization of
`ui/src/components/atlas/atlasSemanticProjection.ts` → `projectAtlasSemanticLayer(projection, lens)`,
which already emits typed nodes + labeled causal edges from the real architecture+execution model:

- **Nodes = real roles**: concept · product-loop · system · motion · campaign · work · outcome · group.
- **Edges = real labeled joins** (this is why the graph is informative, not pretty): `powers`
  (system→motion), `shapes` (product→motion), `runs through` (motion→campaign), `governs`
  (campaign→bet), `prepared` (bet→work), `held for you` (work→wall), `returned through receipt`
  (work→outcome), `joined to direction` (bet→outcome), plus asserted/tentative architecture
  connections.
- **Real per-node state** the UI leverages instead of inventing: `active` (live accent/pulse),
  `atWall` + `held-release` pressure (needs-you amber), `role` (node tier/register), `teammates`.

**Placement is engine-owned.** The projection sets every position to `PLACEHOLDER`;
`ui/src/lib/atlasLayoutEngine.ts` computes collision-free placement downstream — "the projection
decides what exists; the engine decides where." The prototype's hand-placed coordinates are a stand-in;
production placement comes from the engine. The buildable UI layer that rides on top of projection +
engine: hover-to-focus neighborhood, lens-as-filter (not a second data source), role-based tiers,
live/working/at-wall visual states, altitude drill, the intent driver, and ⌘K routing.

The strong-point thesis: the founder sees the *real causal structure* of their GTM — this system
powers that motion, which runs this campaign, which returned this evidence, now held at the wall —
which no dashboard or list can show. Dense and alive so it feels like commanding a real machine;
hover-focus + a simple intent model keep it legible.

## Build sequencing (proposed)

1. **Shell + routing** — introduce the workspace spine + route state (extend the existing state-based
   nav; no URL router needed) with the inspector and console rail intact. Atlas route renders today's
   canvas as a fallback.
2. **Campaigns + Product** — the two highest-value net-new operating surfaces (pipeline board +
   ship-state). These close the biggest gaps (no shipping home, no product state).
3. **Systems / Motions / Returned** — project the existing architecture roles into their
   purpose-built views.
4. **Deep Orbit Atlas** — rebuild the Atlas altitude as the interconnected web with lens-focus and
   depth-as-travel drill, replacing the flat radial projection.
5. **Motion + polish pass** — camera-push feel, reduced-motion, responsive re-fit, a11y/keyboard,
   design-critic gate at 1920×1080.

Verification each phase: `npm test` + UI unit + a real render screenshot judged against this spec and
the prototype. Work on branch `ade`; nothing outbound.
