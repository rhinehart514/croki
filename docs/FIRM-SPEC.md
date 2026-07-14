# The Firm — build spec of record

**Status:** spec of record for the physics rebuild and the holding-company north star.
**Derived from:** founder ideation session, 2026-07-14, on top of the experiment-machine discovery
interviews (2026-07-12) and a full-tree machinery audit (seven scouting passes over the current code).
**Scope:** product-agnostic and venture-agnostic. **Stage:** alpha.

This spec supersedes [OPEN-CANVAS-SPEC.md](OPEN-CANVAS-SPEC.md) and
[EXPERIMENT-MACHINE-SPEC.md](EXPERIMENT-MACHINE-SPEC.md) as the build direction. It keeps their
harness whole — truth, the founder wall, learned taste — and keeps their firm rails. Where those
documents grew object systems, stage skeletons, or enums, this spec deletes them. Where this spec
names a mechanic as "open," building a schema, config screen, status enum, or taxonomy for it
re-creates the cage this rebuild exists to remove.

## The destination

Drover is the operating system for one-person holding companies.

A permanent AI staff runs any number of ventures around the clock. Product change and go-to-market
motion are the same act. Every world-touching decision queues at one wall, and the founder's job
compresses to conviction: kill, back, release — minutes a day, not hours. Each venture is a small,
readable, transferable artifact.

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

Drover's founder-facing domain language is three nouns, one verb, one loop, one lens, and one harness.
Supporting records such as a venture manifest, founder-attention item, placement, heat setting, or
product-change receipt may exist internally when they preserve a rail; they must not become competing
work nouns, workflow stages, or taxonomies. The machine never tells the founder what kinds of moves exist.

### The three nouns

**Teammate.** The only durable first-class actor. A persistent character with a soul (memory of
lessons), a voice, and a track record of real outcomes. Teammates outlive ventures: lessons graduate
founder-blessed from a venture instance to the template, so the crew a founder hires once walks into
every later venture already knowing their taste. No roles, no seniority, no org chart, no manager
agents — souls and lessons, nothing structural.

**Bet.** The open unit of trying. A message, an ICP, a channel push, a price, a landing page, a
product diff — whatever a teammate is currently attempting, sized by judgment. A bet has no required
fields, no kind, no stage, and no schema. It is a pointer to live work plus its evidence plus its
eventual outcome. A bet holds exactly three positions, which are the geometry of the loop rather
than a status enum: **live**, **at the wall**, or **ended by the founder**. When a bet touches the
product, its work lives in an isolated git worktree — the same verb, the same wall, the same
outcome return as any other bet. This is what "product and GTM are one motion" means structurally:
not two linked systems, the absence of two systems.

**Outcome.** What the world said back. A reply, a no-reply, a churn, an activation, a close — joined
to the bet that provoked it. Positive, negative, and zero results are equally first-class; unjoined
signals stay unattributed rather than being claimed. Outcomes return as the market speaking — a
voice in the room, joined to its bet — never as a scoreboard, metric, or sentiment number.

An outcome is its own durable venture record. A bet may reference it as evidence, but does not embed a
second copy. Provider event identity deduplicates both joined and unattributed outcomes.

### The one verb

**Fork.** A teammate facing a goal forks genuinely divergent bets. A winning bet forks again — scale
or variant, crew-judged. A killed bet forks into a mutation that carries its learning. The founder's
kill is the only way a line ends. Fork is the only structural operation in the product: there is no
compose-a-graph, no wire-a-pipeline, no configure-a-workflow. When the bet is code, fork is
literally a git worktree.

### The one loop

**Diverge → stage → wall → decide → outcome → feed.**

The crew diverges. Work stages locally — drafts, lists, pages, diffs — with nothing outward. Any bet
whose next act would touch the world pauses at the wall. The founder decides. The real result
returns as an outcome joined to its bet, feeds teammate memory, and seeds the next fork.

The loop never idles while a venture is open. The wall is not a brake on the machine; it is the
license for everything inside it to run at full autonomy around the clock. While the founder is
away, the inward loop keeps forking — researching, drafting, mutating losers, building product diffs
— and conviction piles up at the wall. The founder wakes up to decisions, not work.

### The one lens

**The canvas.** A live drawing of the firm: the crew, their bets, the wall, and the market's
returns. Far, it shows who is working and what is diverging. Near, it shows one bet's evidence and
difference. The lens owns placement memory and nothing else — it is never a second database, never a
store of nodes, and it renders whatever a bet contains without a registry of allowed kinds. Most
divergence lives quietly below the fold; breadth is the founder's to pull, not the machine's to
push. The founder can always drag, arrange, and explore. Deleting the lens loses only placement.

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
  asks the founder to release outward work, answer the crew, review an outcome, or end a bet. Each purpose
  admits only its own decisions; reviewing an outcome does not block its bet or pretend to release it.
- **Taste.** Founder approvals, rejections, edits, and kills feed the decision ledger and teammate
  souls. Drafting work must consult taste before it reaches the founder.

## Firm rails (founder-held, never automated away)

1. **Nothing goes outward without the founder's explicit hand** — every send, publish, deploy, and
   any spend. Away-state holds outward work unattended, always.
2. **Only the founder kills a bet.** The machine learns from a dying bet and proposes a mutation; it
   never ends one itself.
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

Every venture manifest binds to one product repository. Truth reads and product worktrees resolve from
that binding, never from Drover's process directory. Import requires a valid destination repository;
machine-local worktree paths are stripped while review history remains readable and explicitly needs
rebinding.

## What stays open (agent-judged, never hardcoded)

The crew judges these by context. Building host structure for any of them is a regression:

- What a bet is, how big it is, and what fields it carries.
- What divergence means in the moment — how many bets, along which dimensions. No fixed N, no forced
  axes, no divergence quota.
- What counts as signal, how it returns, and what a winner spawns.
- The crew's composition per venture. Teammates are summoned by the work, not configured in advance.
- All vocabulary: kinds, labels, and relationship words are open strings wherever they appear.
- What the market's voice says. It speaks in language or it is silent — no sentiment scores, no
  aggregate numbers surfaced to the founder.

## Fatal modes (every build choice is checked against all five)

1. **Busywork machine** — motion without closes.
2. **Generic output** — anything that reads like any AI rather than this product meeting its market.
3. **Too much to operate or decide** — overwhelm instead of flow. Divergence runs wide below the
   fold; the founder's attention is pulled, never flooded.
4. **Flow-killing** — friction, config, nagging, mental-state drag.
5. **Machinery creep** — any new noun, enum, stage, required field, or config surface. In this
   codebase's history every pivot grew enforcement machinery that had to be torn back out; in this
   rebuild a new abstraction is treated as a defect until proven otherwise.

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
  clusters, lanes, and the objects/type axis machinery. The lens renders crew + bets directly.
- **Boards, plans, and derived read models** — `board.mjs`, `motion-plan.mjs`,
  `promote-motion.mjs`, `path-portfolio.mjs`, `program-projection.mjs`, `signal-weights-store.mjs`,
  `reallocation.mjs`, `reallocation-tunables-store.mjs`, `run-compare.mjs`, `run-compile.mjs`,
  `run-derivation.mjs`, `run-summary.mjs`.
- **Goal and work-object authorities as separate stores** — `goal-store.mjs`,
  `goal-conflicts.mjs`, `goal-conflict-decision-store.mjs`, `work-artifact-store.mjs`'s parallel
  revision machinery, `canvas-structure-history.mjs`, `canvas-proposal.mjs`,
  `open-canvas-projection.mjs`. A goal is what the founder said — content a crew forks under. Work
  products are the content of bets.
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
  browser-only founder session minting; venture-scoped access that fails closed; the second deploy
  authorization; actor stamping on the MCP door.
- **Presence** — `presence.mjs` volatile lease, defaults and lapses to away, any caller may make the
  system more conservative.
- **Taste** — venture decision receipts distilled by `firm/taste.mjs`, plus `consult-guard.mjs`
  (drafting must consult taste). The wall receipt is the source; there is no parallel feedback authority.
- **Truth** — `scan.mjs` cited repository scan, evidence discipline (uncited "derived" demotes to
  "speculative"), `product-model-generator.mjs` as interpretation clearly labeled.
- **Souls and crew identity** — `teammate-soul.mjs`, `teammate-soul-store.mjs` two-tier learning
  (instance + template, founder-blessed graduation), voice allowlisting that never leaks prompts,
  the deterministic illustrated crew faces in the UI.
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
  gate review surface, re-pointed at crew + bets.
- **The anti-cage test doctrine** — the static guards, rewritten for the new physics (see
  Verification).

## Delivery sequence

Build order for the reset. Each stage names what done means. Stages F1–F3 are the spine; nothing
founder-visible ships before F3.

**F0 — Reconcile the contract.** This spec becomes the direction; OPEN-CANVAS-SPEC and
EXPERIMENT-MACHINE-SPEC get banners pointing here; STATE.md records the reset honestly. Done when
the repository has one answer to what Drover is.

**F1 — The firm core.** One venture store (crew, bets, outcomes, decisions, settings,
product-change history, placement) on one local
persistence seam, with the harness ported: wall capability, presence, taste, truth, venture
isolation. Done when a venture directory is a readable file tree, the harness tests pass against
the new store, and the old stores are not imported by any new code.

**F2 — Teammates work.** A teammate drives real work through the existing runtime adapters directly
— no operator session, no compiled graph. Fork creates bets; staged artifacts attach to bets;
everything inward runs; anything outward classifies (by capability effect, not name) and parks at
the wall. Done when one teammate can take a founder goal, fork divergent bets, and stage real drafts
with taste consulted, on both Claude and Codex adapters.

**F3 — The wall queue.** One decision surface with typed attention: outward release, crew answer,
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

**F6 — The lens.** The canvas renders crew, bets, wall, and returns over the new store; placement
memory only; divergence below the fold; pull not push. Done when a founder can watch the firm work,
pull a bet near, and refine it in place, and deleting the lens store loses only placement.

**F7 — The always-on firm.** The ambient loop runs the crew around the clock under the heat dial and
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

- No bet schema: no required fields, kind lists, or stage fields on the bet record.
- No status enum: a bet's position is derivable from the loop (live / at wall / ended), never a
  stored lifecycle machine.
- No org chart: no role, seniority, hierarchy, or manager fields on teammates.
- No numbers in the market's mouth: no sentiment scores or aggregate metrics on founder surfaces.
- One dial: ambient behavior configured by at most one founder setting plus one spend rail.
- Smallness: the new core stays within a named file budget; adding a store or a noun fails the
  guard until this spec is amended first.

## Evidence that would change the bet

Reconsider this direction if: the founder cannot trust work they did not watch being made (the 24/7
inward loop produces piles the founder will not review); divergence-below-the-fold still overwhelms
at real volume; teammates-without-structure produce work the founder cannot steer without
reintroducing stages; or the one-file venture proves incompatible with a real collaboration need.
Until observed on a real venture, the default holds:

> Build the smallest firm that never sleeps, prove it on the founder's own ventures behind one wall,
> and let the crew — not the host — decide what work is.
