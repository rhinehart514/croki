> **SUPERSEDED — 2026-07-11.** This engine-lens direction is design history. The
> current directly editable, multi-goal contract is **docs/OPEN-CANVAS-SPEC.md**.

# GTM Engine Canvas — the historical mental model and canvas direction

Status: model locked 2026-06-28 (founder confirmed). **Engine view v1 SHIPPED into the live app**
2026-06-28 — the `engine` lens is the default GTM overview; `npm test` green (371 backend tests,
UI builds, lint clean bar one pre-existing warning); verified in the running app on real projects.

## Shipped (v1)

- **`EngineLens`** (`ui/src/components/lenses/EngineLens.tsx` + `.css`) — every channel as a frosted
  node with a state-colored left rail (green=live, amber=needs you, red=blocked), a top **engine
  pulse** strip of real vitals (channels, live, prospects in flight, at the gate, need you), and a
  **focal hierarchy**: channels that need you are promoted into a larger "Needs you" tier above the
  calm ones, so the surface routes the eye instead of listing equals. Registered as the `engine`
  lens in `GtmCanvas.tsx`; it's the default GTM overview (`App.tsx` mounts it with
  `defaultLensId="engine"`). Clicking a node opens that channel's flow.
- **Feeds, honestly** — `deriveChannelFeeds` (`brain/src/cross-reference.mjs`) +
  `GET /api/projects/:id/channel-feeds` + 7 tests. Feeds are the real, undirected links between
  channels that share the same Person / Claim / Experiment; one feed per channel pair, derived,
  never seeded. When nothing is shared, nothing draws — the engine is just its channels, honestly.
  The lens renders these as labeled curves between nodes.
- All state and vitals derive from real channel signal; nothing is seeded. Read-only; no send path.

Reviewed by an adversarial design-critic (verdict: honest, console-clean, node language is a keeper;
the grid-of-equals finding was fixed with the focal tier) and a correctness review (verdict: SHIP).

## The decision (one named idea)

**Your go-to-market is one engine, and you co-pilot it with Claude.** Not a set of separate
pipelines, not a read-only monitor you only touch at a gate. One canvas: Claude operates it
live, and you watch and reach in at any time — drag a feed between channels, grab a prospect,
start a channel, build alongside it.

This replaces two abstractions the founder rejected: **"altitude"** (the zoom metaphor) and
**"shared objects"** (engineer-speak). Both are gone from the user-facing language.

## Controlled vocabulary (true GTM terms — the IA spine)

Every label on the surface comes from this list. No invented taxonomy.

- **Engine** — the whole go-to-market for a project. The canvas IS the engine.
- **Channel** — one GTM motion. The founder's word, chosen over "play" and "workflow". A
  channel is *any* motion (sourcing, content, outbound, conversion, referral, …); the kind is
  a quiet label, never a fixed taxonomy. "＋ New channel" makes any motion you can name.
- **Feed** — one channel's output flowing into another channel's input. This is the "blend":
  the same thing produced once and used in many channels (Operator Mining feeds PCO Outbound a
  *list*; Proof Assets feeds it a *case study*; replies feed back as *signals*). Shown as a
  labeled line carrying the real GTM noun, never as a copy.
- **Stage** — a step in a channel's pipeline, with a live count (scanned → fit ICP → drafted →
  at gate → sent).
- **Gate** — the founder-approval wall. Nothing sends until it clears. One of several ways the
  founder engages, not the only one.
- **Outcome** — what a channel is for (a pilot, a paid signup).
- Navigation is CRM-native, not "altitude": **the engine → open a channel → open a prospect**
  (board → record, the pattern users know from Salesforce / HubSpot / Attio).

## Interaction model (the founder's explicit ask)

- **Two cursors on one canvas.** Claude works a channel live (its labeled cursor + a work
  readout, e.g. "Enriching 12 / 30"); the founder has their own cursor and reaches in anytime.
- **Co-pilot, not gatekeeper.** The founder can drag a new feed (a dashed line mid-drag that
  snaps to a port), grab a prospect, edit a draft, or spin up a channel — at any moment, not
  only at the gate.
- **The gate stays sacred** — fast and fluid up to it, then a still, specific founder review
  before anything leaves the system.

## How separation works on one canvas (no "altitude")

- **Convergence shows the blend** — a channel fed by three others has three lines arriving; you
  see the intertwining instead of hiding it in swimlanes.
- **Engine pulse** — one quiet strip of GTM vitals (prospects in flight · drafts at the gate ·
  pilots won · channels that need you) reads the whole system at a glance.
- **Open to descend** — open a channel for its pipeline, open a prospect for their record. The
  separation is "open into," not a zoom metaphor.
- This **retires the lens-switcher** (Channel flow / Portfolio map / People / Experiment matrix
  as parallel tabs). People and Experiment-matrix become find-references *results* reachable
  from the canvas, not modes you live in.

## The hand (visual)

Lifted from the shipped product (glass skin) so the direction is the real app, not a throwaway.

- **Ground:** warm greige `#f0efec` + printed dot grid, soft pastel ambient wash.
- **Channels:** frosted-glass cards (the house material), 20px radius, hairline border.
- **Type:** Geist (display + body), Geist Mono for counts and stage labels.
- **Color, rationed to meaning only:** green = live, amber = needs you, red = blocked. No
  decorative tint. Per the no-indigo rule, **Claude's presence is a labeled cursor, not a new
  hue** — the founder's cursor is the one green accent (it's "alive/yours").
- **Signature move:** the two cursors — Claude working a channel while you drag a new feed.

## Artifacts

- Direction mock (static, design-gate clean): `~/design-showcase/gtm-engine/index.html` — the
  engine view for the real RodentRadar channels (Operator Mining, Proof Assets, PCO Outbound,
  Demo → Pilot, Vouch Loop).

## Shipped (v2 — drag-to-connect, the founder draws feeds)

The founder drags from a channel node's output handle onto another channel → that channel pulls the
first one's output. It persists, draws as an arrowed "feeds output" link, and actually executes.

- **Derived source mode** (`source-entry.mjs`) — a third source mode beside provided/discovered: a
  source carrying `config.sourceChannelId` is `derived`. The mode derives from shape (a real channel
  id in config) so the label can't lie; `sourceStandsOnData` treats it as standing, so it flows.
- **Run path** (`graph.mjs` `runNode` + injectable `loadLastRunItems`) — at run time a derived source
  pulls the upstream channel's last-run output items (its last data-producing node), read-only, and
  the founder gate downstream still gates every send. Wired into all run paths (program-runtime,
  operator-runtime, server). Loader: `createDerivedSourceLoader` (`cross-reference.mjs`).
- **Derivation + endpoints** — `deriveDirectedFeeds` reads the directional links back by scanning
  each channel's graph for a derived source (drops a feed whose source channel was deleted, and
  self-feeds). `POST /api/channels/:id/derive {sourceChannelId}` wires it (validated, persisted);
  `GET /api/projects/:id/directed-feeds` reads it.
- **The drag interaction** (`EngineLens.tsx`) — each node has an output handle; pointer-drag it onto
  another node to wire the feed. Directional feeds draw as arrowed curves with a "feeds output" label,
  distinct from the faint undirected shared-entity feeds.
- Tested: 6 backend tests (directed-feed derivation, self/orphan guards, the derived-source run path
  with a fake loader, the loader's empty cases). Verified live in the app: dragging a handle onto a
  channel creates the feed, the arrow appears, and the wiring round-trips through the real endpoints.
  377 backend tests green; UI builds; no console errors.

## What's next (the layers beyond v2)

1. ~~Make it live in the app~~ — **done** (engine view v1).
2. ~~Directional feeds + drag-to-connect~~ — **done** (v2, above).
3. **Remove-a-feed** — the small complement to drawing one (an unwire affordance / `DELETE` on the
   derive endpoint clearing `config.sourceChannelId`).
4. **The live operator cursor in the engine view** — Claude's cursor moving across channels as it
   works (the cursor exists in channel-flow today; the engine overview is read-only).
5. **Open-a-prospect** depth — descend from a channel into a Person's cross-channel record (Attio
   pattern from the grounding pass).
6. Reference-standard pass + responsive: mobile is desktop-canvas-pan today (internal tool); a real
   narrow-viewport pass is the eventual ship gate.
