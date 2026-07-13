# VISION — Drover

Logged 2026-07-03. Revised 2026-07-11 for the multi-goal open-canvas direction.

This is the product north star. [STATE.md](STATE.md) records what the current build actually proves.
[OPEN-CANVAS-SPEC.md](OPEN-CANVAS-SPEC.md) defines the target experience, system boundaries, delivery
sequence, and acceptance gates. The active build direction on top of that contract is the experiment
machine — [EXPERIMENT-MACHINE-SPEC.md](EXPERIMENT-MACHINE-SPEC.md) is its spec of record and
[production-direction/EXPERIMENT-MACHINE-GOAL.md](production-direction/EXPERIMENT-MACHINE-GOAL.md) is the
north-star goal. `AGENTS.md` records the engineering invariants.

## The one sentence

**Drover makes product development and go-to-market easier by letting a founder direct Claude and Codex on
one living canvas, where many goals can be understood, created, changed, run safely, and learned from.**

## The positioning line

**Vibe code your go-to-market.** (Founder decision, 2026-07-12.)

The market-facing promise: the same relationship a founder already has with an AI coding tool — it works, you
watch, you grab the wheel, nothing ships without you — pointed at getting users, and grounded in the real
product because Drover read the codebase. This line positions against the two failure modes founders name:
the blank-prompt chat that does not know their product, and the black-box "AI CMO" that speaks in their name
unsupervised.

The line leads with go-to-market because that is the wound; it does not narrow the product. Product
development remains a co-equal use — the same watch-steer-approve relationship covers changing the product,
not only marketing it. Supporting evidence for the segment and the two hard conditions (first-session payoff,
earned-only distribution) is recorded in the 2026-07-12 market research.

## The active direction: the experiment machine

Vibe coding your go-to-market takes concrete shape as a **living machine of many parallel, grounded,
agent-built experiments** across go-to-market and product, for one venture at a time. The founder sees,
refines, and greenlights; the crew builds and runs; and real outcomes and warm leads visibly loop back to the
front of the pipeline as motion through the weave — never a scoreboard. Six firm rails stay founder-held and
are never automated away: nothing goes outward without the founder's explicit hand (and nothing outward runs
while the founder is away); only the founder kills an experiment; the founder greenlights each experiment with
one click; the founder can see and refine anything at any altitude; on a real reply the machine alerts the
founder and they decide together; one venture is an isolated machine. Everything else — what an experiment is,
how big it is, how many run, what counts as signal — stays agent-judged and open, never a fixed schema, enum,
or role taxonomy. The build contract is [EXPERIMENT-MACHINE-SPEC.md](EXPERIMENT-MACHINE-SPEC.md).

## The product you experience

You point Drover at a product. Before asking you to configure a process, it shows what the code proves, what
remains uncertain, what work is active, and what the world has returned. Facts carry receipts. Interpretations
look like interpretations. Missing evidence stays missing.

You can begin from anywhere on that canvas. Select part of the product and ask why it is weak. Start a goal to
find design partners. Ask Claude to reshape the positioning. Ask Codex to change onboarding. Compare two
directions, edit the chosen result, or turn useful work into an action. The work appears beside its source as
editable canvas material rather than disappearing into a transcript.

A product can hold dozens of goals across product development and go-to-market. There is no required mission,
primary goal, goal tree, funnel, program, or pipeline before work begins. Goals may share evidence, people,
artifacts, product changes, paths, and outcomes without copying them. They may also conflict, branch, pause,
resume, and complete independently.

When work needs tools, repeatability, or an outward effect, it expands into an executable path of agents,
skills, code, MCP tools, and deterministic steps. That path reaches the founder wall before anything sends,
publishes, deploys, merges, charges, or changes the outside world. The approved effect remains visible as a
receipt. A real positive, negative, or zero outcome returns to the goal and product context that produced it.

## The mental model

The **canvas** is the product. It is both the living picture of the product meeting its market and the place
where the founder, Claude, Codex, and the crew work.

A **goal** is something the founder wants to understand, change, make, achieve, or learn. A product has zero
to many goals. A goal is useful context, never a required setup object or permission contract.

A **work object** is an addressable result on the canvas: evidence, a question, comparison, document, design,
code difference, customer, decision, action, or any other form the work needs. Business kinds stay open.

A **region** keeps related work spatially coherent. It is organization, not a required program or stage.

A **path** is work expanded into executable machinery. A repeatable named path may be called a pipeline. Most
answers and artifacts do not need to become one.

The **wall** is the founder-owned boundary every outward effect must cross. Geometry can show the wall, but
only the durable founder decision grants authority.

An **outcome** is an observed result from the world. Completion, approval, delivery, and release are not
outcomes by themselves.

## What Claude and Codex do

Claude and Codex are provider-neutral workers on the same canvas. They receive the same scoped product truth,
selected canvas context, decisions, outcomes, taste, tools, and permissions. They may read, reason, research,
write, design, code, compose, and verify. Their useful output becomes editable canvas material or a visible
change to it.

Provider-private transcripts never become Drover's memory. A goal or work region can move from Claude to
Codex or back without being restated because the canvas objects, references, revisions, receipts, and events
belong to Drover.

The founder can choose a runtime, let Drover choose, or deliberately ask both for distinct branches. Runtime
identity remains attributable without becoming a product mode.

## What makes Drover compound

1. **Grounded understanding.** The repository scan creates cited product truth without a model call.
2. **Visible intelligence.** Model work materializes progressively where the founder can inspect and steer it.
3. **Cheap correction.** The founder edits the object or difference directly instead of prompting from zero.
4. **Shared context.** Many goals reuse the same product, people, evidence, artifacts, actions, and outcomes.
5. **Safe action.** Every outward path reaches the founder wall with the exact effect visible.
6. **Market return.** Real results attach to the work and product context that produced them.
7. **Learned taste.** Founder decisions and edits shape later work without becoming authorization.

## The invariants

The host constrains only three things:

- **Truth.** Existing product claims are cited or labeled as inference.
- **The founder wall.** Nothing reaches the outside world without founder authority. The wall may graduate
  through explicit promotion, but it never disappears.
- **Taste.** Founder choices and edits become durable memory for later work.

The host also owns typed mutation, durable state, project isolation, and permission enforcement. It does not
freeze product development or go-to-market into task catalogs, required stages, closed business kinds, one
mission, or a fixed execution skeleton.

## The product boundary

Drover is for work which changes how a product is understood, experienced, discovered, adopted, paid for, or
learned from. It is not a general company operating system, blank whiteboard, project tracker, or replacement
for a full code editor.

The canvas is broad because Claude and Codex can invent the work. The product remains coherent because every
piece of work stays attached to a real product, visible lineage, founder authority, and an intended or observed
effect.

## The alpha test

The first complete proof crosses product development and go-to-market:

> Diagnose a real product problem, show the competing explanations on the canvas, make and verify the chosen
> change in isolation, connect it to a market-facing test, take the exact outward effect to the founder wall,
> and return the observed result to the originating goal and product context.

Alpha ends only when an outside founder survives that loop without explanation. The full multi-goal system
must be reliable for its declared scope, but feature breadth, a green suite, a polished fixture, or a successful
model call cannot substitute for external proof.
