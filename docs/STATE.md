# STATE — Drover (Alpha)

**Stage: Alpha. Updated 2026-07-13.**

Verification receipts dated before 2026-07-13 are baselines from earlier revisions. They describe evidence
that was recorded then, not a fresh pass of the current uncommitted working tree. No current-tree test or
browser success is claimed here until the final verification reruns.

## Active north-star goal — the experiment machine

Drover's current direction, sitting on top of the open-canvas contract, is **"vibe code your go-to-market":
a living machine of many parallel, grounded, agent-built experiments across go-to-market and product, for
one venture at a time.** The founder sees, refines, and approves; the crew builds and runs; real outcomes
loop back on the canvas. Progress reads as **motion through the weave, never a scoreboard.**

The build contract for this direction is [EXPERIMENT-MACHINE-SPEC.md](EXPERIMENT-MACHINE-SPEC.md). It does
not replace the harness (truth, founder wall, taste) or the open-canvas contract — it describes the
experience built on top of them. Its firm rails are founder-held and never automated away: nothing goes
outward without the founder's explicit hand (and nothing outward runs while the founder is away); only the
founder kills an experiment (the machine may learn from a loser and propose a mutation, never auto-kill);
the founder greenlights each experiment with one click; the founder can see and refine anything at any
altitude; on a real reply the machine alerts the founder and they decide together; one venture is an
isolated machine.

The one genuinely new primitive this direction introduces is the **loop-back canvas**: outcomes and warm
leads visibly circle back to the front of the pipeline, so progress is read as motion through the weave.
The concrete fit/conflict/gap map against the current tree is
[production-direction/experiment-machine-alignment.md](production-direction/experiment-machine-alignment.md).

The multi-goal open canvas, direct creation and connection, spatial regions, continuous executable surface,
Claude/Codex comparison, isolated product-change contract, and the six experiment-machine rails are assembled
on the terrain, wall, outcome, and taste systems. The remaining work is visible end-to-end verification and
real-world proof, not another required product ontology. The real-founder and attributable-outcome gate has
not passed.

This is the front-door record of what the product currently proves. [README.md](../README.md) explains the
product, [VISION.md](VISION.md) gives the revised north star, and
[OPEN-CANVAS-SPEC.md](OPEN-CANVAS-SPEC.md) is the delivery contract. The table below is the honest record of
what is implemented and what remains unproven.

## Open-canvas foundation now in the tree

Drover has moved from a terrain-first go-to-market desk whose meaningful builds became pipelines to one
multi-goal canvas for product development and go-to-market. Each product supports dozens of independent
and related goals. Claude and Codex materialize grounded analysis, editable artifacts, product changes,
execution paths, founder decisions, and returned outcomes on that same canvas.

This direction keeps the current terrain, open execution graph, provider-neutral runtimes, founder wall,
outcome return, and taste loop. The tree now includes a zero-to-many goal authority, a provider-neutral
revisioned work authority, project-scoped HTTP and typed client surfaces, canonical canvas projection, and
Claude/Codex tools that can inspect and create open goals, artifacts, and relationships without manufacturing
a pipeline. Product-change and outside-effect paths still stop at the founder wall.

## What Drover is now

Drover opens on one living product-and-market canvas rather than a mission form or an empty pipeline editor.
The canvas combines cited product truth with many independent goals, revisioned work, clearly labeled model
reads, open questions, crew positions, execution paths, founder decisions, and returned outcomes.

The canvas is primary. Goals and work remain useful without a pipeline. A pipeline is created only when work
needs repeatable execution or an outside effect; the selected pipeline can still open into its editable flow.

The harness still owns only three constraints:

- **Truth:** a read-only scan produces cited product facts. Already-grounded truth renders without an AI
  runtime or model call.
- **The founder wall:** every outward effect remains behind founder authorization. Terrain context and model
  work cannot grant approval.
- **Taste:** founder approvals, rejections, and edits become durable memory for later work.

Codex and Claude Code are both local sources of rented intelligence through the founder's existing
subscription. The selected runtime can read the terrain, work with the crew, compose a pipeline, and drive
it to the same wall. Provider choice does not own product records, decisions, outcomes, or authorization.

## What “Alpha” means

The product can be built, green, and browser-tested while the market bet remains unproven. No outside
founder has yet completed the full terrain-to-market loop without help, and no attributable real-world win
has returned through that loop.

The alpha test is:

1. A founder opens a real product and understands cited truth before supplying a goal.
2. They investigate or correct a credible opening with the crew.
3. They choose a move, turn it into a real pipeline, and run it to the founder wall.
4. They approve a real outward effect.
5. A real positive, negative, or no-response result returns with honest attribution.
6. That result changes the next terrain read and the next work.
7. An outside founder survives the same path without intervention.

That human test is T11 and Gate D in the completion specification. It has **not passed**. The stage remains
alpha.

## Implemented in the current tree

| Area | State | What is proved |
|---|---|---|
| Multi-goal authority | **Built and tested** | A project holds zero, one, or dozens of independently addressable goals with open relations, independent status, tombstones, attribution, compact idempotency receipts, project isolation, and optimistic concurrency. No primary mission or mandatory goal exists. |
| Open work authority | **Built and tested** | Claude, Codex, founders, and tools can create open-kind revisioned artifacts and relationships with immutable history, branching, attribution, evidence-aware provenance, retirement/restore, collision-resistant project keys, and stale-writer protection. |
| Spatial work regions | **Built and tested for the alpha slice** | Project-scoped named regions persist open purpose, member references, position, size, collapse state, founder-placement protection, revision/idempotency/CAS, and archive/reopen without owning or deleting their members. Regions render as quiet spatial bounds and can be selected, dragged, resized, collapsed, expanded, archived, and created around marquee or keyboard multi-selection. One nesting level is supported; foreign, dangling, self, cyclic, and deeper region references fail before persistence. Region and layout mutations leave human-readable receipts with guarded undo and redo. Inverses restore only canvas-owned shape, archive rather than delete wrappers, refuse divergent state, and cannot cross the wall. |
| Canvas-native projection | **Interactive foundation built; prior browser receipt recorded** | Goals and open work join the canonical canvas as selectable, draggable anchors with revision-protected saved placement. Double-clicking empty space or pressing N creates at that world coordinate; handles and the C key create attributable relationships. Selected goals and work expand and edit directly on the canvas with optimistic concurrency; comparisons and journeys have structured local editors while raw source remains available. Explicit explanatory edges are selectable and support CAS revision, founder acceptance of proposals, immutable history, retire, and restore; executable, derived, outcome-return, and containment edges remain distinct and inert to that inspector. The synchronized searchable workbench and keyboard outline remain secondary access paths. Safe native text, markdown, record-table, bounded JSON, comparison, journey/timeline, code-difference, and inert visual-preview reading is built. Dense rendering retains the full projection for search and focus while virtualizing off-screen elements. An earlier revision's browser journey passed across desktop, compact, narrow mobile, keyboard-only, refresh, and no-runtime modes; that receipt is baseline evidence, not a pass of the current working tree. Its expanded 144-goal fixture still needs a socket-capable browser run. |
| Experiment proposals and one-click start | **Built and tested** | Outside triggers and founder-killed bets produce open `experiment-proposal` work artifacts with lineage, immutable revisions, and ordinary canvas editing. One founder action starts a fresh artifact-scoped crew session and records the proposal as greenlit. Starting work grants no outward-release capability; every send, publish, deploy, or spend still reaches the separate founder wall. |
| Founder-away hold | **Built and security-tested** | Founder presence is a short volatile lease that defaults and lapses to away. When away, standing autonomy cannot approve an outward or unrecognized downstream action unattended; the gate holds it for review. Proven internal preparation remains available. Only an authenticated founder browser can mark present, while any caller may make the system more conservative by marking away. |
| Experiment evolution | **Built and tested** | Only an explicit founder kill can project a variant. A failed run is not silently interpreted as a failed bet. The crew receives the recorded learning and chooses the smallest meaningful change through an open instruction; the host does not hardcode a strategic-dimension enum, alter the loser, run the variant, or attach a verdict. |
| Outside-trigger birth | **Built and tested** | A captured outside event appears once as a proposed experiment. Accepting the inbox decision materializes editable canvas work and routes the source input to that artifact, never to a live pipeline. Founder-entered notes remain a distinct seed path. |
| Reply alert and joint decision | **Built and tested for connected Gmail + captured replies** | A real connected-account reply joins to its exact run item as a measured outcome and also becomes one durable unrouted reply input carrying sender, body, run, pipeline, thread, and join lineage. The open interface raises one decide-together interruption and can hand the reply to the crew as the current subject. Reads never auto-reply, auto-route, or run work. Other captured reply sources use the same input projection; background OS notification is not claimed. |
| Shared goal work | **Detection and founder resolution built and tested** | When several active goals durably reference the same artifact or canvas object, Drover projects attributable shared-work receipts without blocking work or inferring incompatibility from similar wording. The selected object's canvas workbench lets only the founder record whether the uses stay separate, one goal owns future changes, or coexistence is acknowledged. Decisions are project-scoped, revisioned, idempotent, immutable in history, reprojected only against the exact current conflict receipt, and never mutate either goal or execute work. |
| Open-canvas API and typed client seam | **Built, integrated, and contract-tested** | Project-scoped HTTP routes and the normal interface cover goal, artifact, and relationship reads and core mutations with authority revisions and idempotency. Unsupported methods fail as JSON rather than falling through to the app shell. No approval or release route is exposed here. |
| Claude/Codex open work parity | **Built and contract-tested** | Both runtimes receive the same safe operator tools. They can inspect and durably record goals, open artifacts, and relationships; provider details remain receipts rather than record identity. Model actors cannot grant approval or release authority. |
| Runtime handoff and ask-both | **Built and interface-tested** | A paused durable session can move between Claude and Codex with its goal, selection, context refs, recent founder directions, proposal/wall state, and visible canvas authority intact while provider-private transcript/session state is discarded. Explicit ask-both creates attributable branches from the same durable snapshot and displays them side by side with independent status and output. Durable comparison groups reconstruct after refresh. Choosing changes focus only; keeping both preserves both sessions. “Make comparison work” materializes a third editable artifact that references both branches separately and explicitly records no winner, synthesis, consensus, or authority; it never merges, cancels, drives, approves, or grants authority. |
| Independent goal threads | **Built and tested** | Each goal, work artifact, or work region resumes its own durable operator thread. Work on one goal no longer replaces the active conversation for another goal, while returning to the same object continues its prior thread. |
| Typed canvas proposals | **Built and founder-gated** | Claude and Codex can propose one bounded region or layout change as an editable work artifact. A proposal is inert until the founder applies it; application uses the same revision checks and structural history as direct canvas edits and leaves a durable receipt. Models cannot smuggle approval, autonomy, or an opaque multi-authority transaction into the proposal. |
| Provider-neutral product changes | **Built, hardened, and interface-tested** | Claude and Codex use one product-change contract to edit only an isolated worktree. The restricted door has no shell, network, apps, browser, MCP, approval, git, or release authority; filesystem paths and symlinks are confined, provider/model mismatches fail, and a violating commit is returned to an uncommitted review difference. The canvas shows the exact retained diff and receipts, stages it into the existing workspace review authority, requires an explicit approve/reject decision, rechecks the base and source tree, and requires a separate confirmation before applying locally. Apply does not commit, merge, push, or deploy. Founder dirt stays untouched. Live subscription parity remains unrecorded in the current sandbox. |
| Concurrent authority writes | **Built and tested, local + remote contract** | JSON and SQLite use compare-and-set. Revisioned Convex documents now preserve the local base revision and base content through an atomic server mutation, reject a second machine's stale or divergent write/delete, quarantine dependent writes, retain the losing edit locally, and refuse ambiguous hydration overwrites. Automatic semantic merge remains future work; shared-goal decisions use their own founder-only conflict authority. |
| Terrain-first home | **Built and fixture-tested** | A grounded product opens on the one canvas, including with zero pipelines. Cited truth appears before a goal is required. |
| Deterministic terrain | **Built and tested** | The project-scoped read combines existing truth, questions, moves, outcomes, implications, crew, relationships, and geometry without spending a model call or writing state. Partial and stale owners are reported honestly. |
| Cited first grounding | **Built and tested** | The initial repository scan is persisted into product truth, so the first terrain view does not depend on opening another surface or running AI. Cross-project receipts are rejected. |
| Rented terrain read | **Built and tested with adapters and fixtures** | Model output produces openings and tensions as inferences, keeps uncertainty and falsifiers, demotes unsupported citations, and may return no hypotheses without breaking the terrain. |
| Codex and Claude support | **Implemented; contract-tested; Codex smoke-tested** | One provider-neutral task path supports both local CLIs and subscription authentication. Product reading, terrain reading, composition, and operator paths honor the selected runtime. A signed-in Codex subscription completed the opt-in project-scoped terrain read on 2026-07-10 without touching the founder wall. |
| No-runtime use | **Built and fixture-tested** | Cited product terrain and existing work remain available without Codex or Claude. Missing model interpretation is local and explicit rather than a full-product connection wall. |
| Terrain to pipeline | **Built and tested** | A selected opening, question, or direct request can become the existing open pipeline. Its evidence, wording, intended effect, uncertainty, and measurement intent travel as advisory context, never as a prerequisite or approval. |
| Outside-founder survival safeguards | **Built; prior integration and browser receipts recorded** | Clear action requests now create a durable founder goal before work starts and cannot report completion without a matching durable work, pipeline, or run receipt. Useful conversation output becomes reloadable canvas work. Failure history is scoped to the active home and project. Founder decisions are separated from system issues, active work shows its real current step and elapsed time, and narrow screens use readable crew/Outline modes. A sample journey on the 2026-07-12 revision reached a stored pipeline and founder gate and survived reload. A prior isolation regression covered obsolete program-bound agent doctrine and another venture's absolute memory path entering a run. These are baseline deterministic/local receipts, not current-tree verification or Gate D. |
| One continuous canvas | **Built and tested** | The visible Operator/Engineer split and lens shell are removed. Full executable steps, gates, outcomes, open work, regions, terrain, and shared objects stay in one mounted React Flow surface. Focusing a pipeline pans and adds an in-place readout; Escape returns to the originating terrain focus without swapping renderers or losing state. |
| Persistent crew identity | **Built; prior browser receipt recorded** | Every teammate uses one deterministic illustrated character across the canvas, left rail, conversation, crew room, creation flow, and profile. Initials remain only as a render-failure fallback. Same refs retain the same face; different refs remain visually distinct. The browser receipt predates the current uncommitted tree. |
| Founder wall | **Built and security-tested** | Every execution path still requires upstream founder authorization. A local one-time founder action code establishes the browser's action session; ordinary reads and model clients cannot mint that authority. Browser-only gate release, project isolation, self-approval rejection, protected capability and artifact mutations, graph-autonomy forgery rejection, and the second deploy authorization have regression coverage. |
| Outcome return | **Built and tested** | Joined outcomes return to their product, question, move, crew, run, and decision context when those links exist. On the object-axis canvas they draw a calm directional stroke to the front of their originating pipeline, with warm replies distinguished from closed learning and reduced-motion respected. The detail rail is a closed-by-default pull surface. Approval alone is not treated as a market result; unjoined signals remain unattributed. |
| Taste loop | **Built and tested** | Gate decisions feed durable taste into later composition and agent work. Terrain reads can consume founder corrections without turning them into authorization. |
| UI and agent-client parity | **Built and contract-tested** | Terrain references can be inspected, focused, discussed, recorded, proposed, and run through both the interface and MCP without becoming durable authority. |
| Real founder alpha loop | **Unproven** | T11, Gate D, and the named alpha-loop evaluation remain open. |

## Evaluation status

The completion specification separates four gates so lower-level proof cannot stand in for market proof. Gate
A through C receipts below are dated baselines; they do not verify the current uncommitted tree.

- **Gate A — deterministic contracts:** recorded as implemented in the prior canonical test chain. Coverage
  includes terrain
  normalization and projection, provider adapters, project isolation, operator context, open pipeline
  composition, wall security, outcome learning, anti-cage rules, interface tests, lint, type checking, and
  the production build.
- **Gate B — deterministic browser journey:** on an earlier revision, the terrain-to-wall fixture and its first
  multi-goal extension passed for desktop, compact, narrow mobile, keyboard-only, hard refresh, and no-runtime modes.
  The expanded fixture now seeds 144 independent goals, checks bounded rendering, verifies visible goal
  creation and focus, reopens an off-screen goal through canvas search, and preserves completed upstream work,
  an attached failure, blocked downstream work, and a retry after refresh. That expanded run is ready but has
  not been executed in the current sandbox because local socket binding is denied. Shared-work conflict
  behavior is contract-tested.
- **Gate C — local-runtime smoke:** the Codex-only project-scoped terrain read passed through a signed-in
  ChatGPT subscription on 2026-07-10, and the harness confirmed that it made no approval or release request.
  The full matrix is still open: Claude Code only, neither runtime, and an explicit choice with both
  available have not all been recorded as live subscription runs.
- **Gate D — real-product alpha evaluation:** not run to a pass. There is no stranger-survival receipt and no
  attributable real-world result.

The exact current test receipt belongs in the commit or handoff that ran it. Do not turn changing test counts
into product claims here.

## What remains

The remaining engineering verification gaps are the final experiment-machine browser journey, partial failure,
and genuinely large virtualized projects in a socket-capable environment. Additional artifact forms can be
added when real founder work demands them; they are not an alpha prerequisite or a new fixed taxonomy.

After that, the market milestone is evidence:

- run and record the complete Gate C matrix through normal local subscription setup;
- drive a real founder product from terrain to an outward effect and return the actual response;
- preserve negative or no-response results as outcomes rather than renaming them success;
- observe an outside founder completing the same path without explanation;
- record where the terrain, crew, pipeline handoff, or wall causes hesitation and fix only what blocks
  understanding or trust.

Passing deterministic tests means the terrain-first product is implemented. Only T11 and Gate D can prove
the alpha bet.

## Current document map

At a glance: the positioning line is **"vibe code your go-to-market,"** and the active build direction is the
**experiment machine**, which sits on top of the open-canvas contract and the truth/wall/taste harness.

**Current (canonical — read these):**

- `README.md` — the product, the positioning line, and local setup.
- `DESIGN.md` — the visual-system rules and component identity contracts.
- `docs/VISION.md` — the product north star, including the experiment-machine direction.
- `docs/OPEN-CANVAS-SPEC.md` — the multi-goal, canvas-native product target and delivery contract (the
  foundation the experiment machine runs on).
- `docs/EXPERIMENT-MACHINE-SPEC.md` — the experiment-machine build spec of record (the active direction).
- `docs/production-direction/EXPERIMENT-MACHINE-GOAL.md` — the north-star goal: complete the experiment
  machine end to end.
- `docs/production-direction/experiment-machine-alignment.md` — the fit/conflict/gap map of the current tree
  against that spec.
- `docs/STATE.md` — this honest build and evaluation snapshot.
- `AGENTS.md` — engineering invariants and repository rules.

**Historical (implementation history — banners at the top point to the current direction):**

- The earlier direction docs `GTM-MACHINE.md`, `INTERTWINED-CANVAS.md`, `GOAL.md`, `GTM-ENGINE-REBUILD.md`,
  `PRODUCT-SPEC.md`, `MODEL.md`, `PRODUCT-MODEL.md`, `EXPERIENCE.md`, `CANVAS.md`, and
  `ENGINE-COLLAPSE-PLAN.md` — earlier goal-first, Claude-only, pipeline-as-product, operation-primary,
  board-primary, program, policy, foundry, and portfolio directions — were **removed** in the
  experiment-machine deletion pass. They remain recoverable from git history; the live direction is the
  experiment-machine spec set above.
- `docs/production-direction/00-index.md` and its numbered files (01–17), including
  `17-product-market-terrain-completion-spec.md` — the earlier terrain-and-pipeline production package; its
  truth/wall/taste/runtime-safety findings remain useful, but the experiment-machine direction supersedes its
  completion-spec framing where they conflict.

The terrain-first, open-canvas implementation remains the current built state. Where an earlier document's
pipeline-only or completion-spec framing conflicts with the experiment-machine direction, the experiment-machine
spec and the open-canvas contract win.
