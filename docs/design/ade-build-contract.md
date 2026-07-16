# Drover ADE — Engineering Build Contract

**Status:** build contract of record for the ADE transformation. **Authored:** 2026-07-15.
**Audience:** frontier coding agents (Opus) executing overnight without a human present.
**Direction of record:** [`ux-divergence-2026.html`](ux-divergence-2026.html) (authoritative UX + full founder decision log).
**Spec of record:** [`../FIRM-SPEC.md`](../FIRM-SPEC.md). **Current truth:** [`../STATE.md`](../STATE.md).
**Grounded against:** the repository at commit `850c52a`, audited file-by-file 2026-07-15.

This document is the contract, not a tutorial. It states durable intent, the target architecture, exact
file-level landing spots, invariants that must hold at every phase boundary, ordered shippable phases, and
the exact verification commands. Where the audit contradicts the direction's assumptions, the audit wins and
the correction is stated inline. Read the direction and the spec first; this contract assumes both.

---

## 0. Durable intent (why this exists)

Drover's canvas renders a living venture as a spatial world, but today it floats without a frame: panels
overlap, hand-placed nodes collide, internal nouns leak into founder copy, and nothing re-composes for the
viewport. The transformation makes Drover an **Agent Development Environment**: a docked shell (conversation
rail / canvas stage / one swapping inspector) around the canvas as center stage, an engine that owns
collision-free layout, full run transparency, chat-first steering, and ordinary founder language throughout.
The success bar the founder named is **"I can see everything"** — total situational awareness of the firm at
a glance. Every choice is measured against legibility.

Two hard constraints govern all of it (FIRM-SPEC, AGENTS.md, direction §1):

- **Desktop only.** Judge and build at desktop resolutions (1280–3840 wide). No mobile layout, ever. The
  canvas must adapt across desktop resolutions; the old "design only for 1920×1080" rule is retired.
- **Founder language is ordinary language.** The six nouns (below) and concrete business words only. Internal
  identifiers (`bet`, `motion`, `fork`, `outcome`, `stage`, `staged-`, `gtm-ide`, `~/.gtm-ide`, `DRIFTING`)
  survive in storage, routes, tests, and env as **compatibility seams** — never in founder-facing copy.

### The six nouns (settled 2026-07-15 — no seventh)

`venture` · `conversation` · `effort` · `teammate` · `capability` · `record`. Drafts are part of an
**effort** (not a separate concept); trust is remembered inside a **conversation** (not a grant object). Any
component name or copy implying a seventh concept is reconciled to these six.

---

## 1. Audit result — what exists, what transforms, what is new

Audited live and in source 2026-07-15. The direction's §2/§6 assumptions are mostly correct; four are
**wrong or stale** and are corrected here. Build against this table, not against the direction's prose where
they disagree.

### 1a. Corrections to the direction (the audit overrides these)

1. **The Electron shell already exists and works.** `electron/main.cjs`, `electron/preload.cjs`,
   `electron-builder.yml`, and root scripts `app` / `app:dist` are present. `main.cjs` boots the brain as a
   utility process on a free loopback port, health-gates the window on `/api/health`, signs a per-request
   founder capability below the renderer, and handles single-instance + external-link routing. **The Electron
   phase is hardening (window-state restore, browser demotion, honest lifecycle), not a green-field build.**
2. **There is no event stream.** The "live work" surface today is a **900ms poll** of the lens + wall queue
   (`useFirmLensProjection.ts:119`) plus a 15s presence heartbeat (`FirmApp.tsx:73`). No SSE, no WebSocket in
   the brain. `ws` is a root devDependency used only by the browser-test harness. Streaming while present is a
   **new server-push seam to build**, not one to wire up.
3. **Mid-flight steering does not exist as a message channel.** A drive is one atomic call —
   `driveTeammate()` → `adapter.drive(ctx)` with a `signal` and `isCancelled()` (`work-loop.mjs`,
   `active-drives.mjs`). The only live control is **abort** (`abortActiveDrive`, wired to `stopActiveDrive`).
   "Steer mid-flight by saying so in the conversation" requires a **new re-brief-at-checkpoint seam**; true
   token-level interruption is out of scope. State this honestly in the UI (§4, Phase 5).
4. **The founder-language guard already exists.** `ui/src/components/atlas/founderLanguage.test.ts` is a
   TypeScript-AST scan of production surfaces under `ui/src` against a forbidden-noun regex, excluding code
   identifiers and unrendered internal tokens. The language phase **extends its coverage and fixes the copy it
   flags** — it does not invent the guard.

### 1b. Component disposition

| Subsystem / file | Disposition | Lands as |
|---|---|---|
| `ui/src/FirmApp.tsx` (render root: header + resizable conversation + canvas) | **Transform** | The ADE shell grid host (rail / stage / inspector). Its localStorage width/open logic and presence heartbeat survive; the flex layout becomes a CSS grid. |
| `ui/src/components/atlas/AtlasCanvas.tsx` (`fitView={false}`, hand-driven) | **Transform** | The center-stage canvas. Turn on stage-aware `fitView`; remove drag-to-place for founder nodes (placement is engine-owned). |
| `ui/src/components/atlas/VentureAtlas.tsx` (21 KB orchestrator) | **Transform** | Stage orchestrator inside the grid. Its projection/camera/selection wiring survives; panel-spawning (`AtlasShelf`, floating controls, `ArchitectureProposalSurface`) moves into the inspector or is removed. |
| `ui/src/components/atlas/atlasLayout.ts` (hard-coded `COLUMNS`, `OTHER_MOTION_Y`) | **Retire** | Replaced by the layout engine (§2, Phase 1). Delete after the engine is proven. |
| `ui/src/components/atlas/atlasOrbitLayout.ts` (polar collision solver, `ORBIT_RADII` keyed on `drifting`) | **Retire** | Replaced by the layout engine. Also removes the `drifting` decision-band vocabulary from a layout input. |
| `ui/src/components/atlas/AtlasProjection.ts` + `atlasSemanticProjection.ts` + `AtlasProjection.test.ts` | **Keep, re-point** | Feeds the graph to the layout engine instead of to fixed columns. Projection logic (what nodes/edges exist) is unchanged; only positioning moves out. |
| `ui/src/components/atlas/atlasTypes.ts` (`AtlasAltitude = venture\|architecture\|detail`, `focusRole`) | **Keep, elevate** | The three altitudes and focus roles already exist; §3 renders and animates on top of them. Rename `AtlasDecisionBand` member `drifting` to a neutral internal token or drop it with the orbit layout. |
| `ui/src/components/atlas/useAtlasCamera.ts` (17 KB camera/fit/focus) | **Keep, extend** | Extend fit bounds to the stage cell inset (§2); add altitude-snap travel (§3). |
| `ui/src/components/atlas/AtlasOrbitField.tsx` (renders literal `Drifting` badge) | **Retire/rewrite** | Orbit field dies with the orbit layout; any surviving badge copy goes through the six-noun language pass. |
| `ui/src/components/atlas/dive/**` (near-detail bet surface) | **Keep, re-point** | Becomes the Focus altitude and/or inspector detail. Do not delete its content; re-home it. |
| `ui/src/components/firm/TeammateRail.tsx` (10 KB — crew + conversation + return brief) | **Transform → split** | Its conversation half becomes the rail's content; crew/return-brief move onto the stage/inspector. Over the 300-LOC ceiling already; split by responsibility. |
| `ui/src/components/firm/ConversationFeed.tsx` + `conversationProjection.ts` + `GoalComposer.tsx` | **Keep, re-home** | The conversation rail's body and docked composer. |
| `ui/src/components/firm/VenturePicker.tsx` + `.test.tsx` | **Retire** | Replaced by entry-into-last-venture + ⌘O overlay (Phase 4). Keep the venture-list API it calls. |
| `ui/src/components/firm/FirmSettings.tsx` (modal) | **Keep** | Stays a modal/overlay; not part of the docked grid. |
| `ui/src/components/lens/**` (Workyard, `BetTerritory`, `WallReviewDetail`, `CrewNode`, `CapabilityNode`) | **Keep, re-point** | Inspector content (wall payload, effort detail, teammate current work) and node archetypes. `CrewFace`/`CrewAvatar` are the only teammate portrait door — preserve. |
| `ui/src/components/crew/CrewFace.tsx`, `CrewAvatar.tsx` | **Keep** | Teammate faces, pushed further (direction §4). |
| `ui/src/components/atlas/founderLanguage.test.ts` | **Keep, extend** | The language guard. Extend to cover new surfaces and `staged-`/`DRIFTING` (Phase 2). |
| `ui/src/components/atlas/*.tsx` node types (`ArchitectureElement`, `AtlasBetNode`, `AtlasIntentNode`) | **Transform** | Become the five node archetypes: teammate, effort, capability, gate, question hub (direction §4). |
| **New** | | `ui/src/lib/atlasLayoutEngine.ts` (layout engine adapter, §2); the ADE grid CSS; the SSE client hook (§ streaming); the ⌘O switcher overlay. |
| `brain/src/server.mjs` | **Extend** | Add the SSE endpoint (streaming) and — if adopted — a steer-checkpoint route. Route-group dispatch pattern is preserved. |
| `brain/src/firm/work-loop.mjs` (515 LOC, known-debt, over ceiling) | **Extend carefully** | The steering checkpoint hook lands here. It is already 15 LOC over the service ceiling (STATE.md debt); prefer a new sibling module (`work-loop-steer.mjs`) over growing it. |
| `brain/src/firm/active-drives.mjs` | **Extend** | Add a per-drive pending-steer queue alongside the `AbortController` (§ steering). |
| `electron/main.cjs`, `electron/preload.cjs`, `electron-builder.yml` | **Keep, harden** | Window-state restore; browser demotion (Phase: Electron). |

---

## 2. Target architecture

### 2.1 The ADE shell (docked grid)

A single CSS Grid on the render root (`FirmApp.tsx`) with three columns and no floating panels over the
canvas:

```
┌──────────┬───────────────────────────────┬───────────┐
│  RAIL    │   STAGE (canvas, ~85% at rest) │ INSPECTOR │
│  (conv)  │   ┌─────────────────────────┐  │ (one      │
│          │   │   VentureAtlas          │  │  swapping │
│          │   └─────────────────────────┘  │  panel)   │
│          │   [ composer docked to stage ] │           │
└──────────┴───────────────────────────────┴───────────┘
```

- **Grid, not flex, not overlay.** `grid-template-columns` with named tracks; the rail and inspector are grid
  cells, never `position: absolute` over the stage. This is the structural fix for audit findings 5–7 (panels
  stacking/bleeding): a panel that has a cell cannot overlap the canvas.
- **Stage-maximal by default** (decided). Rail collapses to an icon strip; stage holds ~85%. Track widths
  respond to viewport width via container queries (Tailwind 4 + native container queries; no new dependency).
- **Rail = the one conversation** (not a thread list). Splits only when volume genuinely hurts (density
  correction). No venture/crew/gate lists in the rail — venture switching is ⌘O, one venture per session.
- **Inspector = one panel that swaps content on selection** (effort detail / drafts / a teammate's current
  work / artifact / record). It never stacks a second overlay. Closing it gives the stage full width. This
  replaces every current floating right-side panel.
- **No separate activity console.** Agent activity and artifacts render inline in the conversation
  (decided — the dock was killed). `EventFeed.tsx` content moves inline into `ConversationFeed`.
- **Composer docked to the stage**, not floating over nodes. `GoalComposer` re-homes to the stage's bottom
  edge as a grid row.

**Acceptance (Phase 1):** at 1280 / 1440 / 1920 / 2560 wide, in every shell configuration (rail
expanded/collapsed, inspector open/closed), no panel overlaps the canvas and no two nodes overlap. Toggling a
region re-fits the atlas to its new stage cell within 300 ms.

### 2.2 Layout engine (collision-free, engine-owned)

Replace `atlasLayout.ts` and `atlasOrbitLayout.ts` with an engine that computes positions so cards physically
cannot overlap, and re-fits to the stage cell.

- **New module** `ui/src/lib/atlasLayoutEngine.ts`: takes the projection (nodes + edges from
  `AtlasProjection.ts`) and the stage-cell dimensions, returns a `Map<id, XYPosition>`. `AtlasProjection.ts`
  keeps deciding *what* nodes exist; the engine decides *where*.
- **Engine choice is a Phase-1 spike, not a paper decision.** Evaluate **elkjs** (deterministic layered
  layout, reads as a left-to-right atlas — matches the current column intent) against **d3-force** (organic
  constellation, suits Horizon clustering) on the *real* Drover projection. Likely answer: elkjs for
  Working/Focus structure, a force pass for Horizon clustering. `@xyflow/react` 12.11.0 is already installed
  and stays; the engine feeds it positions. Add exactly one dependency (`elkjs` and/or `d3-force`).
- **Placement is fully automatic — the founder never drags** (decided). Remove drag-to-place for founder
  nodes: in `AtlasCanvas.tsx` drop `onNodeDragStop`/`savePosition` for archetype nodes, and stop persisting
  founder coordinates. This removes hand-arranged collisions at the source. (Keep the drop-from-shelf path
  only if the shelf survives Phase 1; otherwise remove it too.)
- **Stage-aware fit.** Turn `fitView` on (currently `AtlasCanvas.tsx:106` `fitView={false}`). Fit bounds =
  stage cell − padding, **recomputed on every rail collapse, inspector open, and window resize**. Extend
  `useAtlasCamera.ts` to derive the inset from the live grid cell, not the window.
- **Incremental layout under live updates.** The graph changes as work returns. Re-solve only the changed
  neighborhood; let finished efforts sink to a faded background layer (decided) to keep the live set small.
  Animate position changes with Motion 12 (installed) so cards **glide, never teleport**.

**Acceptance (Phase 1):** `no two nodes overlap at any viewport 1280–3840 wide`; a single new effort appearing
adjusts only its neighborhood while the rest of the atlas holds still; canvas re-fits within 300 ms of any
panel toggle.

### 2.3 The six-noun data model over existing storage

The nouns are a **presentation contract**, not a new store. Map them onto what exists — do not add a parallel
authority (FIRM-SPEC anti-cage guard: one venture store, one architecture document).

| Noun | Backed by (existing) | Notes |
|---|---|---|
| **venture** | venture manifest + venture store (`brain/src/firm/venture-store.mjs`), files under `~/.gtm-ide` | Storage path identifier `~/.gtm-ide` is a **seam** — do not rename. |
| **conversation** | durable venture conversation (`conversation.mjs`), `ConversationFeed` | "Trust = remembered dialogue" lives here; no trust-grant object. |
| **effort** | `bet` in code (`bet.mjs`, `FirmBet`); drafts = its staged artifacts | Founder copy says "effort"; storage/routes/tests keep `bet`. Drafts are the effort's `staged[]`, not a new record. |
| **teammate** | configured participant + soul (`teammate-soul.mjs`, `crew.mjs`), `CrewFace` | Faces preserved; click opens their **current work** in the inspector (no profile surface). |
| **capability** | host-backed reach (product repo, Gmail OAuth) via `capability-registry.mjs`, `connectors/`, `canvasCapabilities.ts` | Real ports for outbound acts and returning evidence. |
| **record** | durable receipts/events: wall receipts, outcomes, work-loop receipts (`work-loop-receipts.mjs`), event feed | Any artifact/event links down to its complete run record. |

Local readable files stay the persistence model (FIRM-SPEC rail 8): no database, no cloud, one local store per
venture. The `~/.gtm-ide` location evolves in place; do not migrate the path in this transformation.

### 2.4 Event stream for live work (NEW — server push)

Today: 900 ms poll. Target: **the founder sees work stream while present** without a poll storm.

- **Add an SSE endpoint** to `brain/src/server.mjs` (e.g. `GET /api/firm/:ventureId/events`,
  `Content-Type: text/event-stream`). SSE over WebSocket: the flow is server→client, loopback-only, and SSE
  needs no new dependency and no upgrade handshake. Emit on: drive begin/beat/finish (already observable via
  `active-drives.mjs` `noteDriveBeat`), staged-artifact append, wall-item change, outcome join, conversation
  append.
- **Client hook** replaces the 900 ms interval in `useFirmLensProjection.ts` with an `EventSource`
  subscription that invalidates/refreshes the lens on relevant events. **Keep the poll as a fallback** for the
  browser dev harness and for reconnect gaps — do not delete it; gate it behind "no live stream".
- **Presence heartbeat stays** (`FirmApp.tsx:73`, `markFounderPresent`/`markFounderAway`) — it is the away
  lease the wall depends on, unrelated to the stream.
- **Work runs only while the app is open** (decided, honest scope). The stream is a while-present convenience;
  "since you left" means "since your last session." Do not build a background service or cloud runner.

### 2.5 Run-record persistence and linking

Every artifact and event must link down to its complete **record** (full run transparency). The pieces exist:
`work-loop-receipts.mjs` stamps receipts; outcomes are durable first-class records; wall items carry
originating-work lineage; firm-definition revision travels end to end (STATE.md). **Wire the inspector's
record view** to these: selecting an artifact/event opens its receipt chain in the inspector. Do not create a
new run-store; project from the existing receipts/events/outcomes.

### 2.6 Capability ports

Audited present: the bound **product repository** (built-in crew source, read via `truth.mjs`/`scan.mjs`) and
**Gmail OAuth** send/reply (`connectors/`, surfaced in `FirmSettings`, honest unavailable state when not
connected). `capability-registry.mjs` is the registry; `canvasCapabilities.ts` projects them to the canvas.
Capability nodes render these as warm instruments (direction §4). **Do not add new external connectors in this
transformation** — model the two real ones honestly and keep unavailable ones visibly unavailable.

### 2.7 Mid-flight steering seam (NEW — checkpoint re-brief, not interruption)

The honest mechanism, given a drive is one atomic `adapter.drive(ctx)` call:

- **Extend `active-drives.mjs`** with a per-drive `pendingSteer` queue beside the `AbortController`. A rail
  message addressed to a running effort enqueues a steer note.
- **Checkpoint hook in the work loop.** Between resume turns / at tool-boundary checkpoints, the drive drains
  `pendingSteer` and folds it into the next turn's brief. Land this in a **new `work-loop-steer.mjs`**, not by
  growing the 515-LOC `work-loop.mjs` (STATE.md debt: it is already over the service ceiling).
- **Honest UI.** The founder's steer lands at the next checkpoint, not instantly. Surface "will adjust on the
  next step," not a fake real-time interrupt. If the adapter offers no checkpoint seam, the steer applies on
  the next resume; do not claim otherwise.
- **Abort stays** the hard stop (`abortActiveDrive` → `stopActiveDrive`), unchanged. Only the founder ends an
  effort; dialogue in the conversation closes it (direction work loop).

### 2.8 Electron shell (harden existing)

The shell exists and boots. This transformation:

- **Window-state restore** — persist and restore window bounds (and maximized) across launches. Currently
  fixed 1440×900 (`main.cjs:151`).
- **Browser demotion** — the localhost web build survives strictly as a dev/test harness (decided). Remove the
  founder-facing "Desktop host required" degraded chrome and the snapshot dual-state from the UI (the
  `GTM_IDE_DESKTOP` / `GTM_IDE_FOUNDER_CAPABILITY` seams stay; the *founder-facing degraded state* goes). The
  `DROVER_DEV_FOUNDER=1` loopback hatch stays for dev.
- **Honest lifecycle** — brain starts/stops with the app (already wired: utility-process fork + `before-quit`
  kill). Verify clean shutdown; do not regress the health-gate boot.
- **Keep scope honest for one night:** the shell boots, brain starts/stops with the app, window state
  restores. No auto-update, no packaging pipeline changes beyond what exists.

---

## 3. Zoom-responsive rendering (render on the existing type seam)

**Correction (founder machinery check, 2026-07-15):** named Horizon / Working / Focus **modes** and any
altitude switcher are **cut**. There are no modes and no UI control. What survives is **zoom-responsive card
rendering only** — cards simplify as the canvas zooms out and re-detail as it zooms in, on the existing render
seam. Staged materialization stays.

`AtlasAltitude = "venture" | "architecture" | "detail"` and node `focusRole` already exist
(`atlasTypes.ts:13`) and remain the internal render seam. Render on top:

- **Card detail responds to zoom, continuously.** React Flow's `useStore` zoom value (installed) drives how
  much a card renders: at low zoom, title/glyph only; as zoom rises, body and footer appear. No snap
  altitudes, no mode selector, no "you are at Horizon" chrome. This is a rendering function of zoom, not a
  navigable state.
- **Focus still works** — selecting an effort expands it and dims/recedes the rest (the existing `focusRole`
  path); that is selection behavior, not an altitude mode.
- **Kinetic materialization stays** — a composer direction unfolds the theory over ~2–3 s, nodes born in
  sequence while the thread narrates (decided), using React 19 `useTransition` (installed). Not an instant
  snap.
- **Do not build** a switcher, named-altitude labels, or per-altitude viewport defaults. The cut removed them.

---

## 4. Founder-facing language (extend the existing guard)

The guard (`founderLanguage.test.ts`) already fails the build on forbidden nouns in `ui/src` production
surfaces. This phase **fixes the copy it flags and extends coverage** to `staged-…` IDs and `DRIFTING`:

| Where | Leaks today | Reads instead |
|---|---|---|
| Effort badge | `DRIFTING` | Moving without a direction yet |
| Venture summary | `4 bets opened` | 4 efforts started |
| Cluster chip | `7 concrete lines underway` | 7 efforts underway |
| Draft title | `Prepared work staged-2026…` | Draft: first outreach to inspectors |
| Branch action | `Fork this bet` | Try another approach |
| End work | `End bet` | Stop this — we've learned enough |
| Returned evidence | `Outcome · joined` | The market answered |
| Gate, clear | `Wall empty · 0 items` | Nothing needs you yet |
| Gate, pre-approved | `Auto-approved (policy)` | Sending this — you told me I could |

**Titles from content, never IDs.** A draft is titled by what it is; the `staged-…` identifier moves to
metadata under a disclosure. The five node archetypes get anatomy + full state grids per direction §4.

---

## 4A. Product logic — the behaviors the founder decided

The shell, layout, and seams above are the room. These six behaviors are **the product a founder operates**,
not garnish. Each is audited against the brain as it stands today; the contract specs the *delta*, names where
it lives server-side, and keeps model calls only where the work is genuinely fuzzy (classification/drafting) —
routing, joins, and grant checks are deterministic code (per the engineering doctrine: if code can answer,
code answers).

### 4A.1 Direction routing (NEW — net-new server logic)

**Audit.** `driveTeammate()` (`work-loop.mjs:122`) takes `teammateRef` as an **input** — the caller already
chose the teammate. `atlasTeammates.ts` only derives *display* attribution from existing bets. There is **no
server-side decision of which teammate claims a direction**. This is net-new.

**Spec.** A direction entered in the conversation is routed to the right teammate before the drive starts, and
the claim is **visible in the thread with a one-line why**.

- **New module** `brain/src/firm/direction-routing.mjs`: given the founder's direction text + the venture's
  configured crew (`configuration.agents`, each carrying its lens/evaluation language), decide the claiming
  `teammateRef` and a one-line reason. This is a **genuinely fuzzy classification** — it may use the model, but
  bounded: input is the direction + crew descriptors, output is `{ teammateRef, why }`. Default deterministically
  to the configured coordinator when confidence is low or crew is size-1 (no model call needed then).
- **Conversation event.** On claim, append a teammate-authored conversation message ("this is a buyer question
  — mine") via the existing `appendConversationMessage` seam (`work-loop.mjs:196` already appends founder/agent
  messages). The claim line renders inline in the rail before the drive's work begins.
- **Wiring.** The composer's drive call routes through `direction-routing.mjs` to pick `teammateRef`, then
  calls `driveTeammate` unchanged. Routing decides *who*; the loop is untouched.

**Acceptance.** A buyer-flavored direction is claimed by the buyer-lens teammate with a visible one-line why in
the thread; a crew of one skips the model and the coordinator claims directly.

### 4A.2 Review is dialogue (NEW classification + existing seams)

**Audit.** Review today is button-driven at the wall (`decideWallItem`, typed purposes: release / answer /
review-outcome / bet-ending). There is **no interpretation of a free-text founder reply** as steer / approve /
close / new-direction. This composes with the §2.7 steering seam (checkpoint re-brief).

**Spec.** Responding in the thread to a returned draft is dialogue, not buttons.

- **New module** `brain/src/firm/dialogue-act.mjs`: classify a founder conversation message **in the context of
  the effort it replies to** into one intent — `steer` / `approve` / `close` / `new-direction`. This is the one
  honestly-fuzzy call in this behavior; keep it small (message + effort summary → one label + optional extracted
  steer text). Ambiguous → treat as `steer` (safe: it becomes context, nothing is closed).
- **Routing of the act (deterministic):**
  - `steer` → enqueue onto the effort's `pendingSteer` (the §2.7 seam); it reaches the next run as steering
    context. No new mechanism.
  - `close` → end the effort (the founder-only end path; `mutateKilledBet`/bet-ending already exists). The
    effort recedes to the strata layer. **Only the founder ends work** (FIRM-SPEC rail 2) — the classifier
    proposes the intent, the founder's own message is the authority.
  - `approve` on an act waiting at the gate → releases it through the **unchanged** wall path (no new authority).
  - `new-direction` → routes back through §4A.1 direction routing.
- **Lives server-side** in a new sibling module, not in `work-loop.mjs` (over ceiling). The conversation route
  calls `dialogue-act.mjs`, then dispatches to the existing seams.

**Acceptance.** "tighten the opening, it's too salesy" reaches the effort's next run as steering context;
"that's done, close it" ends the effort and it recedes; neither adds a button; an ambiguous reply becomes steer
context and closes nothing.

### 4A.3 Trust as remembered dialogue (NEW — grant store + guard check)

**Audit.** `outward-guard.mjs` **forces the wall on any outward-shaped effect** — whole-tree scan for
email/URL/phone/amount signals, default-deny. There is **no grant check** that lets a pre-approved act type
skip waiting. This is the same seam the direction's "start-gated / earn-trust" item named; here it gets its
storage.

**Spec.** "You can send these yourself now" persists as a grant attached to the **act type**, checked before an
act waits; no policy UI, no caps interface.

- **New venture doc** `grants` (plain readable file per venture, via the existing `venture-store.mjs`
  collection pattern — same as `bets`, `outcomes`, `decisions`). A grant records `{ actType, grantedAt,
  fromMessageId, revoked }`. The six-noun **record** carries grant history; there is no separate policy object.
- **Grant derivation is remembered dialogue, not a toggle.** A grant is created only when the founder's
  conversation message says so (interpreted by §4A.2 as an `approve`-with-standing / explicit "you can do this
  yourself" act). Trust lives in the conversation (FIRM-SPEC: trust = remembered dialogue); the `grants` doc is
  its durable projection, not a control surface.
- **Guard check (deterministic).** Extend the outward path: before parking at the wall, check the venture's
  `grants` for a live, non-revoked grant matching the act type. If matched, the act proceeds **without waiting**
  and the conversation shows "Sending this — you told me I could" (the §4 language row). **The host authority
  model is untouched** — a grant only skips the *wait*, it never mints the `OUTWARD_RELEASE` capability; the
  release still flows through the host-issued path, now founder-pre-authorized by remembered dialogue. Deploy
  keeps its second authorization regardless of any grant (FIRM-SPEC).
- **When an act does wait, the inspector renders the exact payload** — the email as the recipient will see it,
  the spend, the diff — and the founder answers in the conversation (direction §4 gate anatomy).

**Acceptance.** After the founder says "you can send outreach like this yourself," a later matching outreach act
sends without waiting and says so in the conversation; a non-matching act type still waits with its exact
payload in the inspector; a deploy still waits regardless; revoking is a plain readable-file change.

### 4A.4 Evidence to cause (MOSTLY BUILT — wire the UI + confirm the port)

**Audit.** The join core **exists**: `market.mjs recordOutcome()` joins a returning outcome to the bet by
`joinKey` (minted at `createBet`, stamped onto the outward effect at `park()`), appends it as evidence, writes
the teammate's soul, and parks a decide-together wall item. `market-poll.mjs` reads released Gmail messages
from the venture's wall decisions and hands new signals to `recordOutcome` via `buildSentIndex`
(gmailMessageId → joinKey/betId/workRef). **The gap:** (a) the Gmail **send executor is stubbed** —
`effect-executors.mjs executeMessage` refuses "not wired yet," so the poll currently finds nothing because
nothing was really sent; (b) there is **no conversation surface** for a reply landing as the teammate reporting
it.

**Spec.**

- **Confirm/wire the outbound port honestly.** Gmail is the one live inbound port; the send path must actually
  release a message with a real `messageId` for the join to have anything to match. If wiring the real send
  executor is in scope for the night it runs, do it behind the wall (release → send → `messageId` recorded on
  the decision). If not, mark it **deferred-not-scheduled** explicitly and do not fake a send — the join is
  proven with a founder-entered outcome instead (`recordFounderOutcome` already exists).
- **The outbound-act ID → inbound-evidence mapping is already `joinKey`** (bet-level) plus optional `workRef`
  (exact-work lineage). Do not invent a second mapping; surface the existing one.
- **New conversation rendering.** When `recordOutcome` joins a reply, it renders **inline in the conversation as
  the teammate reporting it** ("Buffalo replied — they asked about pricing"), linking down to the outcome
  **record**. The decide-together wall item stays (FIRM-SPEC rail 5); the conversation line is the alert surface.

**Acceptance.** A reply to a released outreach act attaches to the effort that caused it (via `joinKey`) and
appears in the conversation as the teammate reporting it, linking to its record; an unattributed reply stays
honestly unattributed (never guessed onto unrelated work).

### 4A.5 First run (partly built — spec the connect→read-back→offers delta)

**Audit.** Venture creation binds one product repository (`venture-store.mjs`, manifest); `truth.mjs`/`scan.mjs`
provide the cited repository scan; `product-model-generator.mjs` interprets it as labeled inference (FIRM-SPEC
keep-list). The venture-picker "Start another venture" flow exists (`VenturePicker.tsx`). **The gap:** the
first-run *sequence* — read the product back on the canvas for correction, then offer concrete repo-derived
directions in the conversation — is not assembled.

**Spec.** Connect repo → product read back on canvas (what it does, who it's for, what's uncertain) for founder
correction → 2–3 concrete repo-derived direction offers in the conversation.

- **Read-back on canvas.** After repo bind, run the existing scan + product-model generator and materialize the
  working theory (the §3 staged unfolding): who it helps, how value happens, **what's uncertain** — explicitly
  labeled inference, correctable by the founder in dialogue (FIRM-SPEC truth discipline: cited or labeled
  inference, never asserted).
- **Direction offers.** From the scanned product, the crew proposes **2–3 concrete directions** in the
  conversation ("contact these buyers," "rewrite onboarding") — ordinary language, not internal nouns. These are
  offers the founder picks from, routed through §4A.1 when chosen; not a plan to approve.
- **Idea-stage ventures** (venture from a description, no repo; first work makes the idea concrete) are
  **deferred-not-scheduled** — the decision log marks idea-stage first-work design as open (needs mockup
  rounds). First run ships for the repo-backed case; the idea-stage case is named, not built.

**Acceptance.** Binding a real repo draws a correctable product read-back on the canvas with uncertainty
labeled, and the conversation offers 2–3 concrete repo-derived directions the founder can pick; picking one
routes it to a teammate (§4A.1). Idea-stage ventures are explicitly out of scope.

### 4A.6 One crew across ventures (CONFLICT — surfaced, not blended)

**Audit.** Teammates are **per-venture today**: `crew.mjs` stores the roster under
`getVentureDoc(ventureId, "crew", …)` and souls under `teammateSoulStore` keyed `ventureId__ref`. **But the
cross-venture mechanism the founder wants already exists in the FIRM-SPEC-blessed form:** the soul store keeps a
**template** soul in a `LIBRARY_VENTURE`; a venture instance is *born carrying the template's graduated lessons*
(`ensure(ventureId, ref, { templateRef })`), and distinct instances *graduate lessons back up into the template*
(`listInstancesOfTemplate`, founder-blessed graduation). So Yara/Mira/Soren/Kai are template-backed characters
whose **memory already crosses ventures as graduated patterns**.

**The conflict, stated plainly (do not blend):** "one crew across ventures — memory and lens persist across
ventures" has two readings, and they diverge from FIRM-SPEC rail 6 ("one venture is an isolated machine;
ventures never bleed; only founder-blessed lessons cross, through souls, as patterns — never venture data")
differently:

- **Reading A — firm-level identity, venture-data isolation preserved.** Yara/Mira/Soren/Kai are recognized as
  the *same characters* across ventures (one name, one face, one accumulating lens via the template), while each
  venture's *instance* still holds only that venture's work. This is **an evolution of the existing template
  mechanism**, honors rail 6, and is the buildable reading: promote the four to always-present templates, seed
  every new venture's roster from them, and surface them as continuous characters. Lens/memory persistence =
  template graduation, which already works.
- **Reading B — literally shared instances, memory pooled across ventures.** One soul object read/written across
  all ventures. This **violates rail 6** (venture data would bleed) and the FIRM-SPEC isolation guards. Do not
  build this without an explicit founder amendment to rail 6.

**Spec (Reading A, unless the founder amends rail 6).** Migrate the four named teammates to firm-level
templates; seed each venture roster from them so they are the same characters everywhere; keep per-venture
instances holding venture work; let the existing graduation carry lessons up to the template and down to new
instances. **Storage note:** roster seeding is a new default in `crew.mjs`'s `summon`/roster path; the soul
template/instance split is unchanged. Flag Reading B as requiring a rail-6 amendment before any pooling.

**Acceptance.** A newly created venture opens with Yara/Mira/Soren/Kai already present as the same characters,
carrying their graduated lens; a lesson blessed in one venture reaches the others via the template; no venture's
raw work or identifying soul data appears in another (rail 6 holds). If the founder wants literal shared memory,
the contract requires a rail-6 amendment first.

---

## 5. Invariants — must hold at every phase boundary

Non-negotiable. A phase is not done if any of these is red.

1. **`npm test` is green at every phase boundary.** Brain tests + UI unit tests + lint + production build.
   Never leave a phase with a red suite.
2. **The browser journey test is updated in the same phase as any UI it exercises — never deleted.**
   `npm run test:firm:browser` (and the atlas journeys) exercise real founder surfaces; when a phase changes a
   surface, update its journey in the same phase. Deleting a journey to make a phase pass is a contract
   violation.
3. **The `bet` / `gtm-ide` / `~/.gtm-ide` / `outcome` / `motion` / `staged-` storage/route/env identifiers are
   unchanged.** They are compatibility seams. Change founder-facing *copy*, never the identifiers.
4. **No new founder-facing nouns beyond the six.** Any new component/copy reconciles to venture · conversation
   · effort · teammate · capability · record. The language guard enforces the copy side.
5. **The founder wall's authority model is untouched.** Host-issued `OUTWARD_RELEASE` capability, per-request
   Electron signing, presence lease, second deploy authorization, self-approval refusal from browser/API/MCP —
   all preserved. The gate is a permission boundary, not a UI state (direction §9 operator-types constraint:
   keep mutation paths separable from pan/zoom/altitude so a read-only mode stays a flag, not a rewrite).
6. **One venture store, one architecture document.** No parallel execution store, no status enum, no new
   operational role (FIRM-SPEC anti-cage guards). The layout engine owns *placement only*; deleting placement
   loses only placement.
7. **`work-loop.mjs` does not grow.** It is already over the 500-LOC service ceiling (STATE.md debt). New
   steering/streaming/routing/dialogue/grant logic lands in sibling modules.
8. **A trust grant never mints host authority.** A grant may skip the *wait* for a matching act type; it never
   creates the `OUTWARD_RELEASE` capability, and the release still flows through the host-issued path. Deploy
   keeps its second authorization regardless of any grant. The wall-authority matrix test proves a grant cannot
   forge self-approval from browser/API/MCP/model.
9. **Only the founder ends work.** The dialogue-act classifier *proposes* an intent; the founder's own message
   is the authority that closes an effort (FIRM-SPEC rail 2). A model classification never ends work on its own.
10. **Ventures never bleed (rail 6).** Cross-venture crew is template-graduated patterns only (Reading A); no
    venture's raw work or identifying soul data crosses. Literal shared memory (Reading B) is barred without a
    FIRM-SPEC rail-6 amendment. The isolation guard stays green.

---

## 6. Phases — the honest scope call, split by dependency

### 6.0 Scope call (read first)

The original five phases built the room. With the six product-logic behaviors added, **this is more than one
overnight run can hold at quality.** Stated plainly: the shell + layout + language is already a full night; the
product logic (routing, dialogue-review, trust, evidence, first-run, crew) is a second full night that *depends
on the room existing*. Forcing it into one run yields a half-wired product — a beautiful shell the founder can't
actually operate, or product logic with nowhere legible to happen.

So the work splits into **two nights, by dependency and coherence, not by cutting the product in half:**

- **Night 1 = the product a founder touches.** Shell + layout + language, then the two behaviors that turn the
  conversation into the operating handle: **direction routing** (a direction gets claimed, visibly) and
  **review-is-dialogue** (replies steer and close efforts), plus **trust grants** (acts the founder blessed stop
  waiting). At the end of Night 1 a founder can direct the firm, watch work get claimed, review by talking, and
  grant standing — the loop is real, even though live-streaming and external evidence aren't wired yet.
- **Night 2 = the firm reaches the world and hardens.** Live streaming, mid-flight steering, the evidence port
  (replies landing as the teammate reporting them), first-run (connect → read-back → offers), one-crew-across-
  ventures, and Electron packaging. Night 2 depends on Night 1's rail/inspector/steer-seam existing.

Each phase below names scope, files, behavioral acceptance criteria, and exact verify commands. **Every phase
that touches a founder surface updates its browser journey in the same phase** (never deletes it), and
**`npm test` is green at every phase boundary. Screenshot checks at 1920×1080 (primary) and 1440×900
(resilience)** via Chrome DevTools MCP against the running app.

If a single run cannot finish even Night 1 at quality, stop at the last green phase boundary and report — a
shipped Phase N with `npm test` green beats a half-done Phase N+1.

---

### NIGHT 1 — the product a founder touches

#### Phase 1 — ADE shell grid + layout engine (the floor)

**Scope.** Docked CSS-grid shell (rail / stage / inspector) on `FirmApp.tsx`, stage-maximal with a collapsible
icon-strip rail and a single swapping inspector. Spike elkjs vs d3-force on the real projection, wire the
winner into a new `atlasLayoutEngine.ts` feeding React Flow positions, turn on stage-cell `fitView`, animate
layout with Motion, remove founder drag-to-place. Retire `atlasLayout.ts` / `atlasOrbitLayout.ts` once proven.

**Files.** `FirmApp.tsx`, `AtlasCanvas.tsx` (fitView on, drag off), `useAtlasCamera.ts` (stage-cell inset), new
`ui/src/lib/atlasLayoutEngine.ts`, `VentureAtlas.tsx` (re-home floating controls), new ADE grid CSS,
`ui/package.json` (+`elkjs`/`d3-force`). Retire `atlasLayout.ts`, `atlasOrbitLayout.ts`, `AtlasOrbitField.tsx`.

**Acceptance.** Panels never stack or bleed; rail docks and collapses to icons; inspector is one swapping panel;
composer docked to stage. **No two nodes overlap at 1280 / 1440 / 1920 / 2560 wide in any shell config.**
Toggling a region re-fits within 300 ms. A new effort adjusts only its neighborhood.

**Verify.** `npm test` · `npm --prefix ui run test:unit` · `npm run test:firm:browser` · screenshots at
1920×1080 and 1440×900, rail expanded/collapsed and inspector open/closed, asserting no canvas/node overlap.

#### Phase 2 — Language + component pass

**Scope.** Retitle drafts from content; move `staged-…` IDs under a disclosure. Ship the two shell regions +
five node archetypes (teammate, effort, capability, gate, question hub) with full state grids; crew as
characters with faces; finished efforts sink to the faded strata layer. Kill leaked nouns in copy; extend
`founderLanguage.test.ts` to cover `staged-` and `DRIFTING`. Remove the founder-facing degraded/snapshot chrome.

**Files.** node archetypes under `ui/src/components/atlas/**` and `ui/src/components/lens/**`,
`ConversationFeed.tsx`, inspector components, `CrewFace.tsx`/`CrewAvatar.tsx`, `founderLanguage.test.ts`.

**Acceptance.** No founder-facing surface shows `staged-…`, "bets", "drifting", or "lines". Language guard
passes in CI with extended coverage. Every component renders all grid states. Completed efforts sink to strata
and expand on demand.

**Verify.** `npm test` (language guard runs here) · `npm --prefix ui run test:unit` ·
`npm run test:firm:browser` · screenshots at 1920×1080 and 1440×900 of each archetype's states.

#### Phase 3 — Zoom-responsive rendering

**Scope.** Card detail responds continuously to React Flow's zoom value (title/glyph at low zoom → body/footer
at high zoom); selection-focus expands one effort and recedes the rest; composer direction materializes as a
staged ~2–3 s unfolding. **No named-altitude modes, no switcher** (cut — §3 correction).

**Files.** `useAtlasCamera.ts`, node components (zoom-conditional bodies), materialization in the composer path.
Do **not** add a mode selector or altitude labels.

**Acceptance.** Zooming out simplifies cards to title/glyph and zooming in re-details them, with no mode chrome
anywhere; selecting an effort expands it while the rest recedes without disappearing; typing a direction unfolds
the theory node-by-node.

**Verify.** `npm test` · `npm --prefix ui run test:unit` · `npm run test:atlas:browser` ·
`npm run test:firm:browser` · screenshots at 1920×1080 and 1440×900 at a low and a high zoom.

#### Phase 4 — Direction routing + review-is-dialogue + trust grants

**Scope.** The conversation becomes the operating handle. **Direction routing** (§4A.1): a direction is claimed
by the right teammate with a visible one-line why. **Review-is-dialogue** (§4A.2): a thread reply is classified
(steer / approve / close / new-direction) and dispatched to existing seams — steer becomes `pendingSteer`
context, close ends the effort (founder-only) and it recedes, approve releases at the gate. **Trust grants**
(§4A.3): a `grants` venture doc; the outward path checks a live grant before waiting, and a granted act sends
without waiting saying "you told me I could." The exact payload renders in the inspector when an act does wait.

**Files.** new `brain/src/firm/direction-routing.mjs`, new `brain/src/firm/dialogue-act.mjs`, new `grants`
collection via `venture-store.mjs`, `outward-guard.mjs` (grant check before park), the conversation route
(dispatch), `ConversationFeed.tsx` (claim line + reply handling), inspector payload view. **`work-loop.mjs`
does not grow** — routing/dialogue/grant logic lives in the new sibling modules.

**Acceptance.** A buyer-flavored direction is claimed by the buyer-lens teammate with a one-line why in the
thread (crew-of-one skips the model). "tighten the opening" steers the effort's next run; "close it" ends the
effort and it recedes; neither adds a button. After "you can send outreach like this yourself," a later matching
act sends without waiting and says so; a non-matching act still waits with its exact payload in the inspector; a
deploy still waits regardless. The host authority model is unchanged (grant skips the *wait*, never mints the
release capability).

**Verify.** `npm test` (includes new brain tests for routing/dialogue/grants and the wall-authority matrix
proving grants don't forge authority) · `npm --prefix ui run test:unit` · `npm run test:firm:browser` (update
the journey to cover claim-a-direction and review-by-dialogue in this phase) · screenshots at 1920×1080 and
1440×900 of a claimed direction, a dialogue close, and a waiting act's payload.

**Night 1 done when:** a founder directs the firm, watches work get claimed with a reason, reviews by talking
(steer/close), and grants standing — all with `npm test` green and the browser journey covering the new loop.

---

### NIGHT 2 — the firm reaches the world and hardens

#### Phase 5 — Streaming + mid-flight steering + run transparency

**Scope.** Add the SSE endpoint and client subscription (replace the 900 ms poll as primary, keep as reconnect
fallback). Add the checkpoint steer seam (`pendingSteer` drain in a new `work-loop-steer.mjs`) that Phase 4's
dialogue `steer` act feeds. Wire full run transparency: artifacts/events link to their **record** in the
inspector. Add composer @-node references, file/image attach, voice (no slash verbs). Replace the dead
venture-picker with entry-into-last-venture + ⌘O overlay.

**Files.** `brain/src/server.mjs` (SSE route), `useFirmLensProjection.ts` (EventSource, poll fallback),
`active-drives.mjs` (pendingSteer queue), new `brain/src/firm/work-loop-steer.mjs`, inspector record view,
`GoalComposer.tsx`, new ⌘O overlay, retire `VenturePicker.tsx`.

**Acceptance.** Live work streams while present without the poll storm (poll remains as reconnect fallback); a
steer from the conversation adjusts a running effort **at the next checkpoint**, honestly surfaced as "adjusts
on the next step" (not claimed instant); selecting an artifact opens its record; @-referencing a node targets
it; ⌘O switches ventures without a picker screen.

**Verify.** `npm test` · `npm --prefix ui run test:unit` · `npm run test:firm:browser` (update the entry-flow
journey in this phase) · screenshots at 1920×1080 and 1440×900 of streaming and the ⌘O overlay.

#### Phase 6 — Evidence to cause (the world answers)

**Scope.** Surface the existing `market.mjs` join in the conversation: a joined reply renders inline as the
teammate reporting it, linking to its **record**; the decide-together wall item stays. Confirm the outbound
Gmail port releases a real `messageId` so the join has something to match — **wire the real send executor behind
the wall if in scope, else mark it deferred-not-scheduled and prove the join with a founder-entered outcome.**

**Files.** `market.mjs` (unchanged join; verify), `market-poll.mjs` (verify sent-index), `effect-executors.mjs`
(real send executor if in scope), `ConversationFeed.tsx` (reply-as-teammate-report rendering), inspector
outcome record.

**Acceptance.** A reply to a released outreach act attaches to the causing effort (via `joinKey`) and appears in
the conversation as the teammate reporting it, linking to its record; an unattributed reply stays honestly
unattributed. If the real send executor is out of scope, that is stated and the join is proven with a
founder-entered outcome — no faked send.

**Verify.** `npm test` (market/join tests) · `npm --prefix ui run test:unit` · `npm run test:firm:browser`
(reply-lands-in-conversation coverage) · screenshots at 1920×1080 and 1440×900 of a reply reported in-thread.

#### Phase 7 — First run (connect → read-back → offers)

**Scope.** After repo bind, run the existing scan + product-model generator and materialize a **correctable**
product read-back on the canvas (what it does, who it's for, **what's uncertain** — labeled inference); then
offer **2–3 concrete repo-derived directions** in the conversation, routed through Phase 4 when picked.
**Idea-stage ventures are deferred-not-scheduled** (decision log: open, needs mockup rounds).

**Files.** venture-create flow (`venture-store.mjs` manifest, the create route), `scan.mjs`/`truth.mjs` (reuse),
`product-model-generator.mjs` (reuse), the read-back materialization (Phase 3 unfolding), `ConversationFeed.tsx`
(direction offers), retire/replace `VenturePicker.tsx` create path as needed.

**Acceptance.** Binding a real repo draws a correctable read-back with uncertainty labeled and offers 2–3
concrete repo-derived directions the founder can pick; picking routes to a teammate (Phase 4). Idea-stage
ventures are explicitly out of scope.

**Verify.** `npm test` · `npm --prefix ui run test:unit` · `npm run test:firm:browser` (first-run coverage) ·
screenshots at 1920×1080 and 1440×900 of the read-back and the direction offers.

#### Phase 8 — One crew across ventures (Reading A)

**Scope.** Migrate Yara/Mira/Soren/Kai to firm-level templates; seed every new venture's roster from them so
they are the same characters everywhere; keep per-venture instances holding venture work; let existing
graduation carry lessons up to the template and down to new instances (§4A.6, Reading A). **Reading B (literal
shared memory) requires a rail-6 amendment — do not build it without one.**

**Files.** `crew.mjs` (roster seeding default), `teammate-soul-store.mjs` (template/instance split — verify,
likely unchanged), `teammate-soul.mjs`, the library-venture template seeds.

**Acceptance.** A newly created venture opens with the four already present as the same characters carrying
their graduated lens; a lesson blessed in one venture reaches others via the template; **no venture's raw work
or identifying soul data appears in another** (rail 6 holds, proven by an isolation test). Reading B is not
built absent a rail-6 amendment.

**Verify.** `npm test` (crew seeding + the cross-venture isolation guard) · `npm --prefix ui run test:unit` ·
`npm run test:firm:browser` · screenshot of a fresh venture opening with the seeded crew.

#### Phase 9 — Electron packaging + shell hardening

**Scope.** Window-state restore across launches; confirm brain starts/stops with the app and the health-gated
boot is clean; complete browser demotion to dev harness (no founder-facing degraded chrome). Keep scope honest:
boot, lifecycle, window restore.

**Files.** `electron/main.cjs`, `electron/preload.cjs`, `electron-builder.yml`; UI removal of degraded chrome.

**Acceptance.** The packaged app boots to the last venture at restored window bounds; quitting stops the brain
cleanly; the browser build shows the dev harness, not a founder-facing degraded state.

**Verify.** `npm test` · `npm run app` (boot smoke: window opens, brain healthy, quit stops brain) ·
`npm run app:dist` builds. Screenshot the booted desktop window at its restored size.

**Deferred (not scheduled — decision log + audit):** navigation instruments (minimap, command palette), update
mechanics, **idea-stage first-work design** (Phase 7 scope note), persona prompt architecture, open-source
packaging, and **literal shared cross-venture memory (Reading B)** — the last requires a FIRM-SPEC rail-6
amendment before it may be built. Real Gmail send-executor wiring is in Phase 6 *if in scope that night*,
otherwise deferred with the join proven by a founder-entered outcome.

---

## 7. Exact verification commands (reference)

| Intent | Command |
|---|---|
| Full verification (gate at every phase boundary) | `npm test` |
| UI unit tests | `npm --prefix ui run test:unit` |
| Brain tests | `npm --prefix brain test` |
| Browser journey (update in the phase that touches its surface) | `npm run test:firm:browser` |
| Atlas browser journeys | `npm run test:atlas:browser` |
| Local-readiness receipt | `npm run test:acceptance` |
| Desktop boot smoke | `npm run app` |
| Desktop package | `npm run app:dist` |
| Start locally (screenshot target) | `npm start` (serves at `127.0.0.1:4317`) |

Screenshot checks use the Chrome DevTools MCP against the running app at **1920×1080 (primary, ship-evidence)**
and **1440×900 (resilience)**. Smaller desktop sizes are resilience checks, not the source of visual truth.
