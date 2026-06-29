# Living pipeline — integration plan

The canvas becomes a living strategy map: conditional logic is a readable node, conviction
is visual weight, what's live moves, retired work collapses, and a Strategist proposes
promote/prune/conflict changes the founder gates. Grounded in the real design system
(`DESIGN.md`): light, monochrome ink, amber owns the gate, Geist, restrained motion.

Mockups: `docs/mockups/transit-real-system.html` (home surface, real tokens) and
`docs/mockups/switch-node.html` (the switch primitive in cards).

## Why it's doable

The architecture already has the seams. The engine fans out today; the wall already walks
all paths; the gated-proposal pattern already ships (ToolForge). This is mostly filling in
declared extension points, not refactoring.

## The translation rules (design doctrine)

The diagram language is skin-independent. In the real system:
- **Conviction** → ink darkness + stroke weight, never hue (mono makes this stronger).
- **"Now"** → a moving ink dot on the live edge (causality motion), never a glow.
- **Switch** → neutral ink node with a 2px ink left-accent; rule in Geist Mono. Logic is
  automatic, so it is never amber.
- **Gate** → amber, 2px amber left-accent, the only accent on the canvas. Unchanged.
- **Promote / retire / conflict** → proven-green / ghost / danger, the existing semantics.
- **Subway/transit** is the far-zoom overview lens only. Cards stay the primary canvas.

## Three features

1. **Switch node** — conditional routing as a first-class node kind.
2. **Living grammar** — edge conviction-weight, moving-dot tense, retired-collapse.
3. **Strategist** — gated promote/prune/conflict proposals derived from run state.

They are independent. Ship the switch first; it's the most bounded and highest value.

---

## Phase 0 — Doctrine + data model (additive, no behavior)

- Land the translation rules above into `DESIGN.md` / this doc.
- `graph-operations.mjs`: add `"switch"` to `NODE_KINDS` (`:21`); add optional `switch`
  category (`:3`).
- Edge model: persist an optional `predicate` on edges in `connect_nodes` (`:205-211`);
  validate shape in `validateGraph` (`~:120-129`) — `{ field, op?, value? }`, all else rejected.
- UI types: add `conviction?: number` to `GTMEdge`.
- Pure additions. `npm test` stays green; no run behavior changes yet.

## Phase 1 — Switch node, engine (the core primitive)

- `step-runners.mjs`: add `"switch"` to `STEP_KINDS` (`:17`); export
  `evaluateSwitchPredicate(item, predicate)` reusing `applyPredicate` (`~:160`).
- `graph.mjs`: the one real change — `resolveUpstream` (`:186`) filters an incoming edge's
  items by `edge.predicate` when present, else merges as today. Non-switch flow is untouched.
- `composition.mjs`: add `switch` to the node menu (`:42-44`) with doctrine on WHEN to use it
  (a real runtime branch on per-item state, not two hand-wired agents).
- Wall: no change. `assertGateWall` (`workflow-composer.mjs:118-141`) already DFS-walks all
  paths; a switch downstream of the gate passes, an ungated execute past a switch is rejected.
- Gate continuation: verify the staged items reused at the gate are the ROUTED items, not
  re-routed live (the existing "reuse exact prepared items" invariant must hold per branch).
- Tests: `brain/test/` — switch routes items by predicate; a graph with a switch still passes
  the wall; gate continuation reuses routed items; `anti-cage.test.mjs` still green (switch is
  an open kind, not a closed enum).

## Phase 2 — Switch node, canvas (visible + editable)

- `GraphCanvas.tsx`: `SwitchNodeComponent` + register in `NODE_TYPES` (`:879`) and
  `nodeType()` (`:886`). Collapsed card shows rule pill + live branch split; selection opens
  the focus-expand editor (plain-language rule, per-branch split bars, blind-honest empty
  branch). Reuse `NodeCardEditor` mount on selection.
- Editing the rule → typed graph mutation that writes the edge predicates (validated, reversible).
- CSS in `canvas-refine.css`: `.switch-node` (2px ink left-accent), rule pill, branch rows.
- Verify in browser: card renders, routes on a real run, edit re-routes, never sends.

## Phase 3 — Living grammar (the visual language)

- Conviction-weight: derive per-edge volume from the run ledger (`engine.mjs:40-144`, per-node
  item counts mapped to outgoing edges); add `conviction` to the edge builder so `edgeStyle`
  returns `style.strokeWidth` (`GraphCanvas.tsx:894`, `:1049-1085`).
- "Live now": extend the existing `animated` active-edge path (`:1082`) with a moving-dot CSS
  keyframe (`.loop-edge-live-now`).
- Retired-collapse: `retired?: boolean` on node data; `RetiredNodeChip` renders a count instead
  of the full card; restore on click.
- Verify: a busy multi-branch graph reads with weight hierarchy + live motion, stays legible.

## Phase 4 — Strategist (gated curation)

- `curation-store.mjs` (new) — mirror `feedback-ledger.mjs`: load/save, record proposal,
  dedupe by `(branchId, type)`, `pendingCurationProposals`, `resolveCurationProposal`.
- `curation-engine.mjs` (new) — three detectors from real run state:
  - `detectDeadBranches` — zero volume / consistent errors over N weeks.
  - `detectSpinePromotions` — a branch beats the spine on the same variable, with sample.
  - `detectCrossChannelConflicts` — reuse `dedupeAcrossChannels` (`cross-reference.mjs:366-430`)
    + Person appearances + this-week filter. (Ship this one FIRST — it's already derivable and
    unambiguous.)
- `operator-runtime.mjs`: add `propose_curation_changes` tool, mirroring `propose_graph_changes`
  (`:1512-1541`) — pauses, founder resolves. Exposed on both front doors (it's safe, not a
  send/approve verb, so it passes the `operator-mcp.mjs` filter).
- `server.mjs`: `POST /api/projects/:id/curation-proposals/:id/approve`, mirroring the
  tool-birth route (`:403-420`).
- UI: a "Strategist" rail reusing `ProposalControls` (`GraphCanvas.tsx:299-382`) and the dock
  pattern; a promote/prune/conflict proposal is a gated mutation, never auto-applied.
- Verify: after real runs, proposals appear, founder approves, the mutation applies and the
  wall still holds.

---

## Invariants preserved throughout

- The wall holds: every execute has a founder gate upstream on every path (already branch-safe).
- A switch never sends — it routes; sends still require an amber gate downstream of any execute.
- Proposals never auto-apply — promote/prune/conflict are gated, like every mutation.
- Health and conviction stay DERIVED from real state (scan, run ledger, decisions) — never seeded.
- All model-made changes are typed, validated graph operations.
- No closed GTM enum reintroduced — switch is an open kind (`anti-cage.test.mjs` must stay green).

## Honest hard parts

1. **`resolveUpstream` per-edge filtering** is subtle — it must not change the merge behavior
   for non-switch edges, and must interact correctly with gate continuation (routed items are
   the ones reused). This is the one change that needs careful tests.
2. **Predicate scope** — keep it `{ field, op, value }` over the existing `applyPredicate` ops
   (eq/gt/gte/lt/exists/contains). Resist a full expression language; the plain-language editor
   maps onto this constrained set.
3. **Conviction derivation** — per-edge volume after a switch needs routed counts from the
   ledger; v1 can map per-node throughput onto outgoing edges and refine later.
4. **Strategist proposal quality** — the detectors are heuristic. Spine-promotion needs a fair
   same-variable comparison and a sample floor or it proposes noise. Mitigate with high
   thresholds + dedupe; it's gated anyway. Lead with the conflict detector (unambiguous).
5. **Composer judgment** — the model needs doctrine (in `~/.claude/agents/gtm-compose-workflow.md`)
   for WHEN a switch beats two hand-wired branches.

## Recommended start

Phase 0 + Phase 1 together: the switch primitive end-to-end in the engine, fully tested, with
no UI yet. It's the most bounded, unblocks conditional logic, and proves the one real change
(`resolveUpstream`) against the wall before any pixels.
