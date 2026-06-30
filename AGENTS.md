# AGENTS.md

## Product purpose

GTM IDE is the IDE for go-to-market. You point it at your product's codebase; it reads
what the product actually does and where wins actually enter; then you say a go-to-market
goal in plain words and it builds the work and runs it up to your approval gate. Nothing
sends, publishes, or charges until you approve. It learns your taste from every gate
decision, so the next build is sharper.

There is no required setup — no program to stand up, no policy to define, no template to
pick. A founder hands the operator a goal ("get 5 pilot conversations without paid ads")
and one move does most of it: the operator reads the product, composes the agents and steps
the goal needs (research, enrich, draft — whatever fits), builds a workflow behind a founder
gate, and runs it to that gate. The executable artifact is a `GTMGraph` of open steps; a step
is a connector (`tool`), a subagent (`agent`), a skill (`skill`), a deterministic transform
(`code`), or an external MCP tool (`mcp`) — whatever the model composes.

## The harness — the only three things the host constrains

The product's whole design is to hold the rented model on a short leash for exactly three
things and let it run free on everything else. This is the spine; do not re-grow a fourth
constraint.

1. **Truth.** A read-only scan of the product with `file:line` evidence (`scan.mjs`,
   `product-understanding.mjs`). The model's claims about what the product *already does* come
   from here, or are labeled inferred. It cannot invent product facts.
2. **The Wall.** The founder gate. Nothing reaches the outside world without an explicit founder
   approval. Every `execute` node must have a founder `gate` upstream of it on every path or the
   composition is rejected (`assertGateWall`). The default execute connector stages locally and
   never sends. "Vibe up to the gate, never past it."
   The Wall **graduates per channel — it never disappears.** A channel starts at `draft` (the gate
   holds every item). The founder may explicitly promote a channel up the autonomy ladder
   (`draft → trusted → autonomous`, `promoteChannel`/`revokeChannel` in `project-store.mjs`), banking a
   *blessed pattern* the gate then auto-applies to the clean items while still escalating the exceptions
   (`gate-pattern.mjs`). This is standing founder approval, not the absence of approval: the gate node
   stays structurally present on every path, the promotion is itself an explicit founder act, and one
   click drops the channel back to `draft`. The safety contract is that **autonomy is only ever set by an
   explicit founder promotion — never by composition and never by a run.** The standing pattern lives in
   founder-owned durable state (the channel record), and the typed graph-operations path rejects any
   attempt to forge `autonomy`/`blessedPattern` onto a gate node config (`graph-operations.mjs`), so a
   model-driven mutation can never self-promote a channel past the wall (guarded by `anti-cage.test.mjs`).
3. **Taste.** The run ledger of gate decisions becomes durable memory that shapes the next run
   (`memory.mjs`, `feedback-ledger.mjs`); a drafting agent must consult it (`get_taste`) and a
   visual one must also consult `get_design` (`consult-guard.mjs`).

The host also owns the plumbing a model must not: durable state (flows, sessions, people) and
typed, validated graph mutations. Everything beyond those — what the channels are, which agents
to compose, how the graph branches, how many approaches to try — is the model's job, decided
fresh each time, never pre-structured by host-side domain objects.

**What was deliberately removed (2026-06-29 — do NOT re-introduce):** the outcome-program /
agent-creation-policy / capability-foundry machinery, the opportunity accept/reject board,
portfolio composition, blocking input contracts, and the `provided`/`discovered` source-mode
gymnastics. These were a second cage on top of the connector-DAG cage: they made the model spend
its turns satisfying an ontology instead of doing go-to-market, and runs dead-ended on
`minItems` and registration before reaching the gate. The model now drives a goal to the gate
through a slim toolset and a free compose. If you find yourself adding a "program," a "policy," a
required pre-run object, or a contract that blocks a run before the gate, stop — that is the cage.

## The run, end to end

`goal → operator reads product truth → compose_and_run → composeNakedGraph builds a graph behind
a founder gate → runGraph executes the open steps → the run stops at the gate → founder reviews →
approve releases the exact staged items`. Proven live on the subscription: a goal produced a
research → qualify → draft workflow that found real founders and staged personalized drafts at the
gate, nothing sent, with no program/policy/foundry anywhere in the path.

## The resident operator

The operator drives a goal to the gate on the founder's Claude subscription. It is the brain
behind both the dashboard "Go" and the goal launcher. It is naked by construction: the model is
handed ONLY a slim toolset (`NAKED_TOOLS` in `operator-runtime.mjs`) — read the product, read/write
shared context (taste), `compose_and_run` (the one build-and-run door), an inspect/repair loop for a
failed run, `request_founder_input`, and `complete`. It never sees programs, policies, the foundry,
portfolio, or channel CRUD. Its system prompt tells it to build and run, not to march through an
ontology. It owns every durable and safety decision (session state, the run ledger, the gate,
cancellation, restart recovery) and rents a provider-neutral runtime to do only the reasoning.

Two front doors stay in lockstep: the human dashboard and the agent (MCP) interface drive the same
engine. GTM is debugged like a codebase — every node carries real health from the scan, the run
ledger, and connector state; a Problems rail ranks what's wrong and routes you to the node that
fixes it.

## Canonical commands

- Run: `npm start` (builds the UI, then serves API + client from `brain/src/server.mjs`)
- Full verification: `npm test` (runs `brain` tests, then `npm run lint`, then `npm run build`)
- Brain tests only: `npm --prefix brain test` (Node's built-in runner, `node --test`)
- One brain test file: `node --test test/<name>.test.mjs` from `brain/`
- One test by name: add `--test-name-pattern '<regex>'`
- Lint only: `npm run lint` · Build only: `npm run build` (both target `ui/`)
- Live smoke test (skips unless a founder is signed in): `npm --prefix brain run test:live`
- MCP server (agent front door): `npm run mcp`
- Direct scan: `node brain/src/mirror.mjs <repo> --win <event>`

## Architecture

- `brain/src/scan.mjs` owns grounded repository analysis — the code grounding, with `file:line`
  citations. `product-understanding.mjs` reports only cited, reproducible reality (never a GTM
  taxonomy).
- `brain/src/graph.mjs` owns the `GTMGraph` DAG run: dependency-scoped execution, founder approval
  gates, exact gate continuation, the taste/memory injection point, and dispatch by node `kind`
  (a `tool` node runs a connector; `agent`/`skill`/`code`/`mcp` nodes run through the injectable step
  runtime). It normalizes run contracts so the gate is the ONLY checkpoint (see `source-entry.mjs`).
- `brain/src/step-runners.mjs` owns the open step kinds — the un-caging. `agent`, `skill`, `code`,
  and `mcp` steps dispatch here, not through the connector registry. The runtime is injectable (honest
  blank defaults; `createStepRuntime` for live; fakes in tests) so the host never owns the intelligence.
  Each kind does real work: a `skill` step appends its loaded `SKILL.md` to a shared run accumulator
  (`context.__skillGuidance`, threaded by `graph.mjs`) that a downstream `agent` step folds into its
  prompt; a `code` step runs a DETERMINISTIC built-in transform (`BUILTIN_CODE_TRANSFORMS` —
  dedupe/filter/limit/sort/rename-fields, no eval) selected by `config.ref`; `mcp` is in the composer's
  node menu. `applied:false` is the honest no-op when a ref/loader is absent — never a silent dead-end.
- `brain/src/workflow-composer.mjs` owns `composeNakedGraph` — the one compose. The model designs the
  graph for a goal (research/enrich/draft agents behind a founder gate via `composeGraphForChannel`),
  the host binds the founder's input/output, re-asserts the wall, and persists a runnable flow. NO
  program, policy, foundry, or agent artifacts: agent nodes carry their prompt inline, so they run
  without a written definition. This is what `compose_and_run` uses.
- `brain/src/source-entry.mjs` owns the run-path contract rules. The founder gate is the ONLY contract
  checkpoint: `relaxGateContracts` (the gate must not reject a reviewed draft on a field-name
  technicality; post-gate trusts the approval) and `relaxPreGateContracts` (every pre-gate node has its
  `minItems` and field contracts zeroed, so a freely-composed graph runs to the gate on whatever it
  produced — contracts stay ADVISORY for the UI, never a dead-end). It also still derives the
  `provided`/`discovered` source label from a node's shape for display.
- `brain/src/agent-bridge.mjs` owns the real step bridges: a skill loader (reads
  `~/.claude/skills/<ref>/SKILL.md`) and a Claude agent invoker that runs a read-only subagent on the
  founder's subscription (OAuth-first, no key, no send/publish path). `liveStepRuntime` composes both
  (plus `BUILTIN_CODE_TRANSFORMS` and the MCP runner); the server and operator run paths pass it to
  `runGraph`.
- `brain/src/graph-operations.mjs` owns validated, reversible typed graph changes. Open `kind` steps
  require a `ref` instead of a registry category; category is an optional label, not the dispatch key.
- `brain/src/operator-store.mjs` owns durable resident-operator sessions and events.
- `brain/src/operator-runtime.mjs` owns the model/tool loop and the naked toolset (`NAKED_TOOLS`):
  inspect product/context, `compose_and_run`, inspect/repair, ask the founder, complete. It owns every
  durable and safety decision (session state, ledger, gates, cancellation, restart recovery) and selects
  a provider-neutral runtime to do only the reasoning.
- `brain/src/runtimes/` are the operator runtime adapters behind one "drive the session to its next
  pause" interface: `claude-code.mjs` (preferred — a Claude Code subprocess on the founder's
  subscription, no raw key), `anthropic.mjs` (direct API), and a slot for a future Codex subprocess.
  Selection is OAuth-first: it prefers Claude Code only when the founder is signed in (a stored
  subscription login or `CLAUDE_CODE_OAUTH_TOKEN`), treats a raw `ANTHROPIC_API_KEY` as last-resort, and
  — when on the subscription — strips any stray key from the subprocess so the run bills the
  subscription. With no credential it reports an honest cold-start blocked state instead of crashing.
  Conversation memory is real on the subscription runtime: the SDK persists its transcript and GTM IDE
  stores the captured session id, so each later drive `resume`s the same conversation with only the
  "what changed" instruction after a founder pause or a full process restart.
- `brain/src/operator-mcp.mjs` is the stdio MCP bridge the Claude Code subprocess connects to. It
  routes the operator tools through `executeOperatorTool` against the durable session store and exposes
  no approve/send/publish tool by construction.
- `brain/src/flow-store.mjs` owns durable flow edits and the run ledger.
- `brain/src/feedback-ledger.mjs` owns normalized feedback signals from gates and run failures (the
  taste loop). It also crystallizes repeated deterministic procedures into PENDING, gated
  `ToolBirthProposal` signals (it never auto-births).
- `brain/src/tool-registry-store.mjs` owns the back half of the self-building loop — the durable,
  project-scoped registry and `approveToolBirth`, the one FOUNDER-only path that turns a pending proposal
  into a registered, callable tool. The wall holds: birth requires authored code + a test (re-asserted
  via `proposeTool`/`gateToolBirth`), there is no agent/operator approve path, and the founder drives it
  from the `ToolForge` dashboard card via `POST /api/projects/:id/tool-proposals/:id/approve`. (Executing
  a registered tool inside the step runtime is a deliberately separate, not-yet-built leg.)
- `brain/src/run-grounding.mjs` builds the grounding a run reads; `brain/src/run-compare.mjs` diffs two
  runs (both extracted from the deleted program machinery as neutral helpers).
- `brain/src/engine.mjs` derives the GTM engine state (all subsystems) from real signals — scan, run
  ledger, connectors, gate decisions. Powers inline node health and the Problems rail. Never seeded.
- `brain/src/memory.mjs` is the taste loop: it reads founder gate decisions out of the ledger and shapes
  them into guidance for the next run.
- `brain/src/mcp.mjs` is the MCP server that exposes the engine to Claude as tools.
- `brain/src/project-store.mjs` owns the project manifest, its channels (plain flows now, not program
  workflows), the shared context (ICP, positioning, structured `Claim` objects with a back-compatible
  string view, experiments, founder taste), and the people projection.
- `brain/src/person-store.mjs` owns the durable, project-scoped, shared `Person` object — run entrants
  promoted into one identity across channels (strongest-identifier key), each carrying its per-appearance
  trigger. Real GTM state derived from runs, never seeded, never sends.
- `brain/src/cross-reference.mjs` owns the "where does X appear across channels" index for
  person / icp / claim / experiment — the find-references query behind dedup and the canvas.
- `brain/src/product-model-store.mjs` + `product-model-generator.mjs` own the Product mode interpretive
  `ProductModel` (a separate feature from the GTM run; `program-projection.mjs` survives only to
  reconcile its events).
- `brain/src/workspace.mjs` owns durable repository workspaces, proof runs, revisions, and founder
  decisions. `revision.mjs` owns review, clean-repository apply, and checked revert. `build.mjs` creates
  an isolated git worktree and invokes an agent for a narrow code repair.
- `brain/src/connectors/` are headless, capability-declaring connectors
  (source / enrich / filter / generate / gate / execute / measure). They are the `tool` step kind — one
  vocabulary among the open kinds, kept for deterministic work, not the only way to express a GTM system.
  New agent capability belongs in a subagent or skill, not a new connector.
- `brain/src/server.mjs` serves the local API and the built React client.
- `ui/` is the canonical product interface — the object-model canvas (`canvas/CanvasShell.tsx`: one
  projection-over-an-object-model engine with lenses, used by BOTH GTM and Product modes), the interactive
  run canvas with the founder gate (`GraphCanvas.tsx`, rendered by the channel-flow lens), the Problems
  rail, the node editor, the channel switcher, the find-references panel (`ReferencesPanel.tsx`), and the
  self-built-tools card (`ToolForge.tsx`). GTM mode projects the operational object model through four
  lenses (channel-flow, engine, people, experiment-matrix); Product mode projects the interpretive
  `ProductModel`. No swimlanes, no program/outcome views.
- `Sources/GTMIDE/` is an earlier SwiftUI prototype, not the current release path.

## Product invariants

- The citation rule binds the truth layer, not the head. Claims about what the product *already does* —
  the scan, `product-understanding.mjs`, engine/measure derivation — are proven by production-code
  citations or marked inferred or blind. Comments, tests, docs, UI copy, and scanner pattern definitions
  are not evidence. This rule does NOT govern ideation, strategy, or composition: go-to-market ideas run
  free, may be openly speculative, and must never be forced to cite a line. Constrain the hands (the gate,
  typed mutations, staged execution), not the head.
- The harness is Truth + Wall + Taste, and nothing else. The host does not impose a program, a policy, a
  capability factory, an opportunity board, a required pre-run object, or a contract that blocks a run
  before the gate. Building and running is the model's job; the host only owns truth, durable state, the
  wall, and typed mutations. Do not re-grow a fourth constraint.
- The founder gate is the ONLY contract checkpoint. No node before the gate blocks a run on item count
  or field names — `relaxGateContracts` + `relaxPreGateContracts` zero pre-gate contracts at run time, so
  a freely-composed graph reaches the gate on whatever it produced and the founder reviews it there.
  Contracts remain advisory (UI/validation), never a dead-end.
- Engine and node health are derived from real state (scan, run ledger, connectors, decisions), never
  seeded. A subsystem with no signal reports that honestly rather than showing a confident fake number.
- Scanning is read-only. The build action may create a local branch and worktree, but stops before
  commit, push, deployment, or PR. Direct patch application requires explicit confirmation, an approved
  revision, the original base commit, a clean source worktree, and a successful patch check.
- GTM flow execution stops at founder gates. The default execution connector stages actions locally and
  never sends or publishes. Gate continuation reuses the exact prepared run items; it does not rerun live
  source, enrichment, or generation work behind the founder's back. Graph changes created by a model use
  typed operations and pass graph validation. The one carve-out is the **per-channel autonomy ladder**:
  a channel the founder explicitly promoted to `trusted`/`autonomous` carries a blessed pattern that the
  gate auto-applies to clean items, holding only the exceptions. This is standing founder approval, never
  the wall's removal — the gate node stays present, autonomy is set ONLY by an explicit founder promotion
  (never by composition or a run; the typed graph path rejects forging `autonomy`/`blessedPattern` onto a
  gate node), and `revokeChannel` drops it back to hold-everything in one click. NOTE (Phase 1 status):
  the ladder's stores and promotion API exist and are tested, but are not yet wired to a server route or
  the canvas — promotion is backend-only today. The BYO credential store (`credential-store.mjs`) is the
  same: durable and tested, but `resolveCredentialToken` has no connector caller yet, so connectors still
  read `process.env`. Both are deliberate backend scaffolding, not operable end-to-end.
- The host owns truth, state, and the gate; the intelligence is rented. If a unit of work is fuzzy
  (research, enrich, ideate, draft, propose), it is a skill or a subagent reached through an open step —
  not a Node connector. Code is for the deterministic spine only.
- A workflow is composed from open step kinds; the connector taxonomy is an optional label, never the
  thing that limits what the agent can express.
- The taste loop shapes the next run, not a creation rule. Founder approvals, rejections, edits, run
  failures, and measurement gaps become `FeedbackSignal` records that feed the next run's memory
  (`get_taste`) and, when a deterministic procedure recurs, a gated `ToolBirthProposal` the founder can
  approve into a registered tool. There is no agent-creation policy to revise — agents are composed inline.
- Composition is not a fixed skeleton. The graph topology is composed by the model (`composition.mjs`,
  injectable; live `createClaudeComposer`; doctrine in the editable `~/.claude/agents/gtm-compose-workflow.md`)
  — it may branch, parallelize, gate more than once, or close a loop. The host normalizes the spec, binds the
  founder's concrete input/output, and enforces the wall: every `execute` node must have a founder `gate`
  upstream on every path, or the composition is rejected. The blank default refuses rather than falling back
  to a template.
- Grounding does not shape. The scan reports only cited, reproducible reality — never a fixed go-to-market
  taxonomy and never a pre-written channel. Deciding what is GTM-relevant and what channels to run is the
  model's job, rented — ideation is the composer's thinking posture, not a host-side auto-proposer that emits
  an accept/reject board. The founder (or Claude) names a channel directly and it composes into a graph
  (`composeNakedGraph`); the `Ideate` button drives the composer's posture so the model thinks out loud
  before committing. There is no `opportunity-engine.mjs`, no `ideation.mjs`, no program compiler; channel
  and agent lists are never hand-written in `.mjs`.
- The canvas is a projection over an object model, not a fixed diagram. One canvas engine renders
  `projection(objectModel, lens)`; shared objects are shared nodes; selection persists across lenses;
  there is no fixed swimlane skeleton. Two modes project two object models across the truth wall: Product
  mode projects the interpretive `ProductModel` (never feeds health); GTM mode projects the operational
  object model (Channels, Sources, People, Claims, Experiments, ICPs — real state that DOES drive health,
  navigated by channel). The two object models never cross. See `docs/CANVAS.md`.
- Person is a first-class, durable, project-scoped shared object (`person-store.mjs`), created by promoting
  real run entrants into durable identities with cross-channel appearances. It enables find-references,
  dedup, fatigue control, and the experiment matrix. Real GTM state derived from runs — never seeded, never
  sends.
- The composer is locked to one durable operator conversation per project; `projectId` is threaded
  explicitly, never inherited from a mutable global.
- Output kind is open: a node's output is any non-empty label the model chooses (`OUTPUT_KIND_HINTS` in
  `graph-operations.mjs` are UI hints, never a validation gate). No output kind — message, artifact,
  dataset, signal — is privileged. Enforced by `brain/test/anti-cage.test.mjs`.
- Taste and design are required queried tools before drafting or producing UI. A drafting agent's tool
  calls must include `get_taste`; a visual one's must include `get_taste` AND `get_design`. Enforced by
  `assertMoatConsulted` in `consult-guard.mjs`: the invoker captures real tool calls onto `meta.toolCalls`,
  and at the gate `collectConsultViolations` folds a `consultBlocked` result into the run's success.
  `get_taste` is backed by real founder gate decisions and `get_design` by real design state — neither is a
  stub.
- The gate supports pattern and exception approval at volume (`gate-pattern.mjs`): the founder approves a
  class of items with a rule and marks exceptions individually, so high-volume runs do not require per-item
  review.
- No hard scope around any GTM motion is enforced in the engine. `brain/test/anti-cage.test.mjs` guards: no
  closed GTM-channel enum in core code, no output kind fixed to email/message, no re-introduced fixed stage
  skeleton. The cage stays removed.
- Preserve unrelated user changes; this worktree may already be dirty.

## Verification

- Scanner changes require regression coverage in `brain/test/scan.test.mjs`.
- Engine-derivation changes require coverage in `brain/test/engine.test.mjs`; the taste loop is covered in
  `brain/test/memory.test.mjs`.
- Operator-runtime changes require `brain/test/operator-runtime.test.mjs`; typed graph changes and
  persistence are covered by their corresponding tests.
- UI changes require `npm test` and browser verification of the loop (the goal launcher → operator "Go" →
  the run reaching the founder gate), node health + Problems rail, find-references, and graph
  partial-failure flows.
- The Buffalo Projects acceptance case is `~/Buffalo-Projects` with `project_created`; the expected result
  is a proven attribution gap, and the Measure subsystem reports blind attribution from that same scanned
  win event.

## Definition of done

The requested behavior is implemented, the diff is scoped, `npm test` passes, the visible flow is checked
when relevant, engine and node numbers stay derived from real state, and any publishing or external-state
action remains explicitly approved.

Last verified: 2026-06-29. Architecture note: two cages were removed. First the connector-DAG taxonomy was
un-caged into the open node model (tool/agent/skill/code/mcp) — see `docs/GOAL.md`. Then the
outcome-program / policy / capability-foundry / portfolio layer was deleted entirely, leaving the naked
harness (Truth + Wall + Taste): the operator drives a goal to the founder gate through a slim toolset and a
free compose (`composeNakedGraph`), proven live. If a doc, test, or module still describes programs,
policies, the foundry, or portfolio composition as load-bearing, it is stale — the machinery is gone.
