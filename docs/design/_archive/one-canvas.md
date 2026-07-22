> **SUPERSEDED.** This altitude-and-pipeline canvas is design history. Current product and design
> authority lives in [FIRM-SPEC.md](../FIRM-SPEC.md), [STATE.md](../STATE.md), and the root
> [DESIGN.md](../../DESIGN.md).

# One canvas — the altitude ladder (historical flows redesign)

Chosen 2026-07-01. Collapses the four fighting flow surfaces (9-layer belief board, engine
lens, single-pipeline flow, chat build-room) into ONE canvas navigated by zoom. Belief is folded
into the flow: it's the high-altitude face of a pipeline object; the mechanical step is its
low-altitude face — one object model, `board.mjs` health math reused, not a second map.

Reference mockup: `docs/mockups/one-canvas-altitudes.html` (real tokens).

## The four altitudes

- **L0 ground** (overview landing) — every pipeline as a transit line; conviction = ink darkness +
  stroke weight (never hue); shared People/Claims are junctions between lines; an amber "needs you"
  pill is the only accent; an ink "now" dot travels a live pipeline. Pipelines group under the ICP
  they test (one honest primary ground today — see follow-up 1).
- **L1 belief spine** — the old 9-layer board scoped to ONE pipeline: Who·trigger / What you say·
  positioning / Who you reached·people / Did it work·measure / Verdict·learn, each with a real
  confidence bar + status chip (validated green / testing amber / blind gray). Honest-blind on no signal.
- **L2 flow** — the executable graph Source→…→Gate→…→Measure, unchanged GraphCanvas.
- **L3 gate bloom** — the gate node opens its staged items in place: draft, provenance, ✓Approve /
  ↩Return-as-draft / Edit; pattern-cleared items collapse to an "N cleared" receipt, exceptions bloom.
  Reuses the existing approval handlers — no new send path.

## Brand

Project skin (NOT the warm-calm house default): `--canvas #fafafa`, `--surface #fff`, `--ink #18181b`
zinc, hairline `--line #ececec`, Geist + Geist Mono. Amber `--gap #d97706` = the gate, the only accent.
`--proven` green / `--danger` red / `--blind` gray by meaning. No gradients, no glass, semantic color only.

## Mobbin grounding

- WRITER Blueprints — node canvas + minimap + right inspector: https://mobbin.com/screens/81cd6c18-8a33-4afe-b452-9eb5dbb75534
- Relevance AI Workforce — agent cards + dashed context edges: https://mobbin.com/screens/26027c63-b199-4fa1-8c42-c33ebd0fe954
- Indeed Review recommendations — the L3 gate-bloom model (annotation + inline approve/reject + original diff): https://mobbin.com/screens/4d0ea170-10e3-4241-ad05-0c11120f5a72
- ClassDojo Needs Review — "Approve / Return as draft" beside the artifact: https://mobbin.com/screens/8767e826-c7af-478c-a797-8a02b71f4006

## What shipped (verified live on :5173, real RodentRadar data)

Built by a 4-workstream agent workflow (backend spine projection, L1 renderer, gate bloom, L0 ground),
integrated by hand. All four altitudes render on real data. 885 brain tests pass, ui lint + build green.

- `brain/src/board.mjs` — `getPipelineBeliefSpine` (5-face spine, keyed `faces`) + `getPipelineIcpGrouping`; `server.mjs` GET `/api/projects/:id/pipelines/:channelId/spine` + `icpGrouping` on the board payload; 11 new tests.
- `ui/src/lib/beliefSpine.ts` + `components/lenses/BeliefSpine.tsx` (+ css) — L1.
- `ui/src/lib/groundModel.ts` + `components/lenses/GroundLens.tsx` (+ css) — L0.
- `ui/src/components/GraphCanvas.tsx` + `lib/gateItem.ts` + `styles/canvas-gate.css` — L3 gate bloom.
- `ui/src/components/canvas/GtmCanvas.tsx` — integration: overview lens repointed to GroundLens (id
  kept "board"; `GtmBoard.tsx` retained on disk, no longer the landing); BeliefSpine mounted above the
  flow in ChannelFlowLens (interim L1-over-L2 stack until the continuous-zoom LOD backbone lands).

## Known follow-ups

1. **Multi-ICP grouping is not real yet.** `ChannelMeta` has no ICP link, so L0 shows one flat primary
   ground even though the founder runs experiments across ICPs. Real per-ICP bands need a backend
   channel→ICP association (experiment `targetLayer: icp/market` is the seam board.mjs already derives).
2. **L1 band polish** — the spine band is tall (~42% cap) and long positioning text clips; the
   confidence bar/status chip sit below the fold. Wants per-card truncation + a compact height.
3. **L0 title == subtitle** — positioning line falls back to the ICP label; differentiate or drop.
4. **Continuous-zoom LOD backbone** — today altitude still switches on channel state (board↔channel-flow)
   and L1 is a stacked band, not a true zoom transition. The one-renderer LOD is the remaining spine.
