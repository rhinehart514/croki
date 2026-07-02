> **SUPERSEDED — 2026-07-01.** This describes the earlier "IDE for GTM" version of
> the product (a build-your-own canvas of boxes and wires). The current plan of record
> is **docs/GTM-ENGINE-REBUILD.md**, which reframes Drover as a GTM engine and compiler.
> Where this doc conflicts with that spec, the spec wins. Kept for history only.

---

# GOAL — Un-cage Drover into an actual IDE for GTM engineering

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
  independent repository grounding, pipelines, opportunity decisions, and shared
  intelligence. The product generates reviewable pipeline and agent opportunities,
  separates code-derived claims from speculative bets, lets the founder select Claude
  or Codex per agent, and composes accepted opportunities into a validated gated
  workflow. Inputs support manual rows, CSV, and HTTP APIs; outputs support local staging
  and gated HTTP APIs; measure feeds observed outcomes and founder decisions back into
  the next run's learning context.

- **P6 — un-shape grounding; ideate instead of templating. ← landed, proven live.** The
  truth layer stops prescribing a go-to-market shape. `product-understanding.mjs` no longer
  carries a fixed GTM signal taxonomy with pre-written pipeline recommendations — grounding
  now reports only cited, reproducible reality (win event, attribution, stack, blind spots).
  Opportunity generation is no longer hand-written `.mjs` judgment (a fixed pipeline list +
  hardcoded speculative bets + four fixed agents). It is rented intelligence: `ideation.mjs`
  exposes an injectable ideator (honest blank default, `createClaudeIdeator` live on the
  subscription, fakes in tests) that reads the grounding AND the real repository and proposes
  pipelines with zero shape baked in — outbound, in-product loops, pull/inbound, or a code
  change that closes an instrumentation gap, none privileged. The host still owns the walls:
  it normalizes proposals into the stored shape and demotes any "derived" claim that carries
  no `file:line` evidence to "speculative" so the truth/bet line never blurs. The ideation
  doctrine lives in `~/.claude/agents/gtm-ideate-channels.md` — an editable markdown artifact,
  not host code. Proven 2026-06-22 on `~/Buffalo-Projects`: live ideation returned product-true
  pipelines the old taxonomy could not express — a builder self-share loop, a vouch-request
  peer reach, a cohort-ritual inbound motion, and an "attribution repair" code-change pipeline —
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

- **P8 — make agent creation a first-class domain process. ← landed.** Accepted opportunities
  no longer jump straight into a graph. The host now compiles a durable `OutcomeProgram`,
  creates `AgentCreationPolicy` records with contracts, evidence requirements, safety rules,
  and evaluation signals, assembles `PersonalizationProfile` records from product truth,
  founder taste, market memory, program context, and blind spots, then creates
  `AgentInstance` records before writing the editable agent markdown artifact. Composed agent
  nodes carry `programId`, `agentInstanceId`, `creationPolicyId`, and
  `personalizationProfileId`, so workflow execution can trace every output back to the rules
  that created the capability. Founder gate decisions and run failures are normalized into a
  feedback ledger and update those creation policies, which makes feedback improve the next
  agent's birth conditions rather than only the next prompt.

- **P9 — make the domain executable. ← landed.** The DDD nouns now have command and event
  paths. `domain-commands.mjs` exposes program verbs such as `CreateOutcomeProgram`,
  `DefineMeasurementPlan`, `RunProgram`, `ReviseAgentPolicyFromFeedback`, and
  `CreateNextAgentVersion`; `domain-events.mjs` records the durable history. `program-runtime.mjs`
  is the caller-facing runner: it loads a program, enforces the measurement gate for scaled
  execution, runs the underlying graph, pauses at founder gates, records feedback signals,
  evaluates every agent instance after each run, creates append-only policy revisions, and mints
  the next agent instance version when feedback materially changes a policy. The resident
  operator now has program-first tools, with graph tools kept as lower-level repair tools. The
  acceptance test proves founder outcome → program → policy/profile/agent → workflow → gate →
  founder edit/rejection → feedback → policy v2 → agent instance v2.

- **P10 — the object-model canvas. ← landed (P10.1–P10.6; npm test green).** The canvas stops being a fixed
  diagram and becomes a projection over an object model — one canvas engine rendering
  `projection(objectModel, lens)`, with two modes projecting two object models across the
  truth wall (Product mode → the interpretive `ProductModel`, never feeds health; GTM mode
  → the GTM operational object model — Pipelines (`channel` in code), Sources, People,
  Claims, Experiments, ICPs, Outcomes — real state that does). The keystone is a durable
  first-class **Person**
  object (`person-store.mjs`) promoted from run entrants, enabling find-references, dedup,
  and the experiment matrix; swimlanes retire; the composer controls the canvas (free
  view-control + gated mutation) locked to one conversation per project; and the cards
  re-axe to GTM objects with a judgment verdict. See `docs/CANVAS.md` for the full route
  and its sub-steps (P10.1–P10.6).

- **P11 — remove the opportunity object; pipelines are direct. ← landed.** The
  auto-generated opportunity accept-list (the generate-then-review RAG pattern the founder
  rejected) is gone. `opportunity-engine.mjs`, `ideation.mjs`, the `OpportunityStudio` board,
  and the `list_opportunities` / `generate_opportunities` / `review_opportunity` tools are
  deleted. A pipeline is now named directly — by the founder or by Claude — and compiled into a
  program: `compileOpportunityProgram` → `compileChannelProgram` (a plain
  `{ id, title, objective }` pipeline plus inline agent specs, not a stored accept/reject
  record), and `compose_opportunity_channel` → `compose_channel`, taking the inline pipeline
  spec. Ideation no longer runs as a host module; it is the composer's thinking posture (the
  `Ideate` button drives `composerPosture`), with the pipeline doctrine still in the editable
  `~/.claude/agents/gtm-ideate-channels.md`. The references to `ideation.mjs`,
  `composeOpportunityChannel`, and "accepted opportunities" in P5–P8 above describe the
  superseded mechanism — the phases happened, but the opportunity object they centered on no
  longer exists.

## The open GTM substrate

The host owns four things and only four: the `file:line` product scan (truth), the durable
stores and run ledger (state), the founder gate (the wall), and typed validated mutations
(the only way the graph can change). Everything else is open.

What context the agent pulls, which pipelines it proposes, what the workflow topology looks
like, what output kind a node produces, and which tools exist — all of that is decided by
the model at the time of the run, not baked into the host. The agent pulls grounding through
retrieval tools on demand (`get_product`, `get_taste`, `get_design`, etc.) rather than eating
a pre-packed block; it composes the graph from open step kinds (`tool`, `agent`, `skill`,
`code`) with no fixed skeleton; and it labels output with any kind it chooses — there is no
enum that limits it to "email" or "message."

Microproducts, outreach pipelines, in-product loops, attribution repair, vouch campaigns —
these are all compositions over this substrate, not pillars the host pre-builds. The host
normalizes what the model proposes (it validates the graph, demotes unsupported evidence
claims, enforces the wall), but the model decides the shape. That separation is what lets
a founder describe what they want in plain language and get a real GTM system back, not a
fill-in of fixed slots.

## Done = proven

Each phase ships with `npm test` green and the visible behavior checked. No phase claims
a capability the repo and the live product don't support.
