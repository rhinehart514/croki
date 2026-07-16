# North-star goal — complete the experiment machine (full stack)

> **Archived goal.** This goal was superseded on 2026-07-14 by
> [FIRM-SPEC.md](../FIRM-SPEC.md). Its unchecked work is not a current backlog.

**Owner:** Sol (Codex threads). **Written:** 2026-07-12. **Stage:** alpha.
**Historical spec:** [../EXPERIMENT-MACHINE-SPEC.md](../EXPERIMENT-MACHINE-SPEC.md).
**Alignment map:** [experiment-machine-alignment.md](experiment-machine-alignment.md).

## The goal

Complete the experiment machine end to end so Drover is, for one venture at a time, a living machine of many
parallel, grounded, agent-built experiments across go-to-market and product: the founder sees, refines, and
greenlights; the crew builds and runs; and real outcomes and warm leads visibly loop back to the front of the
pipeline as motion through the weave — never a scoreboard.

"Done" is the whole loop reliable for its declared alpha scope, not a vertical slice: from experiment birth
(crew proposal, founder seed, dead-experiment mutation, or outside trigger) → one-click greenlight → run
(staged/prepped work, nothing outward while away) → the founder wall on every outward path → a real reply
alerting the founder for a joint decision → outcomes and warm leads looping back on the canvas → taste learned
from every decision.

## Firm rails (never weaken)

1. Nothing outward without the founder's explicit hand; nothing outward runs while the founder is away.
2. Only the founder kills an experiment; the machine may learn from a loser and propose a mutation, never
   auto-kill.
3. The founder greenlights each experiment with one click.
4. The founder can see and refine anything, at any altitude, with no gatekeeping.
5. On a real reply, alert the founder and decide together.
6. One venture is an isolated machine.
Plus the harness: read-only cited truth, the founder wall on every outward path, taste learned from decisions.
Never forge autonomy or approval.

## Guardrails (avoid all four fatal modes)

Busywork (motion reported as progress — no surfaced scoreboard/metric/KPI dashboard; close-bias lives in
behavior and the loop-back canvas). Generic (grounding scales with volume). Too-much-to-operate/decide (the
machine pushes very few decisions; no config screens the founder must operate). Flow-kill (calm, controllable,
restores where the founder left off; no nagging or setup ceremony). Keep mechanics agent-judged and open —
no fixed experiment schema, enum, or role taxonomy (the anti-cage rules in AGENTS.md bind here).

## Engineering completion receipt

The following is the bounded implementation receipt recorded on 2026-07-12. It is baseline evidence, not a fresh verification pass of the current uncommitted working tree. At that revision, the full declared alpha loop was assembled, not just the first visual primitive:

1. Outcomes and warm leads draw a calm, directional loop from the returned signal to the front of the
   originating pipeline. The detail rail is closed by default and remains a secondary pull surface.
2. Trigger-born and loser-born proposals materialize as ordinary editable canvas work. They no longer hide in
   a legacy matrix store.
3. A proposed experiment has one reachable **Greenlight to run** action. It starts an isolated crew thread for
   prep and execution; it does not grant the separate capability required for an outward release.
4. A founder-presence lease defaults to away, lapses conservatively, and suppresses unattended standing
   approval for anything outward or possibly outward. Internal prep can continue.
5. A real connected Gmail reply is both attributed as an outcome and captured as one unrouted founder
   decision with exact run and pipeline lineage. The open app raises one decide-together interruption and
   never auto-replies.
6. Only a founder-killed experiment can produce a mutation proposal. An operational failure is repair work,
   not market evidence, and the host no longer chooses from a fixed message/ICP/channel/product taxonomy.
7. Outside triggers appear once as a proposed experiment rather than as both a raw signal and a duplicate
   decision.

The current evidence map and bounded caveats live in
[experiment-machine-alignment.md](experiment-machine-alignment.md).

## What remains before the mission is proven

There is no honest code change that can manufacture the remaining evidence. Completion now means verifying
the interface and then driving the machine in the world:

1. Browser-verify the complete local loop, including reduced motion, narrow layout, partial failure, reload,
   away/present, one-click start, and the reply decision moment.
2. Record the remaining live-runtime matrix (Claude, Codex, neither, and explicit choice when both exist).
3. Drive a real venture through a founder-approved outward effect and return the actual positive, negative,
   or no-response outcome.
4. Put the same loop in front of an outside founder and record whether they survive without explanation.

Until the last two exist, the experiment machine can be engineering-complete for its declared alpha scope
without being market-validated. Gate D and the first attributable founder win remain open.

## Working rules for the Codex threads

Preserve unrelated founder changes. Do not commit, push, merge, PR, or deploy without explicit founder
approval. Keep each increment scoped and coherent; `npm test` must be green (brain → UI unit tests → lint →
build) before calling the engineering increment done, and browser-verify the visible loop. Never rename live
proof into existence because deterministic tests pass.
