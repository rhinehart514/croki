# The Experiment Machine — build spec

**Status:** spec of record for how Drover runs GTM + product experiments.
**Derived from:** two founder discovery interviews (2026-07-12).
**Scope:** product-agnostic. **Stage:** alpha.

This spec sits under [OPEN-CANVAS-SPEC.md](OPEN-CANVAS-SPEC.md) and [VISION.md](VISION.md). It does not
replace the harness (truth, founder wall, taste); it describes the experience the founder actually wants
built on top of it. Where it names a mechanic as "open," building a fixed schema, config screen, or role
taxonomy for it re-creates the cage the harness exists to prevent.

## What it is

Drover runs as a living machine of many parallel, grounded, agent-built experiments across go-to-market and
product, for one venture at a time. The founder sees, refines, and approves; the crew builds and runs; real
outcomes loop back on the canvas. The machine is biased — internally, never through a surfaced metric —
toward driving real closes, not motion.

The feeling being built is "doing GTM and product hacks with Claude and Codex": fast, clever, unfair edges,
sophisticated agentic pipelines, product and GTM as one motion, never stuck, always shipping.

## The firm rails (founder-held, never automated away)

These are the only hard constraints. Everything else is open.

1. **Nothing goes outward without the founder's explicit hand** — every send, publish, deploy, and any
   spend. Conservative when the founder is away: nothing outward runs unattended by default. (Proven
   patterns may graduate to auto over time, but the default and the away-state stay conservative.)
2. **Only the founder kills an experiment.** The machine may learn from a dying bet and propose a mutation,
   but never ends one itself.
3. **The founder greenlights each experiment to run** — one click.
4. **The founder can see and refine anything, at any altitude, with no gatekeeping.**
5. **On a real reply, the machine alerts the founder and they decide together.**
6. **One venture is an isolated machine.** Ventures never bleed into each other.

## What stays open (agent-judged, never hardcoded)

The founder was explicit: do not pre-decide these — the crew judges by context.

- **What an experiment is and how big it is.** Any dimension (message, ICP, channel, product change),
  crew-sized, no hypothesis ceremony.
- **How many run or are proposed.** Contextual to the venture's stage; no fixed cap.
- **What counts as signal, how it returns, what a winner spawns** (scale / variant / continue).
- **Follow-up persistence and who closes.** Per pipeline; no fixed rule, no fixed roles yet.

## The experiment

An open unit. It can be a single message to one segment, a full find → draft → send → measure pipeline, a
channel push, or a product change — whatever bet is being made, sized by the crew. No required fields, no
hypothesis form. Two experiments differ by any varied dimension: message, ICP, channel, or product change.

## How experiments are born

From four first-class sources: the crew proposing off real product grounding, the founder seeding an idea,
a dead experiment's learning mutating into a new one, and an outside trigger. An experiment can also just
fall out of a chat — no formal propose step required. A backlog is optional. The number proposed flexes with
the venture's stage. The founder greenlights each with one click, and may edit first.

## How they run

No fixed cap — the machine manages load per venture, contextually. "Running" means a mix of real outward
touches (once approved) and staged/prepped work, depending on the experiment. When the founder is away,
nothing outward runs. Each venture is a fully isolated machine.

## See + refine (the trust loop)

The founder trusts what they can see and refine before it goes. Refinement happens at any altitude — whole
experiment, message, target list, or pipeline steps — with no gatekeeping. Three modes:

- Edit in place on the canvas.
- Instruct Claude to change it.
- Ideate the change *together* with Claude — collaborative thinking, not just command-and-apply.

Refinement happens both before and during a run. When the founder refines one experiment, the machine
suggests propagating the change to similar ones and waits for confirmation.

## Signal + evolution

What counts as signal is contextual to the experiment; agents gather it, automatically where possible. The
machine always learns from an experiment, win or lose. Winners scale, spawn variants, or continue — the crew
judges which, in context. Losers are never auto-killed: the machine learns and surfaces, but only the
founder ends a bet.

## The living canvas

Not a scoreboard. The founder rejected metrics and nagging outright — they break flow and trigger the
avoidance the machine exists to prevent. Instead:

- A living system the founder **controls**: drag it, arrange it, do what they want with it. Visibly alive
  but calm — never hyperactive, no continuous ambient motion.
- **Outcomes and warm leads visibly loop back to the front of the pipeline**, so progress reads as motion
  through the weave, not a number.
- The canvas restores where the founder left off.
- Things reach the founder **both ways**: surfaced in chat for what's live, and available on the canvas to
  explore.
- **The machine pushes very few decisions.** Breadth is the founder's to pull and navigate; decisions stay
  minimal. Decision overload is a hard flow-killer to design out.

## Closing (the anti-procrastination engine)

There is no scoreboard, so the machine prevents warm leads from dying *structurally*, not by guilt: agents
own the follow-through, and the canvas loops live leads back to the front where they stay visible. On a real
reply, alert the founder and decide together. Persistence and who-closes are per-pipeline, crew-judged.

This is the honest answer to the machine's central risk (below): the close-bias lives in the machine's
behavior and the canvas's loop-back, never in a metric shown to the founder.

## Product + GTM as one motion

Product changes are experiments too, on the same canvas — the founder wants them intertwined, not separated.
A product change runs in isolation (worktree), shows its difference, and reaches the founder before anything
merges or deploys — the same wall an outward send crosses.

## Design constraints (avoid all four)

The founder named all four as fatal. Every build choice is checked against all of them:

1. **Busywork machine** — motion without closes.
2. **Generic output** — anything that feels like any AI rather than grounded in the real product.
3. **Too much to operate or decide** — overwhelm instead of flow.
4. **Flow-killing** — friction, config, nagging, mental-state drag.

## Scope + approach

Product-agnostic: the machine works for any of the founder's ventures; do not hardcode to one (not even
RodentRadar, which is the current live venture but only one input). The founder's call is to **spec fully
before building** and to **build it whole**, not as a thin slice.

Honest note on "build it whole": that is higher-risk than a vertical slice. The mitigation is that the firm
rails and the truth/wall/taste harness already exist — so "whole" means assembling proven parts around the
open experiment loop and the loop-back canvas, not laying net-new foundations. If the risk shows up as the
build stalling, the fall-back is one venture, a few real experiments, end to end — but that is a fall-back,
not the plan.
