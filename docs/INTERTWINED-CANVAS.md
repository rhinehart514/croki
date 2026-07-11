> **SUPERSEDED AS PRODUCT DIRECTION.** This pipeline-centered canvas is implementation
> history. See **docs/OPEN-CANVAS-SPEC.md** for the current multi-goal open canvas.

# Drover — the intertwined canvas

## Vision

Today your canvas shows three stacked things: your pipelines as lanes, a separate band listing shared objects, and a board of proposed pipelines. They describe the same operation, but you have to connect them in your head. The intertwined canvas makes them one picture.

Here is how it feels. You open Drover on EstateSaleUSA and you're looking at the shape of your whole go-to-market: the kinds of motion you run — outbound, programmatic pages, AI visibility — each drawn as a cluster, and honest open space where kinds you haven't tried would sit. You zoom into outbound and the cluster separates into your actual pipelines, each one still the flow you know: your crew's steps marching left to right, ending at your gate, where nothing goes out without you.

Then you see the thing no list ever showed you. Linda Mercer, an estate liquidator in Buffalo, is drawn once — one small card — and two threads land on her. One comes from your outbound pipeline, which was about to email her this week. The other comes from your pages pipeline, because she already signed up through the Buffalo listing page it minted. She's bigger than the objects around her — the canvas swells anything two motions touch — so your eye finds her without hunting. You hover her, both pipelines light up end to end, everything else fades back, and you watch the collision: outbound is about to work someone pages already converted. Its next batch has already dropped her. You didn't open a report. The overlap is just visible, where the two threads meet at one person.

Buffalo itself is a card too — the city your pages target, your outbound filters to, your AI-visibility motion measures. Three threads land on it. That's your most contested object, drawn once, the honest center of gravity of your operation.

And the canvas isn't just for looking. A pipeline down on the canvas is a living thing you keep improving in place: drag a warm-up step in before the ask, swap a crew member, pull a branch off for non-openers, drag a thread out to the Elmwood galleries to make the motion cover them too — or just tell the crew in plain words, and the change appears on that same pipeline as a dashed proposal you accept. Every edit re-weaves the picture live: touch more of the population and the overlaps update in front of you. And no edit ever slips past you — add a step that sends anything and your gate stands in front of it, non-negotiable, every time.

That woven picture is the moat. A competitor can screenshot any one pipeline and copy it in a weekend. They cannot copy one population that many motions cross at shared people, shared cities, shared pages — because that only exists as the accumulated history of *your* motions touching *your* market. The canvas is where that history becomes something you can see, steer, and grow.

## The recommended design

**The pick: "Weave with an objects-primary altitude" — approach 4's maximum-reuse spine, with approach 1's population layout grafted on as a second projection over the same nodes.** It won the adversarial evaluation because it's the only path that is both buildable on what shipped this week and grows into the full population-as-hero vision without a rewrite. Approaches 1 and 3 need net-new force-directed layout before anything ships; approach 2 caps out with objects as second-class citizens; approach 5's metaphor is a design-bar risk. The synthesis ships intertwining in v1 and makes the population the hero in v2 — over one object model, one backend read, one canvas.

### Why it's the cleanest

Everything the canvas needs to draw is already computed. `getOperatingView` (brain/src/operating-view.mjs) already returns `lanes[]` (stages, health + provenance, runState, parked-at-gate, proposed flag, shape-derived `motionKind`, `objectKeys[]`) and `objects[]` (one record per `objectKey` via `deriveFunnel` over the touch ledger, with `kind` as an open string, `lanes[]`, `motionCount`, bucket, provenance) — the object↔pipeline join is already bidirectional through `laneKeysByObject`. The intertwining isn't new data; it's the same data emitted as one graph instead of three regions. The design adds **one thin projector and two node components**; the rest is subtraction — the stacked shared-map band and the separate candidate board retire into the one graph.

### 1. Object model (what the canvas projects)

Three node families, two of which exist verbatim:

- **Step nodes + the founder gate** — each pipeline's real `GTMGraph`, already loaded per channel in App (`channelGraphs`) and already rendered per lane by `buildMergedFlowGraph`/`computeChannelLanes` (ui/src/components/GraphCanvas.tsx, ui/src/lib/channelLanes.ts). Unchanged.
- **Shared-object nodes** — synthetic `obj:<objectKey>` nodes, one per `OperatingObject`. Kind is the ledger's open string (person/geo/keyword/page/partner/change/whatever emerges). No stored position, no stored state — bucket comes from `deriveFunnel` at read time.
- **Tie edges** — synthetic `tie:<channelId>:<objectKey>` edges from a lane's last data-producing step (or its gate) to the object node, carrying the touch's verb and run receipt from the ledger. An object touched by two pipelines has two ties converging on one node — the intertwining is the convergence, drawn once.
- **Kind clusters** — synthetic `kind:<motionKind>` nodes grouping lanes whose `engine.motion.name` matches (derived by `deriveMotionName` in brain/src/engine.mjs from real graph shape — an open string, never an enum). Derived at render, never stored.

Nothing here is a new host noun. `obj:`, `tie:`, and `kind:` are projections thrown away every render — the `deriveFunnel` discipline.

### 2. Backend projection

One new pure function, `buildWovenGraph(view)`: consumes the arrays `getOperatingView` already builds plus the per-channel graphs already in memory, emits one `GTMGraph` with the synthetic nodes and edges. Zero new stores, zero new disk reads, zero new tables. One optional field-surfacing: thread `touch.verb` and step id onto each tie so a thread can label itself ("emailed", "converted via page") and land on the exact step — data already in the ledger. `findReferences` (brain/src/cross-reference.mjs) stays the drill-in read; `dedupeAcrossChannels` stays the "handled by other motion" greying. Provenance rides through unchanged: every object keeps its receipt, every tie names the run that created it, every health number keeps its derivation.

### 3. Canvas rendering — one graph, two altitudes, two axes

One GraphCanvas instance renders the woven graph. Two layout passes over the identical nodes:

**v1 — lanes-primary (ships first).** Pipelines stack as lanes exactly as the merged canvas does today. Shared objects render as small opaque zinc chips placed at the **mean-X of their touching steps** (approach 2's rule — a prospect two motions touch late sits far right, at the causal depth where the crossing happens), in the space between/beyond lanes. Ties are thin 1px zinc curves from step handles to the chip. The gate stays a first-class node terminating every lane; a parked lane pulses its gate with one-click fly-to (existing `panTo`). Candidates are dashed lanes with dashed ties (existing `proposedNodeIds`/`proposalActive` treatment) — you see what a proposal *would* touch, overlaid on what live motions already own, before accepting.

**v2 — objects-primary (the graft, same nodes, new layout function).** The population becomes the substrate: object chips cluster into labeled regions by their open `kind` string; **node size encodes degree** (`motionCount`), so moat objects are visibly the largest with no special overlay; pipeline spines dock at the canvas edge and fan bundled ties into the population. Zoomed far out, N motions crossing one object add **zero new lines** — the node just swells and darkens one zinc step (approach 5's depth-not-lines principle, flat zinc, no water styling).

**The two projection axes are one toggle**, not two canvases: *by shared objects* (the moat view) and *by GTM type* (the spread view). On the TYPE axis, lanes of the same derived `motionKind` collapse into one cluster chip ("outbound · 4 motions"); the object gutter shows only cross-kind intertwining. A pipeline whose shape blends two kinds is drawn straddling both clusters, honestly. **The broad start opens here, fully zoomed out**: the map of GTM forms in play, plus honestly-empty space for kinds not yet run — derived from absence, never a catalog. Drill: forms map → a kind's pipelines → one pipeline → its shared objects, landing on the objects axis. Selection persists across the toggle.

**How the intertwining shows, concretely:** the outbound lane's send step touches `person:linda-mercer`; the pages lane's publish/outcome step also touches her. One chip, two ties converging, "touched by 2 motions," sized above her neighbors. Hover lights both lanes end to end; the outbound lane's next-item set visibly drops her (the `dedupeAcrossChannels` signal, already built).

### 4. Interaction

- **Read:** land on the GTM-forms broad start, drill by zoom, toggle the axis. Every derived number carries its provenance receipt on hover.
- **Pick:** click a dashed candidate lane → the existing `onResolveProposal` path → dashes go solid, ties commit, the weave updates live.
- **Edit-and-grow, first-class:** a lane in the merged canvas is a real editable graph, not a summary. Add a step (`onAddNode`), reorder/branch/wire (`onConnectNodes`), remove (`onDeleteEdges`), reposition (`onNodePositionChange`), swap crew via the agent face — all existing handlers, all typed graph mutations the host validates. Split = select a step range and split at it; merge = drag one lane's tail onto another's gate. Because the projection re-derives on every mutation, a new step's touches draw new ties immediately — growing a pipeline updates the intertwining live.
- **Wire to more objects:** drag from a step to an object chip (or a whole kind region). Guardrail from approach 1's own tradeoff: this is a **steer the composer fills in** — a proposed touch rendered as a dashed tie the crew turns into real steps — never a manual targeting list the founder maintains.
- **Plain words, same pipeline:** ask the crew ("add a warm-up email before the ask; also cover the Elmwood galleries") → the composer runs scoped to that `channelId` → the delta renders as proposed ghost nodes and dashed ties *on that lane* → accept in place. Direct manipulation and conversation are two inputs to one canvas object.
- **The gate is absolute through every edit:** `assertGateWall` already re-runs on every graph mutation (brain/src/run-compile.mjs and the mutation path) — an edit that adds a send with no upstream gate is rejected before it can render as accepted. Autonomy stays founder-promoted only; nothing on the canvas can forge it.

### 5. Legible at scale — the four load-bearing rules

1. **The 2+-touch rule:** only objects touched by 2+ motions ever draw individually; single-touch objects collapse to a per-lane count badge ("+37 touched once") that expands on demand. Visible density scales with *intertwining*, not population size.
2. **Focus-to-trace, at every altitude:** click any object or pipeline and everything else recedes to near-monochrome, leaving its crossing paths lit — `findReferences` rendered spatially. Navigate by isolation, not by reading everything.
3. **Semantic zoom by kind:** far out, same-kind lanes blend into one cluster chip and overlap shows as node weight (size/ink), not lines; zoom in and clusters fan into lanes, weights resolve into individual ties.
4. **Deterministic placement:** mean-X for object chips in v1; stable objectKey-hash seeding for the v2 population layout, so the field never reshuffles between reads and the founder builds spatial memory.

**The one honest piece of deferred engineering this forces:** `buildMergedFlowGraph` re-lays-out every lane on each render and manual drags don't yet stick across renders — with a live re-weave on every edit, that jumpiness would be felt immediately. Per-lane dragged-position persistence must be scoped in from the start, not discovered mid-build.

## All the possibilities we considered

Five full-stack approaches were generated and adversarially scored (fidelity to the vision / cleanliness / feasibility / scale / anti-cage, each out of 10). The full option field, so the pick can be overturned:

**1. Population Graph — objects are the canvas, motions are paths through them.** (10 / 6 / 5 / 8 / 9) The founder's north star drawn literally: every object a node placed once, pipelines threading through them, intertwining as topology. Best ideas: degree-as-size makes moat objects the largest with no overlay; the object↔type axis toggle. Didn't win outright because its force layout and edge bundling are net-new graph engineering unreachable from the shipped lane machinery, it de-emphasizes the per-pipeline editing read that grow-in-place depends on, and it's weak at low scale (little to weave early in alpha). Its substrate is grafted in as the v2 altitude.

**2. Pipelines primary, objects as junctions in the gutter.** (6 / 9 / 9 / 6 / 9) Keep the lane read; lift shared objects into junction cards between lanes, threaded to the steps that touched them. Best ideas: the 2+-touch rule and mean-X placement — both adopted. Didn't win because it's honestly the lowest ceiling: objects stay second-class next to first-class lanes, the opposite bias from "the population is the hero," and thread routing across many stacked lanes is its scale weak point.

**3. The Woven Field — one force-laid graph, pipelines as ribbons.** (9 / 4 / 3 / 7 / 8) Nearly the same vision as approach 1 but more expensive: it dissolves both existing lens views and throws away the shipped stacked-lanes surface from scratch, and it runs two layout systems (causal step order + force-placed objects) in one coordinate space, which tangles. Approach 1 gets ~90% of the fidelity for less demolition. Rejected as the build path.

**4. Weave — the merged GraphCanvas with objects as real nodes.** (7 / 9 / 9 / 6 / 9) Maximum reuse: synthetic object/tie/kind nodes injected into the graph the merged canvas already renders; editing reuses the verified existing handlers; the gate wall re-asserts on every mutation. Honest about being the smaller idea alone (pipelines-first, objects downstream). It's the spine of the recommendation because it ships on what exists and its object model is exactly what the v2 population layout projects over.

**5. Tideline — the population as a shoreline, motions as tides.** (8 / 5 / 3 / 7 / 6) Its one genuinely great idea — overlap as *depth*, a shared object swelling instead of new lines per crossing — is adopted as the far-zoom collapse, stripped of the water metaphor. Rejected as the frame: the tide styling is one careless step from the decorative slop the design bar bans, it's the hardest layout to build, and the metaphor thins out at exactly the single-object zoom where it should be strongest.

**The evaluation's verdict:** no single approach is complete. Approach 1 wins fidelity, approach 4 wins buildability, and they share the same object model — so build 4's spine, graft 1's altitude, and take 2's filtering rules and 5's depth principle as internal mechanics.

## Full-stack change map

**Object model — nothing new persisted.**
- Reuse: per-channel `GTMGraph` (steps + gate), the touch ledger (`listObjectTouches`, brain/src/gtm-store.mjs), `deriveFunnel` (brain/src/object-funnel.mjs) for objects-drawn-once with derived buckets, `deriveMotionName` (brain/src/engine.mjs) for kind labels.
- New: the synthetic `obj:` / `tie:` / `kind:` node and edge id conventions — render-time only, discarded every projection. Justification: they're ids, not stored objects; the alternative (persisting canvas state) is the cage.

**Backend projection — one pure function.**
- Reuse: `getOperatingView` verbatim (it already composes engine state, the efficiency table, `deriveFunnel`, pending inbox, and the `laneKeysByObject` join); `findReferences` for focus-to-trace; `dedupeAcrossChannels` for handled-elsewhere greying.
- New: `buildWovenGraph(view)` emitting one graph from arrays the view already carries; surface `touch.verb` + step id on ties (fields already in the ledger). Justification: the only alternative is three separate payloads the UI re-joins — this is a reshape, not a new read.

**Canvas rendering — one GraphCanvas, two layout passes.**
- Reuse: GraphCanvas's React Flow engine, node/edge/gate renderers, `buildMergedFlowGraph` + `computeChannelLanes` lane stacking and id namespacing, dashed proposed treatment, parked-gate pulse + `panTo`.
- New: an `ObjectChip` and a `KindCluster` node component added to `nodeTypes`; the mean-X gutter placement pass (v1); the objects-primary layout function with objectKey-hash seeding and degree-as-size (v2); the axis toggle + semantic-zoom collapse (pure view state). Justification: two components and two pure layout functions are the minimum that makes three regions one graph.
- **Scoped-in fix (not optional):** per-lane dragged-position persistence in `buildMergedFlowGraph` so live re-weaves don't discard manual drags.

**Interaction — reuse the editing bridge wholesale.**
- Reuse: `onAddNode` / `onConnectNodes` / `onDeleteEdges` / `onNodePositionChange`, the in-card node editor, agent-profile crew swap, `onResolveProposal` for candidates and for plain-words deltas, the composer scoped to a `channelId`, `run_workflow` for re-run, `assertGateWall` on every mutation.
- New: the drag-to-wire-object gesture, implemented as a composer steer (a proposed dashed tie, filled in by the crew, accepted at the same ghost-resolve path). Justification: it's the one gesture the current canvas has no equivalent for, and it routes through the existing gated mutation path rather than a new one.

**Tests.**
- New unit coverage for `buildWovenGraph` (object/tie/kind emission, 2+-touch filtering, blended-kind straddling, empty-project honesty) alongside brain/test/operating-view.test.mjs.
- brain/test/anti-cage.test.mjs stays green untouched — nothing here adds a closed enum, a stage skeleton, a stored state field, or a pre-run blocker.
- Browser-verify the loop per the repo's verification rules: goal → compose → dashed candidate → accept → run → parked gate → approve; then an in-place edit adding a send and confirming the gate lands upstream; then the axis toggle and focus-to-trace at both altitudes, against real Buffalo-Projects data.

**Retire (the subtraction that makes it "intertwined").**
- The OperatorLens stacked shared-map band (its object rows become the object chips).
- The separate candidate board (ui/src/components/canvas/CandidatePipelinesCanvas.tsx — candidates become dashed lanes in the one graph).
- The three-region OperatorLens composition itself collapses into the woven canvas; at v2 the Operator/Engineer split becomes far/near zoom of one surface rather than two lenses.

## Staying clean & out of the cage

- **Projection, never ontology.** Every `obj:`/`tie:`/`kind:` node is derived fresh from `getOperatingView` each render and thrown away. Nothing persists as canvas state; change the join rule and the picture changes next render with nothing to migrate — the same discipline `deriveFunnel` already lives under.
- **Kinds stay open strings.** Object kinds are whatever the touch ledger recorded; a new kind just makes a new labeled region. GTM-type clusters key on `deriveMotionName`'s shape-derived string — the deleted GTM-channel enum does not return; a blended-kind pipeline is drawn straddling both clusters, never forced into a bucket. Empty is honest: no objects means lanes with an empty gutter; an untried kind is open space, not a catalog slot.
- **No pre-run object, no pre-gate blocker.** Candidates are non-persisted proposals; a run reaches the gate on whatever it produced. The gate remains the sole checkpoint, re-asserted by `assertGateWall` on every edit; autonomy moves only by explicit founder promotion.
- **Design system held.** Opaque surfaces only, #fafafa ground, monochrome zinc, Geist, semantic color only (state, parked pulse) — no per-pipeline decorative palette by default, no gradients, no water styling. Motion is feedback: a re-weave on edit, a pulse on parked, nothing ambient. Desktop 1440. No cockpit and no prose recommender — the canvas renders derived state with provenance and routes to real objects and actions.
- **The no-hairball guarantee, stated as rules:** individually drawn objects scale with intertwining (2+-touch), not population; far zoom shows overlap as node weight, not lines; focus-to-trace isolates any object's crossings at any density; placement is deterministic so the field never reshuffles.

## Open decisions for the founder

1. **Ship order: spine-then-graft, or straight to objects-primary?** Option A: ship the lanes-primary weave first (buildable now, proves intertwining with convergent ties), then add the objects-primary layout as the second altitude. Option B: build the objects-primary layout first (the full vision sooner, but net-new layout engineering before anything ships, and weak with today's sparse population). **Recommendation: A** — same object model either way, so nothing is thrown away, and alpha's rule is "in front of a stranger sooner."

2. **What the canvas opens on.** Option A: the broad GTM-forms map (the type axis, fully zoomed out — the comprehension view you named). Option B: the objects axis (the moat view) with the type map one toggle away. Option C: whatever needs you — open wherever a gate is parked, broad map otherwise. **Recommendation: C** — the broad map is the default ground, but a waiting decision outranks a map.

3. **Drag-to-wire: steer or literal?** Option A: dragging a thread to an object is a steer — a proposal the crew turns into real steps, accepted at the ghost path. Option B: it's a literal targeting edge you author directly. **Recommendation: A** — B drifts toward you maintaining targeting lists, which is the crew's job; A keeps you steering and them working.

4. **Retire the old regions now or keep a fallback?** Option A: retire the stacked map band and candidate board the day the weave ships (the subtraction is the point). Option B: keep them behind a toggle until the weave proves itself in your hands. **Recommendation: A** — alpha allows it, and keeping two homes for the same truth is how the old surface lingers forever.

5. **Pipeline identity: color or isolation?** Option A: stay near-monochrome; a pipeline's identity comes from focus-to-trace lighting its path, with semantic color reserved for state. Option B: one muted accent per pipeline so two ties at a shared object are distinguishable at a glance without hovering. **Recommendation: A to start** — it holds the design system with zero palette pressure at dozens of motions; adopt B only if live use shows the hover step genuinely slows reading the crossings.
