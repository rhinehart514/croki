# AGENTS.md

## Product purpose

GTM IDE is the IDE for go-to-market. You point it at your product's codebase; it
reads what the product actually does and where wins actually enter; then you build,
edit, and run go-to-market systems the way you vibe-code — describe the change in plain
language, watch it change, run it, and gate anything that touches the outside world.

A GTM system is composed, not a fixed pipeline. The domain object is the
`OutcomeProgram`; the capability object is the personalized `AgentInstance`; the
compounding rule object is the `AgentCreationPolicy`; and the `GTMGraph` is the
execution plan. A workflow step can be a connector (`tool`), a subagent (`agent`), a
skill, or `code` — whatever the frontier model composes. The real artifacts of GTM
engineering are outcome programs, workflows, skills, and agents, and the founder (and
the operator) build them here.

The wedge is grounding plus capability creation. Every other GTM AI tool is ungrounded
and collapses to the generic. GTM IDE grounds the model in three things at once: the
real product code (a read-only scan with `file:line` evidence), the live run state (an
MCP server lets Claude operate the engine through tools), and the founder's own taste
(the loop learns from every gate decision). The result is GTM that knows your product
instead of guessing at it, then uses feedback to improve the rules that create the
next specialized agent.

The spine is "vibe up to the gate, never past it." Building and editing a flow is
fast and reversible, exactly like code. Execution — anything that sends, publishes,
or charges — is a hard wall behind a founder gate.

The resident GTM operator owns the IDE loop inside the product: it accepts a durable
goal, inspects product evidence and live problems, changes the graph through validated
typed operations, runs and debugs it, pauses at founder gates, and resumes from the
exact reviewed artifacts. Its session survives browser and process interruptions.

GTM is debugged like a codebase. Every node in the flow carries real health derived
from the scan, the run ledger, and connector state; a Problems rail ranks what is
wrong across the whole system and routes you to the node that fixes it. Two front
doors stay in lockstep: the human dashboard and the agent (MCP) interface drive the
same engine.

Approach — the route, do not drift from it. The host is thin and owns only what a model
must not: the `file:line` scan (truth), the durable stores and run ledger (state), the
founder gate (the wall), and typed validated mutations. The intelligence is rented, never
rebuilt in the host — the operator drives on the founder's Claude subscription (or Codex
headless) and composes workflows out of open steps, reaching the GTM capability that
already lives in skills (`ideate`, `positioning`, `distribute`) and subagents
(`gtm-enrich`, `gtm-signal-github`). Two anti-patterns to refuse: do not re-implement an
agent capability as a Node connector, and do not treat the legacy `cold-outbound`
connector DAG as "the loop to fix" — that fixed taxonomy is the cage that was removed.
The connector registry survives only as the `tool` step kind, for genuinely deterministic
work (the scorer, the HTTP sender). Outreach runs as an agent-composed workflow, not as
Exa→Clay→draft.

Honest frontier: the open node model is real and tested — `tool`/`agent`/`skill`/`code`
steps dispatch through an injectable step runtime (`step-runners.mjs`), the agent and
skill bridges are wired to the subscription (`agent-bridge.mjs`), and the canvas renders
the kinds. Proven 2026-06-22: an agent step executes live on the subscription — a real
model task returned parsed items that flowed through the workflow in ~7s, keyless. Not
yet proven: the operator (Claude) itself composing an agent-step workflow and driving it
to the gate. The on-disk subagent definition now loads: `loadAgentDefinition` reads
`~/.claude/agents/<ref>.md` and `buildAgentPrompt` merges its doctrine into the run
(tested in `agent-bridge.test.mjs`); what is still fixed is the toolset — every agent runs
with the same read-only tools, not its own declared toolset. Portfolio fan-out is built
and unit-tested but not yet proven live or UI-rendered: `portfolio-graph.mjs`
(`assemblePortfolioGraph`) unions several composed systems into one branching, multi-gate,
lane-laid-out diagram and re-asserts the wall on the union, and `composePortfolioGraph`
(`workflow-composer.mjs`) composes many accepted channels toward one goal — the engine
turns one goal into many systems, but the live model producing those specs and the canvas
rendering the lanes are still pending. A credential-gated live smoke test
(`brain/test/live.test.mjs`, `npm --prefix brain run test:live`) exists to prove the model
actually composes and an agent step runs on the subscription; it skips until a founder is
signed in. Not yet built: authoring skills and agents from the UI, the three-lane
workflows/skills/agents workspace, and the operator's "propose systems" move. A scanned
product whose win event carries no source stays honestly "blind" in Measure until that
attribution gap is repaired in the product code.

## Canonical commands

- Run: `npm start`
- Full verification: `npm test`
- MCP server (agent front door): `npm run mcp`
- Direct scan: `node brain/src/mirror.mjs <repo> --win <event>`

## Architecture

- `brain/src/scan.mjs` owns grounded repository analysis — the code grounding, with
  `file:line` citations.
- `brain/src/graph.mjs` owns the GTM workflow DAG: dependency-scoped execution, founder
  approval gates, exact gate continuation, the learning-memory injection point, and
  dispatch by node `kind` (a `tool` node runs a connector; `agent`/`skill`/`code` nodes
  run through the injectable step runtime).
- `brain/src/step-runners.mjs` owns the open step kinds — the un-caging. `agent`, `skill`,
  and `code` steps dispatch here, not through the connector registry. The runtime is
  injectable (honest blank defaults; `createStepRuntime` for live; fakes in tests) so the
  host never owns the intelligence.
- `brain/src/source-entry.mjs` owns the single domain rule for how a workflow gets its first
  items — the one predicate (`sourceStandsOnData`) and the one compose-time normalizer
  (`resolveEntry`) that used to be duplicated across the composer and the runner. A source has
  one of two modes, derived from its shape so the label can never lie: `provided` (a
  connector-backed seed — manual/csv/api — the founder configures and controls) or `discovered`
  (an agent that self-sources). The mode is decided VISIBLY at compose time in the graph the
  founder persists; the run path never silently rewrites topology. It also owns the run-path
  contract rules: `relaxGateContracts` (always — the gate is the contract checkpoint) and
  `relaxDiscoveryChainContracts` (only when the entry is discovered, since a best-effort
  discovery chain is not contract-rigid while a provided chain keeps its declared fields).
- `brain/src/agent-bridge.mjs` owns the real step bridges: a skill loader (reads
  `~/.claude/skills/<ref>/SKILL.md`) and a Claude agent invoker that runs a read-only
  subagent on the founder's subscription (OAuth-first, no key, no send/publish path).
  `liveStepRuntime` composes both; the server and operator run paths pass it to `runGraph`.
- `brain/src/graph-operations.mjs` owns validated, reversible typed graph changes. Open
  `kind` steps require a `ref` instead of a registry category; category is an optional
  label, not the dispatch key.
- `brain/src/operator-store.mjs` owns durable resident-operator sessions and events.
- `brain/src/operator-runtime.mjs` owns the model/tool loop: inspect, patch, validate,
  run, diagnose, pause, resume, and complete. It owns every durable and safety
  decision (session state, ledger, gates, cancellation, restart recovery) and selects
  a provider-neutral runtime to do only the reasoning.
- `brain/src/runtimes/` are the operator runtime adapters behind one "drive the
  session to its next pause" interface: `claude-code.mjs` (preferred local runtime — a
  Claude Code subprocess on the founder's subscription, no raw key), `anthropic.mjs`
  (direct API), and a slot for a future Codex subprocess. Runtime selection is
  OAuth-first: it prefers Claude Code only when the founder is actually signed in (a
  stored subscription login or `CLAUDE_CODE_OAUTH_TOKEN`), treats a raw
  `ANTHROPIC_API_KEY` as the last-resort fallback, and — when on the subscription —
  strips any stray key from the subprocess so the run bills the subscription, not the
  key. With no credential at all it reports an honest cold-start blocked state naming
  the options instead of crashing the SDK. Conversation memory is real on the subscription
  runtime: the SDK persists its transcript (`persistSession`) and GTM IDE stores the captured
  session id on the durable operator session, so each later drive `resume`s the same conversation
  with only the "what changed" instruction (founder response, gate resolved, proposal decided)
  instead of restarting cold after a founder pause or a full process restart. If the prior
  transcript is gone, it falls back once to a fresh pass that re-inspects from the goal.
- `brain/src/operator-mcp.mjs` is the stdio MCP bridge the Claude Code subprocess
  connects to. It exposes the same typed operator tools and routes them through
  `executeOperatorTool` against the durable session store, so persistence and safety
  stay GTM-owned. It exposes no approve/send/publish tool by construction.
- `brain/src/flow-store.mjs` owns durable flow edits and the run ledger.
- `brain/src/program-store.mjs` owns durable outcome programs: desired outcome,
  buyer hypothesis, channel hypothesis, measurement plan, status, and workflow link.
- `brain/src/agent-policy-store.mjs` owns agent creation policies: contracts, evidence
  requirements, positive/negative rules, safety rules, evaluation signals, and revision
  from feedback.
- `brain/src/capability-foundry.mjs` owns personalization profiles and agent instances:
  the product/founder/market/program context used at birth and the concrete agent
  capability created from it.
- `brain/src/program-compiler.mjs` owns the domain handoff from accepted opportunities
  into outcome program → policy → personalized agent → executable graph.
- `brain/src/feedback-ledger.mjs` owns normalized feedback signals from gates and run
  failures, and feeds them back into agent creation policies.
- `brain/src/engine.mjs` derives the GTM engine state (all subsystems) from real
  signals — scan, run ledger, connectors, gate decisions. Powers inline node health
  and the Problems rail. Never seeded.
- `brain/src/memory.mjs` is the learning loop: it reads founder gate decisions out of
  the ledger and shapes them into guidance for the next run.
- `brain/src/mcp.mjs` is the MCP server that exposes the engine to Claude as tools.
- `brain/src/project-store.mjs` owns the multi-channel project manifest.
- `brain/src/workspace.mjs` owns durable repository workspaces, proof runs, revisions,
  and founder decisions.
- `brain/src/revision.mjs` owns review, clean-repository apply, and checked revert.
- `brain/src/build.mjs` creates an isolated git worktree and invokes an agent for a
  narrow code repair.
- `brain/src/connectors/` are headless, capability-declaring connectors
  (source / enrich / filter / generate / gate / execute / measure). They are the `tool`
  step kind — one vocabulary among the open kinds, kept for deterministic work, not the
  only way to express a GTM system. New agent capability belongs in a subagent or skill,
  not a new connector.
- `brain/src/server.mjs` serves the local API and the built React client.
- `ui/` is the canonical product interface — the loop canvas, the Problems rail, and
  the node editor.
- `Sources/GTMIDE/` is an earlier SwiftUI prototype, not the current release path.
  Reconsider only when full Xcode is available and native packaging is an explicit
  goal.

## Product invariants

- The citation rule binds the truth layer, not the head. Claims about what the product
  *already does* — the scan, `product-understanding.mjs`, engine/measure derivation — are
  proven by production-code citations or marked inferred or blind. Comments, tests, docs,
  UI copy, and scanner pattern definitions are not evidence. This rule does NOT govern
  ideation, strategy, or composition: go-to-market ideas run free, may be openly
  speculative, and must never be forced to cite a line. Grounding is a tool the model
  reaches for when a call turns on a product fact — pull, not a tax on every turn.
  Constrain the hands (the gate, typed mutations, staged execution), not the head.
- Engine and node health are derived from real state (scan, run ledger, connectors,
  decisions), never seeded. A subsystem with no signal reports that honestly rather
  than showing a confident fake number.
- Scanning is read-only.
- The build action may create a local branch and worktree, but it stops before
  commit, push, deployment, or pull-request creation.
- Direct patch application requires explicit confirmation, an approved revision, the
  original base commit, a clean source worktree, and a successful patch check.
- GTM flow execution stops at founder gates. The default execution connector stages
  actions locally and never sends or publishes; "vibe up to the gate, never past it."
- Graph changes created by a model use typed operations and pass graph validation.
- Gate continuation reuses the exact prepared run items; it does not rerun live source,
  enrichment, or generation work behind the founder's back.
- The host owns truth, state, and the gate; the intelligence is rented. If a unit of work
  is fuzzy (research, enrich, ideate, draft, propose), it is a skill or a subagent reached
  through an open step — not a Node connector. Code is for the deterministic spine only.
- A workflow is composed from open step kinds; the connector taxonomy is an optional
  label, never the thing that limits what the agent can express.
- Agent creation is a first-class domain process. No personalized agent is born without
  a specific job, input contract, output contract, evidence requirement, safety rule,
  and evaluation signal. A graph may run an agent instance, but the graph is not the
  policy that created that agent.
- Feedback improves creation rules, not only runtime prompts. Founder approvals,
  rejections, edits, run failures, observed outcomes, and measurement gaps become
  `FeedbackSignal` records that can revise the relevant `AgentCreationPolicy`.
- Composition is not a fixed skeleton. The graph topology is composed by the model
  (`composition.mjs`, injectable; live `createClaudeComposer`; doctrine in the editable
  `~/.claude/agents/gtm-compose-workflow.md`) — it may branch, parallelize, gate more than once,
  or close a loop. The host normalizes the spec, binds the founder's concrete input/output, and
  enforces the wall: every `execute` node must have a founder `gate` upstream of it on every
  path, or the composition is rejected. The blank default refuses rather than falling back to a
  template.
- A workflow's entry is one of two first-class, founder-visible source modes — `provided` and
  `discovered` — and BOTH are real (see `source-entry.mjs`). The mode is decided at compose time
  in the persisted graph and derived from the node's shape (a connector source is provided; an
  agent source is discovered), so the label can never disagree with what the runner does. The
  run path NEVER silently rewrites the entry topology: a founder's connector source stays a
  connector source. A provided source that has no seed does not dead-end on a cryptic downstream
  error — it reports an honest "configure this source" state and the founder supplies the seed
  (manual/csv/api) they control. A graph with no concrete input is composed with a discovered
  (self-sourcing agent) entry instead, so a fresh composition still runs on its first try and
  reaches the founder gate.
- Grounding does not shape. The scan and `product-understanding.mjs` report only cited,
  reproducible reality — never a fixed go-to-market taxonomy and never a pre-written channel.
  Reading the codebase must not collapse the product into outbound, accelerator, or any other
  direction. Deciding what is GTM-relevant and what channels to run is ideation's job, rented
  from the model through `ideation.mjs` (injectable ideator; honest blank default; live
  `createClaudeIdeator` reads grounding + the real repo; doctrine lives in the editable
  `~/.claude/agents/gtm-ideate-channels.md`). The host only normalizes proposals and demotes
  an evidence-free "derived" claim to "speculative". Opportunity generation is never hand-written
  channel/agent lists in `.mjs`.
- Preserve unrelated user changes; this worktree may already be dirty.

## Verification

- Scanner changes require regression coverage in `brain/test/scan.test.mjs`.
- Engine-derivation changes require coverage in `brain/test/engine.test.mjs`; the
  learning loop is covered in `brain/test/memory.test.mjs`.
- Operator-runtime changes require `brain/test/operator-runtime.test.mjs`; typed graph
  changes and persistence are covered by their corresponding operator tests.
- UI changes require `npm test` and browser verification of the loop (node health +
  Problems rail), workspace, change-review, and graph partial-failure flows.
- The Buffalo Projects acceptance case is `~/Buffalo-Projects` with `project_created`;
  the expected result is a proven attribution gap, and the Measure subsystem reports
  blind attribution from that same scanned win event.

## Definition of done

The requested behavior is implemented, the diff is scoped, `npm test` passes, the
visible flow is checked when relevant, engine and node numbers stay derived from real
state, and any publishing or external-state action remains explicitly approved.

Last verified: 2026-06-26. Revisit if the canonical interface or safety boundary
changes. Architecture note: the connector-DAG taxonomy was un-caged into the open node
model (tool/agent/skill/code) — see `docs/GOAL.md` for the route and its phases.
