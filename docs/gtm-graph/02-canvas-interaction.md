# 02 — Canvas & Interaction

**Status:** spec, from locked doctrine · **Date:** 2026-07-02 · **Binds to:** `00-DOCTRINE.md` (doctrine wins on conflict)

```
Cold open:    prefilled graph, strongest current testable path highlighted
              (exactly one lit in phase 1), weak links marked.
First spray:  broad and shallow across signals, market, product gaps, offers,
              channels, messages, proof, measurement gaps.
Run altitude: founder compiles a whole path; Drover decomposes it into tasks,
              assets, patches, gates, and measurement.
Gate:         visible inline checkpoint on outward/action edges, backed by
              action-level approval objects.
Scope:        write the north-star, mark the phase-1 slice — scan → spray →
              graph → highlighted path → inspect weakness → compile run →
              gate → staged execution → measurement contract.
```

This spec covers what the founder **sees and does** on the one graph: the cold open, path highlight, card vocabulary, inspect/drill-down, break-down and fold, swap, lenses, per-card preview runs, the compile affordance, and the command bar. It does **not** define node/edge schemas (see `01-object-graph`), how the spray/edges/weakness/repairs are computed (see `03-intelligence`), what compile produces or how the gate clears (see `04-runs-and-wall`), or the code teardown sequence (see `05-migration`).

**Phase marking.** Every section is tagged `[P1]` or `[NS]` (north-star, deferred); the marks match 00 §Scope, the single source. Phase 1 = cold open, strongest-testable-path highlight (exactly one lit), click-to-inspect, compile-to-gate, plus the default view and the weakness lens (doctrine locks weakness one click from the cold open). Deferred = full interactive path editing and multi-path chips, the remaining lenses, drill-down, swap mode, per-card try-one, break-down/fold as restructure.

---

## 1. The differentiator, stated as a design constraint

This canvas renders a **reasoning graph** — claims about the market and the product, each carrying its evidence and its weakness — not a workflow builder. Every interaction decision below is checked against that line. The concrete consequences:

- Nodes are **claims and objects** ("Series-A dev-tool founders churn at onboarding", "the repo proves webhook delivery", "cold email via founder's inbox"), never steps ("Step 3: HTTP request"). A step chain only appears *after* compile, below the strategy altitude, as the run's decomposition.
- Edges are **typed causality** (`supports`, `weakens`, `leads_to`, … — a closed union per 01/doctrine locked decision 6), machine-drawn (per 03). The founder never hand-wires a causal edge, full stop: his edge surface is confirm / swap / challenge from the inspect dock (§6), and there is no edge-creation drag handle on typed nodes. (The manual empty-graph mode is a separate, explicitly-labeled surface — its wires are not part of the causal graph.)
- Truth is load-bearing UI: the evidence chip and the weakness read are on every typed card at every zoom level that shows a card face. A card with no evidence *looks* like a card with no evidence.
- The substitutability test applied to the whole screen: a stranger expecting "n8n for marketing" should be wrong within one second — because the first frame is a lit argument through a claim map with one soft spot named, not a trigger-action ladder with a Run button.

How we sit against the shipped comparables (referenced deliberately, then broken from):

| Shipped pattern | What we take | Where we break |
|---|---|---|
| **Runway** — loose cards, each with its own Run | Per-card cheap "try one" (§9); cards as peers on an open ground, not slots in a rail | Their cards are generation tasks; ours are claims — most cards have *no* run affordance at all, only executable-layer cards do |
| **Zapier Canvas** — chunk cards with Show-details expanders | Chunks with one-line faces; detail on demand | Their expand is a **peek** (read-only detail); our break-down is a **restructure** — children become first-class rewireable nodes (§7) |
| **Langdock / Copy.ai** — "Describe your workflow" bar builds/edits the flow | A plain-language bar as the primary driver (§11) | Theirs builds a workflow from nothing; ours interrogates and steers a graph that already exists — the answer to a sentence is a highlight, a lens, or a proposal ghost, not a fresh flow |
| **StackAI** — side agent reviews your flow, suggests improvements | Standing critique of the graph | No side reviewer panel: weakness renders **on the nodes themselves**, derived from signals (03), with the repair verb on the card — the graph is the review |
| **Tines** — per-node receipts/grounding panel | Hover-to-receipt on every evidence chip (§5.3) | Their receipts are run logs; ours are provenance captured at generation — `file:line` citations, market sources, founder statements, with inferred visibly distinct |

---

## 2. Cold open `[P1]`

The first session, felt, in order:

1. Founder points Drover at a repo. The canvas is already on screen — dotted ground, empty — and the scan renders **as the graph materializing**: capability cards land as the scanner cites them, market cards land as research resolves (03 owns what arrives; this spec owns that arrival is *visible*). Cards drop in with a short transform/opacity land (`--dur-base`, `--ease-out`), newest area kept in frame by a slow camera drift. A thin status line above the bar shows the current substep and elapsed time — the `OperatorDriveState` trail pattern, relocated, never an anonymous spinner.
2. When the spray settles, one camera move: fit-to-graph, then the **strongest path lights** (§4) — edges inking in along the route over ~600ms, source → outcome direction, so the eye reads the argument in causal order. This is the only choreographed moment in the product; everything after is input-triggered.
3. A one-line path header docks to the top edge (opaque, `--surface`, hairline bottom border):
   > **Strongest testable path** · trigger-based cold email to platform-eng leads · grounded 7 of 9 · weakest: message has no proof — *inspect*
   Plain words, no scores-as-percentages; strength reads as evidence ratio and precedent, never a confidence number. The header says *testable*, never "path to revenue" — with only product and market sprayed, this is a strategy-level bet worth testing (00 locked decision 1). Phase 1 lights exactly one path (03 §7.3).
4. Weak nodes across the whole graph carry their amber weakness read (§5.4) — visible, not shouting. The weakness lens is one click on the lens rail (§8). An empty graph is manual mode only, reached explicitly, never the default landing.

First impression is exactly the doctrine's sentence: *Drover already did work; here's the best current path; here's where it's soft.* The cold-start goal launcher (`GoalLauncher.tsx`) and the ~3-minute opaque drive-state as front door are gone (05); their watchable-trail machinery is reused here and at compile (§10).

**Cold-open floor states:** scan still running → the materializing graph *is* the loading state. Scan failed/blocked → the trail freezes in place with the reason and a Resume affordance (reuse `OperatorDriveState`'s stopped state verbatim). Repo too thin to spray → honest copy on the ground: "Not enough product signal to propose a path — here's what the scan found" plus the loose cards it did get. Never a fake path.

---

## 3. The global graph view `[P1]`

One React Flow (`@xyflow/react`) surface. Honest reuse framing (§13): the existing `GraphCanvas` contributes the **substrate only** — pan/zoom, dotted ground (`--canvas` / `--canvas-dot`), camera `panTo` tokens, the shipped coin→card LOD pattern. The object-graph renderer itself is **mostly new build**: today's `GraphCanvas` is bound to the execution `GTMGraph` (lanes, gate blooms, contracts, run results), none of which carries over as-is.

- **Arrangement is loose, not laned.** The doctrine's domain list (External → Market → … → Learning) reads top-to-bottom as gravity, not as swimlanes: layout biases each domain's cards toward its band, but nothing is clipped to a lane, there are no lane headers, no lane borders. It should feel like a well-kept desk, not a spreadsheet. (The current `multiPipeline` lane-merge dies — a pipeline is a lit route, not a lane. See 05.)
- **Everything visible, one thing loud.** Default register for non-path cards: `--line` border, `--muted` title ink, edges 1px `--ghost`, no arrowheads. Lit-path register: full card ink, edges 1.75px `--ink` with arrowheads. Doctrine: everything can live on one graph; not everything should be equally visible at once.
- **Zoom = altitude.** Far out, cards collapse to the shipped coin LOD (type glyph + state dot); the lit path stays legible as a route even at coin scale — the one thing that never recedes. Mid zoom shows card faces (one-liner + chips). Close zoom is where footers, receipts, and per-card affordances appear. Semantic zoom is the overflow answer: 150 nodes is a normal graph here, and it must stay readable without a minimap-first workflow (a minimap exists, bottom-right, monochrome, but is a convenience, not a crutch).
- **Selection & keyboard.** Click selects and opens inspect (§6). With a path lit, ←/→ walk the path node-to-node (camera follows), ↑/↓ jump between lit paths `[NS — one path in phase 1]`, Enter inspects, Esc folds/deselects, ⌘Enter compiles the lit path. Every focusable element has visible focus.
- **Layout ownership.** Node positions are projection state, not knowledge: this spec owns a **per-project layout sidecar keyed by node id** (drag persists there; 01's store carries no geometry — 01 §2).

---

## 4. Pipeline highlight `[P1]`

A pipeline is a highlighted route through the graph — 1 to 3 lit at once, never more, never all equally.

- **P1 (primary):** 1.75px solid `--ink` edges, arrowheads, cards at full register, path header docked (§2.3).
- **P2 / P3 (alternates) `[NS]`:** 1.25px solid and 1.25px dashed `--ink-2` respectively — distinguished by stroke weight and pattern, never by hue (color stays reserved for state). Each carries a small chip at its origin (`P2 · community wedge`). Clicking a chip promotes that route to P1; the previous P1 demotes with a crossfade, no re-layout.
- **Where paths come from:** 03 proposes them; phase 1 ships exactly one machine-proposed strongest path. The founder changing a path's *membership* (add/remove/reroute nodes by hand) is full interactive path editing — `[NS]`, deferred. Phase 1 path interaction is: walk it, inspect it, compile it.
- **The weakest link on the lit path** gets the loudest weakness treatment on screen (§5.4) — the path header names it and clicking the name flies the camera there. Strength must read as *where the argument is thin*, not as a leaderboard score. (The bets-map leaderboard is dead; 05.)

---

## 5. Card vocabulary `[P1]` (spray is P1; some affordances on cards are NS as marked)

One family of cards. All opaque `--surface`, `--line-2` hairline border, `--r-md`, `--shadow-card`, Geist. **Color is reserved for state** — domain and type identity carry zero hue. Banned outright (slop tells + house rules): colored side-tab borders, gradient anything, icon-tile-above-heading composition, glassy card bodies, the Sparkles icon.

### 5.1 Domain & type — identity without color
Top-left micro-eyebrow, `--text-xs` mono uppercase `--muted`: the **type**, not the domain (`ICP` · `TRIGGER` · `MESSAGE` · `PROOF` · `PRODUCT GAP` · `CHANNEL` · `METRIC` · open list per the anti-cage rule). A single 14px monochrome glyph sits before it. Domain is felt through position (the gravity bands, §3) and never labeled on the card. The card face is the object's one-line statement in `--ink`, `--text-base` — real content from the spray, never a generic node name.

### 5.2 Lifecycle layer — maturity as weight (doctrine: altitude = maturity)
- **Loose / raw:** dashed `--line` border, no evidence chip yet, eyebrow reads its raw kind (`SIGNAL` · `HUNCH` · `QUOTE` · `NOTE`). Feels like a note pinned to the desk. Spray output is wide and shallow: dozens of these plus shallow typed cards, one line each, depth only on click or compile.
- **Structured / typed:** solid border, eyebrow + statement + a footer row holding the evidence chip and (when present) the weakness read. This is the graph's default citizen.
- **Execution:** typed card plus a footer **action rail** — the only cards with any run affordance (try-one §9, or their compiled-run status). Slightly heavier border (`--ghost`).
- **Outcome:** number-forward — the metric in tabular figures (`font-variant-numeric: tabular-nums`) as the face, the statement demoted to the eyebrow line. Outcomes are truth; they get no weakness read and no edit affordance.

### 5.3 The evidence chip — the truth layer, on every typed card
Bottom-left footer chip, mono `--text-xs`. The chips map explicitly onto 01's solidity ladder (the counts are 01's read-time `sourceCount`, never a stored copy):

- `scan ·3` — solidity **observed**: grounded in the repo, count of citations
- `market ·2` — solidity **researched**: grounded in researched sources
- `founder` — **founder-stated** provenance (its evidence-axis solidity is usually `speculative` until sources attach; the chip names the provenance honestly, not a defect)
- `inferred` — solidity **inferred**: model inference, and it **looks different**: italic label, dotted chip border, `--faint` ink. Inferred must be distinguishable from grounded at a glance, at mid zoom, without hover.
- `speculative` — a written-down guess with no sourced evidence (01's structural demotion): same faint register as inferred, its own label.
- `unsupported` — solidity `null`, no evidence at all: the chip renders as an honest hollow state, distinct from speculative (a guess someone at least wrote down).

Hover (or focus) opens the **receipt popover** — opaque, `--shadow-pop`, never translucent: the actual `file:line` excerpts, source links with dates, or the founder's original words, captured at generation time. This is the Tines-receipt move applied to reasoning instead of run logs, and it is the single highest-leverage anti-slop element on the canvas: every claim can be interrogated where it stands. Evidence values come from 01/03; this spec fixes that they are always-visible chrome, not a detail view.

### 5.4 The weakness read
Derived only (doctrine: seeded weakness is banned). The card reads from 01's computed `weaknessReport { kind → fired | clear | unmeasured }` (01 §6.2, computed by 03 at read time) — so the UI can tell **clean** (detector ran, found nothing) from **blind** (`unmeasured`: no signal, or the detector is deferred). `unmeasured` means exactly one thing everywhere: the honest no-signal blank — it is never a fired weakness label. In phase 1 the `specificity` and `performance` kinds always read `unmeasured` (their detectors are north-star). Rendering, quiet → loud:

1. **Default view:** a small amber (`--gap`) dot in the footer plus the fired weakness kind in one word: `thin evidence` · `too broad` · `no product proof` · `no attribution` · `no list` · `not converting`. No red, no wash, no badge stack. (`unmeasured` kinds render as a quiet blank in the inspector, never as an amber read.)
2. **Weakest link on the lit path:** an attached amber pill *below* the card (outside its border — never a colored border on the card itself): `weakest link — message has no proof · find proof`. The repair verb is part of the read; weakness always arrives holding its fix (repairs generated per 03).
3. **Weakness lens (§8):** the full amber treatment graph-wide, sorted loud.

Amber is the product's one "needs you" color and this is its meaning everywhere; `--danger` red is reserved for failures of the machine (a run error), never for weakness of an idea.

### 5.5 The outward card — "this can leave the building"
Any execution card whose action crosses the wall (send, publish, patch, CRM write) is the one structurally distinct card in the vocabulary: a **dark ink header band** (`--primary` bg, `--on-primary` text) naming the external surface in plain words — `REACHES OUTSIDE · Gmail` · `REACHES OUTSIDE · production deploy` — with a shield glyph. Dark is the product's irreversibility register (it's the Run/Deploy button color); spending it here and almost nowhere else makes the wall legible at any zoom. Its outbound edge carries the **inline gate checkpoint**: the edge visibly passes through a gate mark (shield on a hairline crossing), amber while approval is pending, ink once blessed on the autonomy ladder. The gate's review payload, approval object, and ladder mechanics are 04's; this spec fixes only that the checkpoint lives *on the edge, in the graph* — the monolith gate-review screen is gone, and the existing `GateReview` bloom + `gatePromote` ladder UI re-mount at this edge (05).

---

## 6. Click-to-inspect & drill-down

### 6.1 Inspect `[P1]`
Click a card → the camera eases it into comfortable frame and the **inspect dock** opens: the existing bottom-dock pattern (opaque, full-width, ~40% height, hairline top border — the shipped `NodeCardEditor`-in-bottom-dock bones, re-skinned to this vocabulary). Contents, in order: the statement, full evidence receipts (expanded, not popover), the weakness read with its suggested repairs as buttons (suggestion generation per 03 §4; a compilable repair executes as a repair run through the wall per 04 §3.1), typed edges in plain sentences — "**supports** 'founders feel churn pain' · **targets** 'platform-eng leads'" — each sentence a navigable link (find-references reused as causality traversal), and lifecycle provenance (what produced this card, what it has produced). Challenging or retyping an edge happens here, as a proposal the machine re-draws — the founder confirms, swaps, or challenges; he never drags wires (doctrine).

### 6.2 Drill-down tree `[NS]`
From inspect: **Break down** expands the node into its decomposition tree in place on the canvas — ICP → segment → persona → title → trigger state → exclusion (children generated per 03). Felt: the card holds its position and becomes a **chunk frame** — a dashed hairline group frame whose header is the original one-liner — while children card-land inside it with a short stagger. Neighbors shove aside smoothly; nothing teleports.

### 6.3 Break-down is restructure, fold is repack `[NS]`
The children are **first-class typed nodes**: individually inspectable, individually weak, individually swappable, individually addressable by paths and compiles — a path may route through one child and ignore its siblings. External edges re-attach to the specific child they actually concern (machine re-drawn, per 03). This is the hard break from Zapier's Show-details: their expander is a window; ours changes what the graph *is*.

**Fold** (frame-header control, or Esc with the chunk focused): children collapse back into the single chunk card; external edges re-aggregate to the chunk; child state survives folding — a weak child marks the folded chunk with its weakness read, so folding never hides softness. The graph should feel breathable: break open to work, fold to think.

---

## 7. Swap mode `[NS]`
On any weak card, from its repair verb or the inspect dock: **Swap** fans 2–4 candidate replacements beside the card (generated per 03) — same type, each a real shallow card with its own evidence chip, rendered in the existing **proposal-ghost** register (the `proposedNodeIds` dashed/ghost treatment, reused). Picking one commits it: edges re-typed by machine, the replaced card slides into a small **retired stack** behind the new one (one-click revert; decisions are data, and retired cards feed taste per 03). Scoped swaps per the doctrine's repair table: swap message / channel / trigger, narrow ICP, strengthen proof, add measurement. Swap never opens a form-editor; it is always choose-among-real-cards.

---

## 8. Lens modes — one graph, re-weighted
A lens changes emphasis, never contents or layout. No re-layout on lens switch — only register changes (ink, chip size, what's loud), `--dur-base` crossfade. Lens rail: a compact segmented control top-right (reuses `SlidingTabs`), plus lens names as command-bar words (§11).

- **Default** `[P1]` — as specced above.
- **Weakness** `[P1]` — weakness reads enlarge to pills on every weak card, clean cards recede to the faint register, the path header re-sorts to "the N soft spots, worst first" and clicking each flies to it. One click from cold open (doctrine lock #1).
- **Evidence** `[NS]` — evidence chips enlarge, inferred cards render hatched-border, grounded counts become the loudest element; a footer meter gives the graph-wide grounded:inferred ratio.
- **Execution** `[NS]` — execution- and run-layer cards to full ink, market/strategy recede; gates, staged assets, and connector status foregrounded.
- **Revenue** `[NS]` — paths re-weighted by dollar-linked outcomes; edges on money-carrying routes annotate with tabular figures; everything unattributed recedes and *says so* (`unmeasured`) rather than showing zero.
- **Product-gap** `[NS]` — product-gap and measurement-gap cards loud, with their blocked edges (`blocked_by`) drawn emphasized.
- **Learning** `[NS]` — belief-update and path-score cards loud; recent outcome-driven changes to the graph get a "changed since last run" tick mark, making the flywheel visible.

The old board/engine lens surfaces and `GroundLens`/`BeliefSpine` altitudes collapse into this rail (05); their belief/health math survives underneath as the weakness engine's seed (per doctrine's keep-list, wiring per 03).

---

## 9. Per-card "try one" `[NS]`
Every execution-layer card carries a small `try one ▸` affordance in its action rail (the Runway move: the card is its own runnable unit). It runs the node once against a single sampled input — one contact enriched, one message drafted for one real person, one page rendered — cheap, local, staging-only. The result lands as a **receipt row** inside the card footer: `tried 1 · draft ready · 0:12`, click-through to the artifact in the inspect dock. Try-one on an outward card produces a *staged preview only* — the wall is not consulted because nothing approaches it (invariant owned by 04). Purpose, felt: the founder can poke any single piece of the machine and see real output in seconds, without compiling anything — confidence built card by card.

---

## 10. Compile-path `[P1]`
The path header (and the path's terminal card) carries the one dark pill on the canvas chrome: **Compile run**. Founder chooses the bet; Drover decomposes the work (doctrine lock #3; decomposition contents per 04 §1.3, the model call per 03 §8). The compile is the product's second choreographed moment and it reuses the watchable-drive pattern: the lit path stays in frame while its decomposition **streams onto the canvas below the strategy altitude** — audience list, assets, product patch, measurement contract, gate — cards landing as they're composed (task steps are not streamed as cards: they live inside the run node as its drill-down decomposition, per 04 §4), steps checking off in a docked trail with elapsed time, a Stop affordance, and honest stall copy past the expected window (all lifted from `OperatorDriveState`, which dies as a standalone screen and lives on as this trail). The stream ends at the inline gate checkpoint (§5.5) with its review payload blooming on the edge — the founder's decision point, specced in 04. Something usable renders before the run finishes, always; spinner-then-reveal is banned.

---

## 11. The command / lens bar `[P1]`
The `ComposerDock` demotes to a single bottom bar: opaque, one input row, Geist, voice input kept (already shipped). It is the plain-language driver *over* the graph — Langdock's "describe it" posture pointed at steering instead of building. Utterance classes, each answered by a **graph act first, words second**:

- **Camera / focus** — "show me the weakest part" → flies + selects; "where does revenue actually come from" → lights the evidence-bearing route.
- **Lens** — "evidence" / "show weakness" → lens switch. `[P1]` for the P1 lenses.
- **Question** — "why is this the strongest path" → the path re-lights link by link while a short note card (opaque, dismissible) states the argument with its receipts; never a chat wall over the canvas.
- **Edit / repair `[NS]`** — "narrow this ICP to Series A" → proposal ghosts render on the graph (reused `proposedNodeIds`/`proposedEdgeIds` mechanics) with inline ✓/✕; routed through 03.
- **Compile** — "run the cold-email path" → §10.

Responses that need prose get one card, not a transcript; conversation history lives behind a small flyout for the founder who wants it. The bar's placeholder rotates *real* utterances from this list. Interpretation and routing of utterances is 03 §9 (code answers nav/lens verbs; one lean model call handles questions and, at north-star, edits); this spec owns that the bar's output is always something happening **on the graph**.

---

## 12. States floor (stage-independent, all `[P1]`)
- **Empty** — manual mode only (explicit choice): dotted ground, one honest line, the bar focused. Never the default landing. Manual mode is a **separate, explicitly-labeled surface**: anything wired by hand there is not part of the causal graph and never enters path scoring (01 §3.1) — the causal graph's edges stay machine-drawn even here.
- **Loading** — the materializing spray (§2); compile streaming (§10). No anonymous spinners anywhere on this surface.
- **Error / blocked** — frozen trail + reason + Resume, in place (§2). A failed try-one or compile marks its card with `--danger` and the plain reason; red means the machine failed, never that an idea is weak.
- **No weakness found** — says why: "no runs yet — weakness needs signal", never a green all-clear.
- **Overflow** — semantic zoom + coin LOD (§3); the inspect dock and receipt popovers scroll internally; the canvas never scrolls horizontally as a page.
- **Keyboard & focus** — §3 bindings; visible focus on cards, chips, edges' gate marks, bar. Motion is transform/opacity only, input-triggered, `prefers-reduced-motion` collapses the two choreographed moments to instant states.

---

## 13. Reuse vs. replace (component-level; teardown order in 05)

**Reused — with the reuse stated honestly**
- `GraphCanvas.tsx` — **React Flow SUBSTRATE reuse only**: pan/zoom, dotted ground, `panTo` camera tokens, the coin→card LOD pattern, node-drag persistence. The object-graph renderer is **mostly NEW**: the current component is bound to the execution `GTMGraph` — its lane merging, gate blooms, contract chips, and run-result rendering do not transfer. Expect a new node/edge component set built to §5's vocabulary on the same substrate, not a re-skin.
- `gate/GateReview.tsx` + `gatePromote` (autonomy ladder) — re-mount on the inline edge checkpoint (§5.5, owned by 04). The wall UI is never blind-ripped.
- Proposal-ghost mechanics (`proposedNodeIds` / `proposedEdgeIds` / `onResolveProposal`) — become swap candidates (§7) and command-bar edit previews (§11).
- `OperatorDriveState.tsx` — dies as a screen; its trail, elapsed clock, honest-stall copy, and stopped/resume states are lifted verbatim into the cold-open scan (§2) and compile stream (§10).
- `ComposerDock.tsx` — voice input, `MarkdownLite`, session-event plumbing survive inside the demoted command bar (§11); its candidate-picker overlay dies (candidates become cards).
- `CanvasShell` / `SlidingTabs` — become the lens rail (§8). `ReferencesPanel` / find-references — becomes edge-sentence traversal in inspect (§6.1).
- `index.css` tokens — unchanged; this spec introduces zero new colors and no new type sizes. The one new register is the dark header band on outward cards, built from `--primary`/`--on-primary`.

**Replaced / dies** (full list and sequence in 05)
- `GoalLauncher.tsx` as front door → cold open (§2).
- `IdeaReview.tsx` overlay → ideas are loose cards.
- `GroundLens` / `BeliefSpine` / board & engine lens surfaces → lens modes (§8); their belief math survives underneath (03).
- Bets-map / map-lens leaderboard → path highlight (§4).
- `multiPipeline` lane merging + `ChannelSwitcher`'s lane framing → pipelines are lit routes, not lanes (§3, §4).
- The monolith gate-review screen → inline edge checkpoint (§5.5 / 04).

---

## 14. Phase-1 checklist (this spec's slice of 00 §Scope)
1. Cold open: scan-materializing spray, fitted camera, the one strongest testable path lit, path header, weak nodes marked (§2, §4).
2. Card vocabulary shipped for loose + typed + execution + outcome layers, with evidence chips, receipt popovers, weakness reads (§5).
3. Outward-card register + inline gate checkpoint rendering (§5.5; behavior in 04).
4. Click-to-inspect dock with receipts, edge sentences, repair display (§6.1).
5. Default + weakness lenses (§8).
6. Compile-path affordance with the streaming decomposition to the gate (§10).
7. Command bar: camera, lens, question, compile utterances (§11).
8. Full states floor (§12).

Deferred to north-star: interactive path editing and multi-path chips (§4), break-down/fold restructure (§6.2–6.3), swap mode (§7), evidence/execution/revenue/product-gap/learning lenses (§8), try-one (§9), command-bar edits (§11).
