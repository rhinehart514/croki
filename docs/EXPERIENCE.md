# Product Experience Architecture

The decision: GTM IDE is a **canvas-first IDE**. The editable execution graph is the one
surface. Claude co-pilots by proposing graph operations the founder accepts. The founder
gate is the wall on that canvas. Everything else is a lens, an inspector, or a dock around
the graph — never a competing surface.

## The problem this replaces

The experience had a split identity. Two canvases were fighting:

- `GraphCanvas` (React Flow) — the real editable DAG: nodes, edges, drag-to-connect, the
  actual execution plan, contract audit, derived health. The IDE.
- `ProgramCanvas` — a static three-column card grid with five modes. A status dashboard.

When a program was composed (the main path), the founder got the **cards**, and the real
graph was hidden behind a "Graph" toggle. The product sells "Cursor for go-to-market /
debug GTM like a codebase," then led its primary surface with a dashboard. The five modes
were thin because the surface they re-skinned was four cards at 40% opacity — you can't
make "Simulation" mean anything when the thing it decorates is a card grid.

## Target architecture

One surface, three frames around it:

1. **The plane is the graph.** `GraphCanvas` renders the composed execution DAG as the
   program's primary surface. Direct manipulation: add a step, wire an edge, drag, delete,
   open a node. The gate is the single accent color — the eye goes to the wall.

2. **Modes are lenses on the one graph.** Design / Simulation / Run / Review / Learning do
   not swap the surface. They re-skin it: each mode emphasizes the nodes it is about and
   dims the rest, and points the debugger at the matching tab. Simulation emphasizes the
   gate and the world-reaching steps (what will happen, where it stops); Review emphasizes
   the gate alone; Learning emphasizes the agents and measurement that the feedback loop
   touches. Same graph, different question.

3. **The inspector is the program framing the DAG lacks.** Outcome, buyer hypothesis,
   channel hypothesis, measurement plan, the agents and their creation policies, and the
   learning threads (decision → revised rule → smarter agent) live in the inspector and the
   debugger — not as fake nodes on the canvas. These are the business object; the graph is
   the execution plan. Clicking an agent shows its policy and rules; clicking a graph node
   opens its editor.

4. **Claude is a dock, not a mode.** The co-pilot proposes graph operations and composes
   workflows; the founder accepts. It never owns the gate.

## The model collapse (next phase, not this slice)

`channel`, `program`, and `graph` are modeled as three objects in three stores but run
nearly 1:1:1. The UI pays for it everywhere: `program.graphId === graph.id`,
`graph.outcomeProgramId === activeProgram.id`, `program.channelId` reconciliation threaded
through the shell. The target: **the program owns its graph directly**; "channel" becomes a
label on the program, not a third aggregate with its own store and id. This removes a whole
class of "which id am I keying on" bugs in `App.tsx`. It is a backend + store change and is
deliberately out of scope for the first slice — it lands after the canvas-first surface is
proven, so the refactor has one stable surface to target.

## Migration phases

- **Phase 1 (this slice — shipped):** Make the real graph the program's plane. Add a mode
  lens to `GraphCanvas`. Rewrite the `ProgramCanvas` inspector as the program-framing panel
  (outcome / buyer / channel / measurement / agents+policies / learning). Delete the card
  grid, the synthetic program nodes, and the redundant "Graph" toggle + second graph render.
  Node clicks open the existing node editor; the gate-review action selects the pending gate
  node. One canvas, mode-aware.
- **Phase 2:** Collapse the channel/program/graph triple. The program owns its graph; channel
  becomes a label. Remove the reconciliation scaffolding from the shell.
- **Phase 3 (shipped):** Status vocabulary unified into `ui/src/lib/status.ts` (one humanizer, one
  tone map) across the toolbar, dock, explorer, operator panel, and program pill. On-canvas
  proposals shipped: the operator's `propose_graph_changes` tool stages typed graph ops on the
  session as a durable `pendingProposal` (mirrors the gate — paused, founder-resolved, never an MCP
  tool); the canvas renders the would-be nodes/edges as indigo ghosts with a review bar; Accept
  commits the exact ops and resumes the operator, Discard drops them. The program run now streams
  node-by-node like the raw-graph path (`/programs/:id/run/stream`). "Vibe up to the gate" now covers
  the agent editing the graph too.
- **Phase 4 (shipped):** The domain event-sourcing gap is closed. The live `compileChannelProgram`
  path (formerly `compileOpportunityProgram`, before the opportunity object was removed) emits
  creation events idempotently and `markProgramComposed` emits `WorkflowComposed`, so
  state rebuilds from the log in production (proven by a reconciliation test in
  `workflow-composer.test.mjs`).

## Reach and polish (shipped)

Beyond the build-and-run loop, four gaps between "works for us" and "works for a stranger" are
closed:

- **Cold start.** `/api/connection` reports whether a live Claude is available (via the runtime
  layer's existing auth detection). When it isn't, the canvas shows a calm "Connect Claude to build"
  banner naming the path (`claude` sign-in or `CLAUDE_CODE_OAUTH_TOKEN`) instead of letting the
  founder hit a raw error mid-action, and notes they can still explore. The toolbar pill reflects it.
- **IA diet.** The explorer's eleven flat sections are grouped under four labels — Build, Run & learn,
  Library, System — with Programs primary. Same sections and deep-links, far fewer nouns to hold.
- **In-product authoring.** New agent / New skill entries in the Library open the artifact editor on
  a fresh ref; its save creates the `~/.claude/{agents,skills}/<ref>` file. The three-lane authoring
  workspace is the larger surface this grows into.
- **No canvas hijack.** The operator poll no longer auto-opens the ideation board over a program the
  founder is already focused on.

Still unbuilt (each its own effort): the full channel/program/graph store collapse (Phase 2 — moves
the MCP front door), the three-lane workflows/skills/agents workspace, and live-model verification
that the operator actually chooses `propose_graph_changes` and composes an agent-step workflow to the
gate (the mechanisms are tested; the live-model behavior can't be verified headlessly).

## Invariants the experience must keep

- The gate is the only colored thing on the canvas. Color means "this reaches the world."
- A mode never executes. Only "Run program" runs. Simulate is a preview lens.
- The graph is the execution plan; the program is the business object. The inspector carries
  the business object, the canvas carries the plan. Neither impersonates the other.
- Nothing on the canvas sends, publishes, or charges without passing a founder gate upstream
  of it on every path (enforced in `workflow-composer.mjs`, surfaced visually by the lens).
