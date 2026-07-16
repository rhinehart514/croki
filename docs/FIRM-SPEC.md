# The Firm — build spec of record

**Status:** spec of record for the physics rebuild and the holding-company north star.
**Derived from:** founder ideation session, 2026-07-14, on top of the experiment-machine discovery
interviews (2026-07-12) and a full-tree machinery audit (seven scouting passes over the current code).
**Last reconciled:** 2026-07-15 for immediate working theory and ordinary founder language.
**Scope:** product-agnostic and venture-agnostic. **Stage:** alpha.

This spec supersedes [OPEN-CANVAS-SPEC.md](OPEN-CANVAS-SPEC.md) and
[EXPERIMENT-MACHINE-SPEC.md](EXPERIMENT-MACHINE-SPEC.md) as the build direction. It keeps their
harness whole — truth, the founder wall, learned taste — and keeps their firm rails. Where those
documents grew object systems, stage skeletons, or enums, this spec deletes them. "Open" means the
host must not decide the founder's organization or the substance of what an agent may notice. One
readable firm configuration may record the founder's choices; a host-owned workflow taxonomy,
status enum, or compiled graph still re-creates the cage this rebuild exists to remove.

## The destination

Drover is the operating system for one-person holding companies.

A permanent AI staff runs any number of ventures around the clock. Product change and reaching the
market are one act. Every world-touching decision waits for the founder, whose job compresses to
judgment: stop, continue, or release — minutes a day, not hours. Each venture is a small, readable,
transferable artifact.

Named so no early choice caps them, the four scale axes of that destination:

1. **Across ventures** — a portfolio of isolated machines behind one decision wall.
2. **Across transfer** — a running venture is a file: exportable, importable, sellable, forkable.
3. **Across founders** — an opt-in, pattern-level exchange of what actually worked (never venture
   data; late-game, earned only after there are many firms).
4. **Across functions** — support, pricing, partnerships, operations: the same loop with zero new
   nouns, entered later because the wall built for cold outbound already exceeds what back-office
   functions need.

The wedge is one venture: vibe code your go-to-market. The wedge exercises every primitive below and
expands along all four axes without rework. The ease of the wedge never redefines the destination.

## The physics

Drover is a living venture atlas over one operating loop and one founder harness. The atlas lets the
founder preserve concepts and relationships in their own language, then gives only a small operational
kernel host-defined meaning when that meaning must change execution, attribution, prioritization, or
evidence. The canvas shows the venture before it shows the machinery.

The signature first-use moment is immediate. One plain-language direction produces a complete,
editable working theory of the venture on the canvas and begins useful inward work in the same turn.
The theory may include who the venture helps, how value happens, several ways to reach people,
campaigns worth trying, and concrete product or market actions. It appears as Drover's provisional
reading—not as durable truth, a taxonomy, or a plan the founder must approve before anything useful
happens. Real work and returned evidence strengthen or revise the theory; only the founder makes
structure durable or authorizes an act that crosses into the world.

Founder language is a separate invariant from the internal model. The interface uses the founder's
words and concrete descriptions such as “rewrite onboarding,” “contact these buyers,” “launch this
campaign,” “review what changed,” and “try another approach.” It never requires **bet**, **motion**,
**fork**, **outcome**, **the wall**, **pipeline**, **stage**, or another Drover noun. Familiar domain words remain
available when the founder uses them. Historical names such as `bet` and `fork` remain in storage,
routes, tests, and the technical sections of this spec until an intentional migration; they are
compatibility identifiers, not founder-facing product concepts.

Open architecture material is not a hidden workflow. A concept, labeled relationship, or named area
may remain descriptive forever. Drover may infer and display a full working theory immediately, but
inferred structure remains provisional. It can guide inward work without becoming durable
architecture or granting authority. Exact work, founder decisions, and returned evidence remain the
consequential loop beneath the theory.

Supporting records such as a venture manifest, firm configuration, founder-attention item, placement,
heat setting, product-change receipt, or architecture revision may exist internally when they preserve
a rail. They must not become parallel stores, workflow stages, score systems, or administrative
taxonomies.

### The internal architecture kernel

These distinctions let Drover reason about reuse, attribution, and consequences. They do not dictate
canvas labels, navigation, or words the founder must learn. The visible name should describe the
specific business meaning, usually in the founder's own language.

**Concept.** Founder-defined architecture material with stable identity and open language. Actors,
needs, promises, offerings, product capabilities, surfaces, distribution doors, constraints, and
venture-specific ideas can remain concepts without acquiring host-level types. Concepts may be
selected, connected, grouped, discussed, and proposed for an operational role. They do not alter
runtime priority, attribution, return ordering, or wall behavior by themselves.

**Product loop.** The intended actor-to-value mechanism: an actor, entry, ordered founder-written
steps, value, and intended change. Repository-backed product claims cite product truth or remain
visible inference. The steps are addressable context, not host stages.

**System.** A persistent reusable capability. One capability may support several ways of reaching
people without
duplication and may support product-loop steps. It has no host-owned kind, owner, maturity, health,
stage, or score.

**Motion.** An internal name for a repeatable actor-to-value route composed from reusable capabilities
and coupled to product value. Its
ordered systems state intended architecture, not an executable workflow. Activation, evidence, and
pressure are derived rather than stored statuses.

**Campaign.** A bounded activation of one primary way of reaching people for an audience and
objective, joined to one primary thread of work and an explicit observation contract. It may touch
additional routes and supporting work without weakening primary attribution. Campaign is acceptable
founder language when it describes a recognizable campaign, never merely a Drover container.

### The consequential records

**Teammate.** Drover's default presentation of a durable configured participant: a persistent agent
with a soul (memory of lessons), a voice, and a track record of real outcomes. A founder may instead
present the same participant as an employee, direct model, specialist, team, automation, or their own
language. That choice changes the firm people experience; it does not create a second actor system.
Teammate refs and souls remain the compatibility seam, and founder-blessed lessons may still graduate
from a venture instance to a reusable template. Drover imposes no role, seniority, org chart, or
manager agent. If those relationships exist, they are open founder configuration—not host doctrine.

**Work thread (`bet` in current code).** The addressable envelope around whatever a teammate is
currently attempting: a message, an audience, a channel push, a price, a landing page, or a product
diff. The founder sees the concrete attempt, never “a bet.” The record carries only what the host
needs to preserve identity, venture scope, initial direction, time, joins, and optional branch
lineage. Evidence, prepared work, and returned-evidence references attach without becoming required
domain fields. Beyond that envelope, the thread has no host-owned substantive schema, kind, or stage.
Its position is derived from reality: active, waiting for the founder, or ended by the founder. When
it touches the product, its work lives in an isolated git worktree. Product work and market work use
the same envelope; Drover does not create two separate operating systems for them.

Attached work is not a fourth domain noun. A draft, list, page, diff, or other durable local result
may carry a small technical envelope so the founder can address and revise the exact same work:
stable identity, open content, owner and contributor references, timestamps, and provenance. It has
no required kind, stage, or workflow position. Revising attached work preserves its identity and
adds attribution rather than replacing it with an unrelated record.

**Returned evidence (`outcome` in current code).** What the world said back. A reply, a no-reply,
churn, activation, or a close is joined to the work that provoked it only as strongly as evidence
supports. Positive, negative, and zero results are equally first-class; unjoined signals stay
unattributed rather than being claimed. The founder sees what happened, in ordinary language, never
a scoreboard, sentiment number, or generic “outcome” container.

Returned evidence is its own durable venture record. A work thread may reference it, but does not embed a
second copy. Provider event identity deduplicates both joined and unattributed outcomes.
When a result answers one exact piece of work, an optional work reference preserves that lineage
through the outward act and the return; the work thread remains the broader join context.

**Release** is founder-facing but deliberately derived from exact staged work, its wall effect, the
founder decision receipt, and the execution result. It is not a duplicate durable record.

### Branching work

The machine may branch into genuinely different approaches. Founder copy names the consequence—
**try another approach**, **make a version for agencies**, **scale this**, **change the offer**—rather
than exposing the internal verb `fork`. Branching is the only structural operation on work; there is
no compose-a-graph, wire-a-pipeline, or configure-a-workflow. Configuring who participates and how
they interact changes the firm, not the substance or stages of its work. When the work is code, a
branch is literally an isolated git worktree.

### The one loop

Internally: **diverge → prepare → founder decision → act → observe → adapt**. Founder copy describes
the actual action and consequence rather than naming these steps.

Teammates try materially different approaches. Work forms locally — drafts, lists, pages, diffs —
with nothing outward. Any next act that would touch the world pauses for the founder. The founder
decides. The real result returns, joins to the originating work only where evidence supports it,
feeds teammate memory, and shapes what happens next. An outward act retains the exact originating
work reference; if no prior attachment exists, the approval record becomes that durable reference.
Returned evidence carries the same reference.

Founder direction carries explicit context for the whole venture, any selected architecture element,
selected teammates, an active thread, or exact attached work. Targeting changes what the participants receive,
what return briefs prioritize, and what resulting records point back to; it never compiles a host
workflow or decides how participants should reason together. Teammates do not define the venture's
far view. Runtime, model, configuration, coordination, tools, costs, and work logs remain inspectable
machinery behind the selected architecture.

The loop never idles while a venture is open. The wall is not a brake on the machine; it is the
license for everything inside it to run at full autonomy around the clock. While the founder is
away, inward work keeps branching — researching, drafting, revising weak approaches, and building
product diffs — while consequential decisions accumulate for the founder. The founder wakes up to
decisions, not busywork.

### The one lens

**The living canvas.** A continuous infinite spatial world where the founder sees and shapes how the
venture creates value, reaches the market, acts, and learns. It is not a page containing a diagram.
Pan, zoom, direct placement, drag relationships, stable landmarks, camera history, and focus that
expands in place are primary product behaviors. Backing out returns to the same camera and mental map.

Far away, the canvas shows venture intent, how value happens, active ways to reach people, current campaigns,
the nearest held release, returned reality, and founder judgment. At architecture depth it shows open
concepts, named areas, product-loop detail, reusable systems, shared routes, and qualified evidence.
Near a route or campaign it exposes the trace into concrete work, founder decisions, and returned evidence.
Near exact work it retains the Workyard's evidence, diffs, lineage, contributors, and decisions.

The canvas owns placement memory and nothing else. Semantic architecture lives in the venture state;
coordinates, route bends, z-order, camera, and decorative strokes remain presentation. Deleting
placement regenerates a deterministic atlas without losing meaning. The founder can always drag,
arrange, connect, focus, broaden, and use the deterministic outline. A table, route change, permanent
inspector, or dashboard may never replace this spatial operating surface.

### The one harness

Unchanged in authority, re-seated on the loop:

- **Truth.** Claims about what the product already does come from cited repository evidence or are
  labeled inference. Grounding is captured at generation time.
- **The wall.** One non-forgeable, founder-only checkpoint. The outward-release capability is
  host-issued at decision time, never persisted, never mintable by a model, browser read, API call,
  or MCP actor. Presence is a short volatile lease that lapses to away; away holds all outward
  effects and anything unrecognized, without pausing inward work. Deploy keeps its second explicit
  authorization.
- **Founder attention.** The wall is one surface, not one ambiguous action. An item declares whether it
  asks the founder to release outward work, answer a teammate, review returned evidence, or end active
  work. Each purpose admits only its own decisions; reviewing evidence does not block the work or
  pretend to release it.
- **Taste.** Founder approvals, rejections, edits, and kills feed the decision ledger and teammate
  souls. Drafting work must consult taste before it reaches the founder.

## Firm rails (founder-held, never automated away)

1. **Nothing goes outward without the founder's explicit hand** — every send, publish, deploy, and
   any spend. Away-state holds outward work unattended, always.
2. **Only the founder ends active work.** The machine may explain what it learned and propose a
   materially different approach; it never closes work itself.
3. **The founder releases each outward act with one decision.** Batch review is a convenience, not a
   delegation.
4. **The founder can see and refine anything, at any altitude, with no gatekeeping.**
5. **On a real reply, the machine alerts the founder and they decide together.**
6. **One venture is an isolated machine.** Ventures never bleed. Only founder-blessed lessons cross,
   through teammate souls, as patterns — never as venture data.
7. **The firm's heat is one founder dial.** How hard the inward loop runs — and what it may spend —
   is a single founder-owned setting with a spend rail. It never becomes a scheduler config surface.
8. **A venture is a file.** Local-first, readable, exportable. Nothing durable lives in provider
   state, opaque infrastructure, or a second remote authority. This rail is cheap today and is the
   entire transfer axis later; it is never traded away for convenience.
9. **The founder configures the firm.** Presentation, participants, organization, runtimes,
   capabilities, context, memory, coordination, activation, evaluation, budgets, and authority are
   one readable, versioned, attributable, reversible venture document. Agents may propose changes;
   they cannot apply them or expand their own authority. Configuration may make the firm more
   restrictive, but it never mints the host capability that crosses an outward boundary.

Every venture manifest binds to one product repository. Truth reads and product worktrees resolve from
that binding, never from Drover's process directory. Import requires a valid destination repository;
machine-local worktree paths are stripped while review history remains readable and explicitly needs
rebinding.

## What stays open (agent-judged, never hardcoded)

Teammates judge these by context. Building host structure for any of them is a regression:

- What a unit of active work is, how big it is, and what it contains.
- What useful divergence means in the moment — how many approaches, along which dimensions. No fixed N, no forced
  axes, no divergence quota.
- What counts as signal, how it returns, and what a winner spawns.
- The firm configuration's founder/domain vocabulary. The founder may configure composition in
  advance or let the first work form it; presentation labels, relationships, capability language,
  context, memory, and evaluation language remain open. The host supplies no required org model,
  personality taxonomy, work taxonomy, or routing table.
- Finite host adapter and safety mechanics may name only real supported choices: runtime adapters,
  activation modes, enabled coordination protocols, enforceable budgets, and authority
  restrictions. Their closed values make execution honest and rails enforceable; they cannot
  classify people or work, constrain what the market may say, or mint host authority.
- Kinds, labels, relationship words, and other substantive founder/domain vocabulary are open strings
  wherever they appear. Technical identifiers and the finite adapter/safety choices above are not a
  second product ontology.
- What the market's voice says. It speaks in language or it is silent — no sentiment scores, no
  aggregate numbers surfaced to the founder.

## Fatal modes (every build choice is checked against all five)

1. **Busywork machine** — motion without closes.
2. **Generic output** — anything that reads like any AI rather than this product meeting its market.
3. **Too much to operate or decide** — overwhelm instead of flow. Divergence runs wide below the
   fold; the founder's attention is pulled, never flooded.
4. **Flow-killing** — friction, setup ceremony, nagging, or mental-state drag. Natural-language and
   direct-manipulation configuration should feel like using the firm, not administering software.
5. **Machinery and jargon creep** — any new authority, collection, enum, stage, score, executable generic edge,
   required substantive work field, founder-facing internal noun, or fragmented configuration surface that does not protect
   execution, attribution, evidence, or founder authority. Open founder language is not machinery;
   silently turning it into host workflow or exposing the host's ontology is.

## The deletion ledger

This rebuild is a delete-and-reset, not a refactor. The measure of correctness is that the brain
gets small enough to read in an afternoon: on the order of a dozen source files around the harness,
in place of the current ~120.

### Dies

- **The enum'd object graph** — `object-graph-store.mjs`, `object-graph-operations.mjs`,
  `object-graph-projection.mjs`, `object-funnel.mjs` and their `domain`/`maturity`/edge-type enums.
- **The executable graph as the product** — `graph.mjs` DAG execution, `channel-graph.mjs`,
  `flow-store.mjs`, `contracts.mjs` field-contract auditing, `graph-operations.mjs`,
  `step-runners.mjs`, `workflow-composer.mjs`, `candidate-composer.mjs` and the candidate-pipeline
  opening move. Teammates do work directly through the runtime adapters and tools; multi-step
  structure is the content of a bet, not a host-compiled artifact.
- **The operator session machine** — the 40-field session record, the five pause states and their
  five separate resolvers, run reconciliation, and the session/run/flow triplication. One loop, one
  wall queue, one "the founder decides" step.
- **The woven projection layer** — `woven-graph.mjs`, `operating-view.mjs`, object chips, kind
  clusters, lanes, and the objects/type axis machinery. The living canvas projects one architecture
  document plus live consequential records; it does not revive those parallel authorities.
- **Boards, plans, and derived read models** — `board.mjs`, `motion-plan.mjs`,
  `promote-motion.mjs`, `path-portfolio.mjs`, `program-projection.mjs`, `signal-weights-store.mjs`,
  `reallocation.mjs`, `reallocation-tunables-store.mjs`, `run-compare.mjs`, `run-compile.mjs`,
  `run-derivation.mjs`, `run-summary.mjs`.
- **Goal and work-object authorities as separate stores** — `goal-store.mjs`,
  `goal-conflicts.mjs`, `goal-conflict-decision-store.mjs`, `work-artifact-store.mjs`'s parallel
  revision machinery, `canvas-structure-history.mjs`, `canvas-proposal.mjs`,
  `open-canvas-projection.mjs`. Founder direction is what the founder said — content teammates fork
  under. Work products are the content of bets.
- **The zero-AI terrain floor as a product claim** — the no-runtime grounded home and its fixtures.
  The scan survives as truth infrastructure; the "useful before any model" posture does not.
- **Storage sprawl** — the 23-store pattern, the Convex write-behind mirror, and the JSON/SQLite/
  Convex/cache four-layer stack. One local store per venture (rail 8), one persistence seam.
- **Composition/ideation scaffolding** — `ideation.mjs` angle machinery, `idea-bar.mjs` floors,
  `idea-store.mjs`, `idea-derivation.mjs`, `composer-router.mjs` keyword routing,
  `composer-briefing.mjs` assembly, `microproduct-composer.mjs` as a special case. Divergence is
  what teammates do, not a host pipeline.

### Survives (the keep-list, ported not rewritten)

- **Wall mechanics** — `tool-safety.mjs` name-blocking at every runtime door; the `OUTWARD_RELEASE`
  host-issued capability pattern (re-seated from `node.runtime` onto the bet's execution context);
  loopback page authority with model/MCP actor-stamp refusal; venture-scoped access that fails closed;
  the second deploy
  authorization; actor stamping on the MCP door.
- **Presence** — `presence.mjs` volatile lease, defaults and lapses to away, any caller may make the
  system more conservative.
- **Taste** — venture decision receipts distilled by `firm/taste.mjs`, plus `consult-guard.mjs`
  (drafting must consult taste). The wall receipt is the source; there is no parallel feedback authority.
- **Truth** — `scan.mjs` cited repository scan, evidence discipline (uncited "derived" demotes to
  "speculative"), `product-model-generator.mjs` as interpretation clearly labeled.
- **Souls and teammate identity** — `teammate-soul.mjs`, `teammate-soul-store.mjs` two-tier learning
  (instance + template, founder-blessed graduation), voice allowlisting that never leaks prompts,
  the deterministic illustrated teammate faces in the UI.
- **The product-change worktree contract** — the isolated, no-authority worktree door, diff
  retention, staged review, explicit apply. This becomes fork-is-a-worktree unchanged in security
  posture.
- **Runtime adapters** — the provider-neutral Claude/Codex drive seam, subscription auth,
  normalized failure vocabulary. One product behavior through both providers; provider identity is
  a receipt, not a record.
- **Reply capture and outcome joins** — the connected-account reply path, join lineage, and the
  decide-together interruption, re-targeted from run items to bets.
- **Ambient scheduling** — `firm/heat.mjs` runs the 24/7 inward loop from the single heat dial and spend
  rail; it does not expose scheduler internals.
- **The spatial substrate of the canvas** — pan/zoom/selection/drag/virtualization/regions and the
  gate review surface, re-pointed at venture architecture plus live bets, work, wall, and outcomes.
- **The anti-cage test doctrine** — the static guards, rewritten for the new physics (see
  Verification).

## Delivery sequence

Build order for the reset. Each stage names what done means. Stages F1–F3 are the spine; nothing
founder-visible ships before F3.

**F0 — Reconcile the contract.** This spec becomes the direction; OPEN-CANVAS-SPEC and
EXPERIMENT-MACHINE-SPEC get banners pointing here; STATE.md records the reset honestly. Done when
the repository has one answer to what Drover is.

**F1 — The firm core.** One venture store (architecture, configuration, teammate roster, bets, outcomes,
decisions, settings, product-change history, conversation, placement) on one local
persistence seam, with the harness ported: wall capability, presence, taste, truth, venture
isolation. Done when a venture directory is a readable file tree, the harness tests pass against
the new store, and the old stores are not imported by any new code.

**F2 — Configured participants work.** A participant drives real work through the existing runtime adapters directly
— no operator session, no compiled graph. Fork creates bets; staged artifacts attach to bets;
everything inward runs; anything outward classifies (by capability effect, not name) and parks at
the wall. Done when one teammate can take founder direction, fork divergent bets, and stage real drafts
with taste consulted, on both Claude and Codex adapters.

Participants may involve another configured participant during that same work through one generic
deliberation primitive. The caller chooses the participant, an enabled protocol, and a focused
question; the requested participant contributes through their own configured runtime, capability,
authority, and budget boundary. The contribution returns to the caller so they can answer, challenge,
seek another pass, or stop. A founder-configured pass budget bounds the interaction. The host enforces
membership, protocols, budgets, and cycles; it never supplies a role-specific routing table or decides
whose perspective is substantively relevant.

**F3 — The wall queue.** One decision surface with typed attention: outward release, teammate answer,
outcome review, and bet ending.
Per-item decide, batch convenience, receipts, presence hold, promote-by-replay for proven patterns.
Done when the security matrix passes: no self-approval from browser/API/MCP/model, away holds
everything outward, forged autonomy rejected, cross-venture access fails closed.

**F4 — Fork is a worktree.** Product bets run through the surviving worktree contract: isolated
change, retained diff, staged review, explicit apply, deploy's second authorization. Done when one
bet carries a real verified code diff to the wall and back.

**F5 — The market speaks.** Reply capture joins to bets; outcomes return as the market's voice in
the room; the decide-together interruption fires on real replies; losers mutate on founder kill.
Done when a real reply lands on its bet and the founder can decide from the voice alone, with no
aggregate metric anywhere on a founder surface.

**F6 — The living venture atlas.** The continuous canvas renders venture intent, open founder-defined
architecture, concrete ways value reaches people, current campaigns, exact work, founder decisions,
and returned evidence over the one venture store. It preserves infinite pan/zoom, direct placement,
stable camera history, semantic zoom, focus-in-place, and outline parity. Done when one plain-language
direction immediately draws a coherent provisional theory, starts useful inward work, lets the
founder trace any claim to concrete work or evidence without leaving the canvas, and deleting
placement loses only placement.

**F7 — The always-on firm.** The ambient loop runs teammates around the clock under the heat dial and
spend rail; away accumulates conviction at the wall. Done when a founder returns after hours away to
staged divergence and a decision queue, with zero outward motion having occurred.

**F8 — The portfolio proof.** Two real ventures through one wall; venture export/import proves rail
8 (a moved venture resumes durable work on another machine after binding its destination repository;
provider sessions cold-resume and live worktrees explicitly re-fork). Done when both receipts exist on real
founder ventures.

The alpha gate is unchanged in spirit: an outside founder survives the loop on a real product, and a
real-world answer returns. Deterministic tests never stand in for that.

## Verification

### Invariants carried forward (existing tests keep passing, re-targeted)

- Wall: only founder-decided items cross; execute-equivalents refuse without the host capability;
  self-approval rejected from every door; deploy requires the second authorization.
- Isolation: cross-venture reads and decisions fail closed as 404.
- Autonomy: promotion is founder-only, revocable, and never forgeable through content, config, or
  context.
- Taste: drafting that reaches the founder consulted taste; gate decisions land in the ledger and
  return to future work.
- Truth: uncited product claims demote; founder register stays plain (no machinery vocabulary on
  founder surfaces).
- Voice: souls never leak prompts or internals through narration.

### New anti-cage guards (static, in the spirit of the current guard families)

- Founder-language guard: product-owned interface copy does not expose `bet`, `motion`, `fork`,
  `outcome`, `the wall`, `pipeline`, `stage`, or `work item`. User-authored content and historical API/storage
  identifiers are excluded.
- First-use guard: a broad plain-language direction produces a provisional whole-venture projection
  plus useful inward work without requiring architecture acceptance; every world-touching effect
  still waits for the founder.
- No empty theater: every generated grouping projects concrete work, an artifact, evidence, or a
  real relationship. A complete-looking arrangement of empty containers fails.
- One architecture document inside the venture store; no system, motion, campaign, graph, or canvas
  business-truth store.
- Only concept, product-loop, system, motion, and campaign have architecture role semantics. No
  actor, need, promise, offering, capability, surface, release, metric, task, milestone, owner,
  maturity, stage, score, or workflow collection.
- Open concepts and connections cannot alter execution until the founder explicitly applies an
  operational role or structural relationship.
- Teammates and MCP clients can propose architecture changes but cannot apply them or forge founder
  provenance.
- No generic executable edge taxonomy. Open relationship labels remain founder language; operational
  joins live in finite role fields and evidence annotations.
- No substantive bet schema: the technical envelope may require identity, venture scope, an initial
  open-text direction seed, and addressability/lineage references; it may not require a hypothesis,
  kind, domain taxonomy, or stage field.
- No attached-work taxonomy: durable work may require identity, attribution, and provenance so it can
  be targeted and joined; it may not require a work kind, stage, template, or host-owned progression.
  Lineage may be inferred only when one origin is possible; chronology is never provenance.
- No status enum: a bet's position is derivable from the loop (live / at wall / ended), never a
  stored lifecycle machine.
- No imposed org chart: no host-required role, seniority, hierarchy, or manager fields. User-defined
  open relationships may live in the single firm configuration and project through the lens.
- No numbers in the market's mouth: no sentiment scores or aggregate metrics on founder surfaces.
- One dial: ambient behavior configured by at most one founder setting plus one spend rail.
- No stored campaign/motion health or status, no durable release duplicate, and no causal outcome
  claim without an explicit evidence basis.
- Placement deletion loses no semantic architecture, evidence, execution context, or history.
- Smallness: architecture validation/mutation, projection, and context remain separate bounded
  services; adding another store or operational role fails the guard until this spec is amended.

## Evidence that would change the direction

Reconsider this direction if: the founder cannot trust work they did not watch being made (the 24/7
inward loop produces piles the founder will not review); divergence-below-the-fold still overwhelms
at real volume; the atlas requires manual grooming to stay legible; open architecture becomes hidden
workflow; selecting architecture does not change later work; the canvas becomes a dashboard or page;
or the one-file venture proves incompatible with a real collaboration need.
Until observed on a real venture, the default holds:

> Build the open venture atlas that changes what the firm does next, prove it on the founder's own
> ventures behind one wall, and keep machinery behind the venture model.
