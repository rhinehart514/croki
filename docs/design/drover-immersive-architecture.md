# Drover — Immersive Shell: Production Architecture

**Status: build-ready architecture, 2026-07-16.** Implements the determined change-set in
`docs/design/drover-immersive-redesign.md` (authoritative UI/UX). Data model, six nouns, wall/gate
semantics, and founder-language contract are unchanged (`FIRM-SPEC.md`, `STATE.md`,
`ux-divergence-2026.html` §5). Every seam cited below is grounded in the three discovery maps
(BACKEND INTEGRATION CONTRACT, UI REUSE MAP, DEPENDENCY + TECHNIQUE BRIEF) and verified against the
live repo. **No endpoint, hook, or data shape here is invented.**

Orientation for a cold reader: Drover is the operating system for a one-person holding company. The
founder drives a living venture by talking to it; a permanent AI crew researches, drafts, and builds;
everything that would touch the world waits at *the wall* for the founder's hand. This document
rebuilds the **shell** — the edge-to-edge warm-paper world, floating glass chrome, descend-in-place
reading, ambient conversation, and the gate — while consuming the existing domain/data layer unchanged.

Stack: React 19.2, `@xyflow/react` 12.11, `motion` 12.42, Base UI 1.6, Tailwind 4.3, d3-force 3.

---

## 1 · Component tree

New directory: **`ui/src/components/immersive/`**. The existing `atlas/` domain+data seams are imported
verbatim (UI REUSE MAP); `immersive/` rebuilds only presentation. The legacy `VentureAtlas.tsx` triptych
composition is left in place until Phase 5 retires it, so the app never big-bangs.

```
ui/src/components/immersive/
├─ ImmersiveShell.tsx            # root: mounts World + all floating glass, owns shell state context
├─ world/
│  ├─ VentureWorld.tsx          # the edge-to-edge ReactFlow stage (full viewport, no chrome frame)
│  ├─ worldNodeTypes.ts         # nodeTypes registry mapping kind → archetype component
│  └─ useSemanticZoom.ts        # live zoom band (glyph|card|detail) via useStore((s)=>s.transform[2])
├─ nodes/
│  ├─ ConceptNode.tsx           # who-it-helps / product-vision archetype
│  ├─ SystemNode.tsx            # durable machinery archetype
│  ├─ MotionNode.tsx            # way-to-reach-people archetype
│  ├─ CampaignNode.tsx          # live push archetype (efforts, drafts, gate roll up here)
│  ├─ EffortNode.tsx            # a live push / attempt (bet) — provisional vs durable legible
│  ├─ TeammateNode.tsx          # crew face + current-work claim
│  ├─ RecordNode.tsx            # what the market said (outcome)
│  └─ nodeChrome.tsx            # shared paper-card frame, 8-state visuals, provisional dashed style
├─ descend/
│  ├─ DescendReading.tsx        # shared-element morph target: node → full reading, world blurs behind
│  ├─ readings/                 # content-swapped bodies, one per archetype
│  │  ├─ EffortReading.tsx      # drafts · record · steer/try-another actions
│  │  ├─ CampaignReading.tsx    # approaches · live pushes rolled up
│  │  ├─ TeammateReading.tsx    # current work · claims
│  │  ├─ RecordReading.tsx      # the outcome as returned
│  │  └─ GateReading.tsx        # the EXACT staged payload + Release/Hold dialogue
│  └─ useDescent.ts             # descent state + camera fly-in/rise + breadcrumb
├─ chrome/
│  ├─ VentureSigil.tsx          # top-left glass sigil: venture name/switch
│  ├─ FirmStatus.tsx            # operating picture glyphs (live · building · returned)
│  ├─ NeedsYouPulse.tsx         # amber pulse; count of at-gate items; click → descend to gate
│  ├─ Altimeter.tsx             # passive altitude read (orbit/ground/inside); NOT a switcher
│  ├─ Composer.tsx              # single floating handle, bottom-center; `/` summons; suggested intents
│  └─ Teleport.tsx              # ⌘K command palette (Base UI Dialog) → fly camera to any object
├─ conversation/
│  ├─ InWorldReceipts.tsx       # transient mono log rows surfaced next to the node they concern
│  ├─ SummonableThread.tsx      # collapsed pill → glass ribbon transcript (Base UI Popover/Dialog)
│  └─ CheckpointCard.tsx        # in-world checkpoint / first-theory seal object
├─ camera/
│  └─ useImmersiveCamera.ts     # thin wrapper re-exporting the existing useAtlasCamera seam (see §2)
└─ state/
   └─ ShellStateContext.tsx     # React context: selection, descent, thread-open, altitude (see §2)
```

### File responsibilities, key props, and consumed seam

| File | Responsibility | Key props | Consumes (seam · REUSE MAP / CONTRACT) |
|---|---|---|---|
| `ImmersiveShell.tsx` | Root composition; provides `ShellStateContext`; wraps `<ReactFlowProvider>` (required for camera). | `{ ventureId, lens }` | `useAtlasProjection(ventureId)` (REUSE #1); `FirmLens` type (types.ts:567) |
| `VentureWorld.tsx` | Edge-to-edge ReactFlow stage; renders placed nodes+edges; no docked frame. | `{ nodes, edges, onDescend }` | `projectAtlas(projection, lens, {capabilities})` (REUSE #3) → `layoutAtlasNodes` (REUSE #9); `useAtlasMaterialization` (REUSE #4) |
| `useSemanticZoom.ts` | Quantize live zoom into 3 bands so nodes re-detail without churn. | `()` | `useStore((s)=>s.transform[2])` (TECHNIQUE BRIEF §1) |
| `nodes/*.tsx` | One archetype per element role; render band-appropriate detail; 8 states. | `{ data: AtlasNode, band, state }` | `AtlasNode` type (atlasTypes); node kinds from `projectAtlasSemanticLayer` (REUSE #2) |
| `nodeChrome.tsx` | Shared paper frame + dashed-provisional/solid-durable + amber at-gate ring. | `{ state, provisional, atGate }` | design tokens (REUSE #10, index.css) |
| `DescendReading.tsx` | The one lifted surface: `layoutId` morph from node to reading; world blurs behind; Escape rises. | `{ selection, onRise }` | `motion` shared-element (`layoutId`, `AnimatePresence mode="popLayout"`) (BRIEF §2); `CanvasSelection` (REUSE #5, directionTarget.ts) |
| `readings/EffortReading.tsx` | Effort drafts+record+steer; "try another approach" branch. | `{ betId }` | `driveTeammate(ventureId,{goal,betId})` (REUSE #6, api.ts:498) |
| `readings/GateReading.tsx` | Exact staged payload; Release/Hold as dialogue (no accept/reject buttons). | `{ wallItem }` | `decideWallItem(ventureId,itemId,{decision,note})` (REUSE #8, api.ts:460); `FirmLens.wallItems` (REUSE #7) |
| `useDescent.ts` | Descent lifecycle: set selection, fly camera in, breadcrumb, Escape rises with prior frame. | `()` | `useAtlasCamera().reveal/broaden` (§2) + `ShellStateContext` |
| `chrome/VentureSigil.tsx` | Glass venture identity + switch. | `{ venture }` | `getLens`/`FirmVenture` (CONTRACT 1.1) |
| `chrome/FirmStatus.tsx` | Operating-picture glyphs from live join counts. | `{ projection }` | `projection.joins` + `projection.pressure` (CONTRACT §3) |
| `chrome/NeedsYouPulse.tsx` | Amber pulse = count of `wallItems` with `decision===null`; click descends to gate. | `{ wallQueue }` | `FirmLens.wallItems` (REUSE #7); `getWallQueue` (api.ts:403) |
| `chrome/Altimeter.tsx` | Passive altitude readout. | `{ altitude }` | `useAtlasCamera().altitude` (§2) |
| `chrome/Composer.tsx` | Single floating intent handle; empty-venture centered w/ suggestions; `/` summons. | `{ ventureId, selection }` | `driveTeammate(ventureId, body)` (REUSE #6) — body scoped by `selection` via `targetBet/targetArchitecture/targetTheory` (REUSE #5) |
| `chrome/Teleport.tsx` | ⌘K palette → fly camera to node/action/venture. | `{ nodes }` | Base UI Dialog (BRIEF §5) + `useAtlasCamera().reveal` (§2) |
| `conversation/InWorldReceipts.tsx` | Transient mono receipt rows anchored to the node they concern. | `{ conversation }` | `getConversation(ventureId)` (CONTRACT 1.5, api.ts:273) |
| `conversation/SummonableThread.tsx` | Collapsed pill → glass ribbon transcript on demand. | `{ conversation }` | `getConversation(ventureId)` (api.ts:273); Base UI Popover |
| `conversation/CheckpointCard.tsx` | In-world checkpoint / first-theory seal. | `{ message }` | conversation messages `kind:"working-theory"|"handoff"` (CONTRACT 1.5) |
| `camera/useImmersiveCamera.ts` | Re-export/adapt existing camera seam; expose descend/rise/teleport verbs. | `(nodes, receiptKey)` | **`useAtlasCamera`** (`ui/src/components/atlas/useAtlasCamera.ts`) — already implements `reveal`, `broaden`, `focus`, camera-history stack, hub-centered fit |

**Load-bearing reuse the maps under-flagged:** `useAtlasCamera` already implements the descend
(`reveal`), rise (`broaden`, restores `previousViewport`), teleport-target framing (`frameTarget`), and
altitude band derivation. The immersive camera does **not** re-implement fly-in from scratch — it wraps
this seam and swaps `duration: 0` calls for tweened `setCenter`/`setViewport({duration})` per BRIEF §1.

---

## 2 · State model

Shell state is small and mostly derived. It splits by scope: **camera/altitude/materialization** stay
in hooks colocated with the world; **cross-cutting UI mode** (selection, descent path, thread-open)
lives in one context so chrome and readings read it without prop-drilling.

| State | Shape | Lives in | Source of truth |
|---|---|---|---|
| **selection** | `CanvasSelection` (directionTarget.ts) | `ShellStateContext` | founder click / ⌘K; drives descent + composer scope |
| **descent** | `{ path: CanvasSelection[]; open: boolean }` | `useDescent` (in context) | Escape pops; breadcrumb = path |
| **camera history** | `previousViewport` / `previousFocusViewport` refs | **`useAtlasCamera`** (already built) | reused as-is; rise restores exact prior frame |
| **altitude** | `"venture"|"architecture"|"detail"` | `useAtlasCamera().altitude` | derived from live zoom (`onMoveEnd`) |
| **semantic-zoom band** | `"glyph"|"card"|"detail"` | `useSemanticZoom` (per node) | `useStore((s)=>s.transform[2])`, quantized |
| **materialization** | `{ revealedIds, materializingIds }` | `useAtlasMaterialization` (already built) | projection burst detection; reused verbatim |
| **thread-open** | `boolean` | `ShellStateContext` | `/` or pill click; independent of descent |
| **projection** | `FirmArchitectureProjection` | `useAtlasProjection` (already built) | 1.5s poll of `/architecture/projection` |
| **wall queue** | `WallQueueItemView[]` | `getWallQueue` poll / `FirmLens.wallItems` | drives `NeedsYouPulse` + gate readings |

Rule: **no new global store.** `ShellStateContext` holds only UI mode (selection, descent, thread-open);
everything else stays in the existing colocated hooks. Domain data never enters context — it flows from
`useAtlasProjection` down through props, exactly as today.

---

## 3 · Wiring map (interaction → backend + UI seam)

| Interaction | Backend endpoint (CONTRACT) | UI seam (REUSE MAP) | Notes / GAP |
|---|---|---|---|
| **Materialize** (sentence → theory blooms) | `POST /api/ventures/:id/drive` `{goal}` → then poll `GET /architecture/projection` | `driveTeammate` (api.ts:498) → `useAtlasProjection` (1.5s) → `useAtlasMaterialization` sequences the burst | Fully supported. Materialization is client-side sequencing of the polled projection burst; no new endpoint. |
| **Descend** (into a node's reading) | none (read-only; data already in projection/lens) | `useDescent` sets `selection` → `useAtlasCamera().reveal` tweens camera → `DescendReading` `layoutId` morph | Fully supported. |
| **Rise** (Escape) | none | `useDescent` pops path → `useAtlasCamera().broaden` restores `previousViewport` | Fully supported — camera-history stack already exists. |
| **Steer** (refine "make B cheaper") | `POST /api/ventures/:id/drive` `{goal, betId, workRef?, architectureTarget?, theoryTarget?}` | `driveTeammate` with scope from `targetBet/targetWork/targetArchitecture/targetTheory` (directionTarget.ts) | Fully supported. |
| **Release at wall** | `POST /api/ventures/:id/wall/:itemId/decide` `{decision:"release"|"reject", note}` | `decideWallItem` (api.ts:460) from `GateReading` | Fully supported. Deploy effects need TWO acts: `decision:"authorize-deploy"` then `"release"` (CONTRACT 1.3 / §4). Gate reading must render the authorize step for `effect.kind==="deploy"`. |
| **Try another approach** (branch a sibling) | `POST /api/ventures/:id/drive` `{goal, betId (parent)}` — brain forks via `fork_bet` tool | `driveTeammate` with parent `betId`; new dashed sibling arrives via projection poll | **PARTIAL GAP.** The HTTP `drive` body has no explicit "branch/fork from this bet" flag; forking is a teammate-side tool decision inside the loop, not a founder-addressable HTTP verb. Today the founder can only *phrase* branching in `goal`. **Brain change:** add an explicit `branchFrom?: betId` (or `intent:"branch"`) param to `POST /drive` that seeds the drive to `fork_bet` from the named bet, so "try another approach" is deterministic rather than prompt-dependent. Until shipped, wire the button to `driveTeammate({goal:"Try another approach to <X>", betId})` and accept prompt-level forking. |
| **Return after away** (clear account) | `GET /architecture/projection` (pressure[] + joins) + `GET /api/ventures/:id/wall` | `useAtlasProjection` + `getWallQueue`; `FirmStatus` + `NeedsYouPulse` render the operating picture on load | Fully supported. Pressure[] with founder-facing `detail` is the "clear account" (CONTRACT §3). Legacy `AtlasReturnBand` logic is a reference. |
| **Teleport** (⌘K) | none | `Teleport` palette → `useAtlasCamera().reveal(nodeId)` | Fully supported. |
| **Ambient receipts** | `GET /api/ventures/:id/conversation` (poll) | `InWorldReceipts` filters messages by `target.betId/architectureId` and anchors to node | Fully supported; conversation is append-only (CONTRACT 1.5). |

**Single GAP requiring a brain change:** *try-another-approach* has no deterministic HTTP fork verb.
Specified fix above (add `branchFrom` to `POST /drive`). Everything else binds to existing endpoints.

---

## 4 · Phased build plan

Ordering guarantee: `immersive/` is additive and independently mountable behind a route/flag; the legacy
`VentureAtlas` triptych keeps building and running until Phase 5 retires it. Each phase ends green
(`npm --prefix ui run test:unit` + build) and adds a runnable acceptance test.

### Phase 1 — Immersive shell scaffold + world + composer + kinetic materialization (the signature slice)
- **Creates:** `immersive/ImmersiveShell.tsx`, `world/VentureWorld.tsx`, `world/worldNodeTypes.ts`,
  `world/useSemanticZoom.ts`, `nodes/*` (archetypes + `nodeChrome`), `chrome/Composer.tsx`,
  `camera/useImmersiveCamera.ts`; mount route/flag `?shell=immersive`.
- **Wires:** `useAtlasProjection` (real projection, 1.5s) → `projectAtlas` → `layoutAtlasNodes` →
  `useAtlasMaterialization`; `Composer` → `driveTeammate({goal})`; camera via wrapped `useAtlasCamera`.
- **Acceptance (browser journey, 1920×1080):** load a real venture on `?shell=immersive`; assert the
  world fills the viewport edge-to-edge (no rail/inspector grid cells present in DOM); type an intent in
  the floating composer, submit, and assert ≥3 new nodes appear **staggered** (materialization: not all
  present in one frame — poll DOM across ≥2 animation frames and assert count increases monotonically);
  assert amber appears only on at-gate/needs-you nodes. Unit test: `useSemanticZoom` returns
  `glyph|card|detail` at the correct zoom thresholds.

### Phase 2 — Descend-in-place + gate reading
- **Creates:** `descend/DescendReading.tsx`, `descend/useDescent.ts`, `descend/readings/*`
  (Effort/Campaign/Teammate/Record/Gate).
- **Wires:** click node → `useDescent` → camera fly-in (tweened `setCenter`) + `layoutId` morph; world
  blurs behind; Escape rises restoring prior frame; `GateReading` → `decideWallItem`
  (release/reject/authorize-deploy); `EffortReading` steer → `driveTeammate({goal,betId})`.
- **Acceptance (browser journey):** click a node → assert reading surface mounts with matching
  `layoutId`, world container gets blur class, breadcrumb shows the path; press Escape → assert reading
  unmounts and viewport returns within tolerance of the pre-descent frame; on a gate item with a message
  effect, invoke Release → assert `POST /wall/:id/decide {decision:"release"}` fired; on a deploy effect,
  assert Release is disabled until `authorize-deploy` succeeds. Unit test: `useDescent` pushes/pops path.

### Phase 3 — Ambient conversation + floating chrome
- **Creates:** `conversation/InWorldReceipts.tsx`, `conversation/SummonableThread.tsx`,
  `conversation/CheckpointCard.tsx`, `chrome/VentureSigil.tsx`, `chrome/FirmStatus.tsx`,
  `chrome/NeedsYouPulse.tsx`, `chrome/Altimeter.tsx`, `chrome/Teleport.tsx`, `state/ShellStateContext.tsx`.
- **Wires:** `getConversation` poll → receipts anchored by `target.*` + summonable ribbon (Base UI);
  `NeedsYouPulse` from `wallItems` (`decision===null`); ⌘K `Teleport` → `useAtlasCamera().reveal`.
- **Acceptance (browser journey):** assert no permanent conversation column in DOM; press `/` → thread
  ribbon appears; a `working-theory`/`handoff` message renders as a `CheckpointCard` in-world (not a
  bubble); with a queued wall item present, assert `NeedsYouPulse` shows amber + correct count; ⌘K, pick
  a node, assert camera reveals it. Unit test: receipt filter maps `message.target.betId` → node id.

### Phase 4 — Altitude/LOD polish + try-another-approach + reduced-motion
- **Creates:** none major; edits `nodes/*` for the three-band detail, motion springs (BRIEF §2/§3), the
  `try-another-approach` action in `EffortReading`/`CampaignReading`.
- **Wires:** branch button → `driveTeammate({goal, betId})` (or `branchFrom` once the brain GAP ships);
  `prefers-reduced-motion` swaps springs for instant transitions (keeps every state change).
- **Acceptance:** unit test each zoom band renders the expected archetype subtree; browser journey with
  reduced-motion emulated asserts nodes still change state but camera does not travel; "try another
  approach" fires a scoped `driveTeammate` and a dashed sibling appears on next poll.

### Phase 5 — Cut over + retire triptych
- **Edits:** flip default shell to `immersive`; delete/retire `FirmApp` triptych grid CSS + `VentureAtlas`
  triptych composition (keep the reused hooks); confirm `npm test` (brain + ui + lint + build) green.
- **Acceptance:** full `npm test` passes; browser journey `npm run test:firm:browser` passes end-to-end
  against the immersive shell; no legacy `.firm-app-rail`/`.firm-app-inspector` selectors remain in the
  shipped DOM.

---

## 5 · Risks + dependency additions

**Dependency additions to install: NONE required for Phases 1–4.** Everything maps to installed libs:
`@xyflow/react` 12.11 (camera/`useStore`), `motion` 12.42 (`layoutId` morph, springs), Base UI 1.6
(Dialog/Popover for ⌘K + thread), Tailwind 4.3 (`color-mix`/oklab for warm glass). No second conversation
framework (BRIEF §5 — the ambient pattern is achievable directly; `assistant-ui` is optional and only if
a full transcript store is later wanted — do **not** add it now).

- **`elkjs@0.11.x` — DEFER (proposed, not adopted).** Layout stays d3-force via `layoutAtlasNodes` (REUSE
  #9), which is deterministic and screenshot-stable. `elkjs` is the Phase-2 layout spike per
  `ux-divergence-2026.html` §6 / redesign §10 — a separate decision, not part of this shell rebuild. If
  adopted later it lands **behind** `layoutAtlasNodes` (worker-loaded), preserving the engine-owned seam.

**Risks:**
1. **Ambient legibility (redesign §10).** In-world receipts + a glanceable pill may lose "what's
   happening" vs a permanent rail. Guard: reversible fallback = a slim always-on strip; do not redesign.
2. **Descent vs peripheral awareness.** Blurred-but-present world may read as "lost the map" at density.
   Guard: widen reading transparency / shrink toward a floating detail — a tuning, not a rebuild.
3. **Materialization determinism.** `useAtlasMaterialization` sequences a *polled* burst; if the
   projection poll splits a theory across two 1.5s ticks, the bloom fragments. Guard: burst detection is
   already conservative (`BURST_MIN=3`); verify against a real drive before shipping the signature slice.
4. **try-another-approach GAP (§3).** Until the brain `branchFrom` param ships, branching is
   prompt-level, so a fork is not guaranteed deterministic. Ship the phrased fallback; file the brain
   change.
5. **Camera tween cost.** Swapping `duration:0` for tweened camera moves in `useAtlasCamera` must not
   regress the existing fit/reveal races (that hook has careful measurement-gating). Wrap, don't rewrite;
   keep `duration:0` on the settle path, tween only the founder-initiated descend/rise/teleport.

---

**Doc:** `/Users/laneyfraass/drover/docs/design/drover-immersive-architecture.md`
