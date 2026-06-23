# GOAL — Un-cage GTM IDE into an actual IDE for GTM engineering

## North star

GTM IDE is where you build and visualize the real artifacts of GTM engineering —
**workflows, skills, and agents** — grounded in your product's code, authored with a
frontier model (Claude Code / Codex headless), gated before anything touches the world.

It is not a fixed connector pipeline. A GTM system is whatever the agent can compose,
not a fill-in of nine predefined slots.

## The cage we are removing

A GTM system was modeled as a DAG of nodes drawn from a frozen 9-category connector
registry (`resource·source·context·enrich·filter·generate·gate·execute·measure`).
Dispatch ran only through `getConnector(category, connector)`. That caps the agent at
"assemble my pre-built connectors into my pre-named stages" — the opposite of an IDE.

Meanwhile the real GTM engineering already lives outside the cage, invisible to the IDE:
skills (`ideate`, `positioning`, `distribute`) and subagents (`gtm-enrich`,
`gtm-signal-github`, drafters). The product rendered a vendor DAG while the intelligence
sat in skills and agents the UI could not see or build.

## The model that replaces it

A workflow node carries a `kind`:

- `tool`  — a registered connector (the entire existing path; the default when `kind` is absent)
- `agent` — invoke a subagent by `ref` on the upstream items
- `skill` — apply a skill's judgment by `ref` to the run context
- `code`  — a bounded deterministic transform

The frontier model composes these freely. The connector registry becomes *one* kind of
step, not the only vocabulary.

## Invariants kept (these never move to the agent)

- `file:line` product grounding (the scan).
- Durable state (flow store, operator store, ledger).
- The founder gate — human-only; the agent has no approve/send/publish.
- Typed, validated graph mutations.

## Phases

- **P1 — open node model (brain).** `kind`/`ref` schema + validation, runner dispatch by
  kind, an injectable step runtime, and the agent-facing `add_node`/`update_node` schema
  opened to the new kinds. Backward compatible; all tests green. **← landed.**
- **P2 — real bridges. ← landed.** `agent` steps invoke subagents on the founder's Claude
  subscription (OAuth-first, no key — `createClaudeAgentInvoker` in `agent-bridge.mjs`);
  `skill` steps load guidance from `~/.claude/skills/<ref>/SKILL.md`. Both wired into the
  server and operator run paths via `liveStepRuntime`. Skill loading and agent-result
  parsing are unit-tested; the agent invoker's *live output quality* needs a real run on
  the subscription to confirm (a model call can't be unit-tested).
- **P3 — visualize the artifacts. ← landed (canvas).** The canvas renders `agent`/`skill`/
  `code` steps with their own icon, color, and `ref` label; the detail panel names the
  kind. Still to do: author a skill or define an agent *from* the command bar, and the
  three-lane workflows/skills/agents workspace view.
- **P4 — retire the cage. ← substantially landed.** Open-kind steps no longer require a
  registry category; category is now an optional semantic label, not the dispatch key.
  The connector registry remains as the `tool` path (kept on purpose — deterministic
  connectors like the scorer and HTTP sender belong in code).
- **P5 — product-to-system studio. ← landed.** Projects are selectable and preserve
  independent repository grounding, channels, opportunity decisions, and shared
  intelligence. The product generates reviewable channel and agent opportunities,
  separates code-derived claims from speculative bets, lets the founder select Claude
  or Codex per agent, and composes accepted opportunities into a validated gated
  workflow. Inputs support manual rows, CSV, and HTTP APIs; outputs support local staging
  and gated HTTP APIs; measure feeds observed outcomes and founder decisions back into
  the next run's learning context.

- **P6 — un-shape grounding; ideate instead of templating. ← landed, proven live.** The
  truth layer stops prescribing a go-to-market shape. `product-understanding.mjs` no longer
  carries a fixed GTM signal taxonomy with pre-written channel recommendations — grounding
  now reports only cited, reproducible reality (win event, attribution, stack, blind spots).
  Opportunity generation is no longer hand-written `.mjs` judgment (a fixed channel list +
  hardcoded speculative bets + four fixed agents). It is rented intelligence: `ideation.mjs`
  exposes an injectable ideator (honest blank default, `createClaudeIdeator` live on the
  subscription, fakes in tests) that reads the grounding AND the real repository and proposes
  channels with zero shape baked in — outbound, in-product loops, pull/inbound, or a code
  change that closes an instrumentation gap, none privileged. The host still owns the walls:
  it normalizes proposals into the stored shape and demotes any "derived" claim that carries
  no `file:line` evidence to "speculative" so the truth/bet line never blurs. The ideation
  doctrine lives in `~/.claude/agents/gtm-ideate-channels.md` — an editable markdown artifact,
  not host code. Proven 2026-06-22 on `~/Buffalo-Projects`: live ideation returned product-true
  channels the old taxonomy could not express — a builder self-share loop, a vouch-request
  peer reach, a cohort-ritual inbound motion, and an "attribution repair" code-change channel —
  each cited to real files the fixed scanner never read.

- **P7 — un-cage composition; the model designs the graph. ← landed.** `composeOpportunityChannel`
  no longer stamps one fixed skeleton (`context + source → agents → gate → output → measure`).
  The graph topology is composed by the model from the goal, the accepted agents, and the
  grounding — it can branch, run steps in parallel, gate more than once, close a loop, or be a
  single code-change. `composition.mjs` exposes an injectable composer (honest blank default
  that refuses rather than templating; `createClaudeComposer` live on the subscription; fakes in
  tests); doctrine lives in the editable `~/.claude/agents/gtm-compose-workflow.md`. The host
  owns only the invariants the model must not breach: it normalizes the spec, binds the founder's
  concrete input/output onto the model's source/execute nodes, validates the graph, and enforces
  the wall — every execute node must have a founder gate upstream of it on every path, or the
  composition is rejected.

## Done = proven

Each phase ships with `npm test` green and the visible behavior checked. No phase claims
a capability the repo and the live product don't support.
