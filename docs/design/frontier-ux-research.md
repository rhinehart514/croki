---
status: archived-pre-atlas-research-receipt
checked: 2026-07-14
authority: research-only
surface: desktop-founder-workbench
live_viewports:
  - 1440x900
  - 1280x800
live_url: "http://127.0.0.1:4317"
mobbin_refs: unavailable-in-environment
context7_refs: []
layer_specialists: []
chosen_spine: "The firm speaks; the canvas proves."
implementation: not-started
---

# Frontier UX research

> **Historical research receipt.** This study formed the Workyard-centered production pass. The
> Workyard remains the Atlas's bet/work altitude, but the Living Venture Atlas now governs the
> opening experience. Current direction and proof live in [`../FIRM-SPEC.md`](../FIRM-SPEC.md),
> [`../STATE.md`](../STATE.md), and
> [`venture-architecture-adaptation/`](venture-architecture-adaptation/).

This is the research receipt behind the root [`DESIGN.md`](../../DESIGN.md). It records what was
observed, what current products prove, which alternatives were rejected, and the experiment that can
falsify the chosen direction. It cannot override [`FIRM-SPEC.md`](../FIRM-SPEC.md) or claim that a
described interaction is implemented; [`STATE.md`](../STATE.md) remains the proof boundary.

## The question

Drover already ships the structural baseline: one persistent firm conversation beside a live canvas,
selection-scoped direction, readable configuration proposals and receipts, a placement-only lens,
and one founder wall. The frontier question is narrower:

> Can Drover turn unattended work into a truthful, actionable scene without making the founder
> operate an agent manager, workflow builder, or second database?

The answer is not more visible agents. Parallel execution, worktrees, review queues, activity logs,
and canvas-native prompting are becoming table stakes. Drover's opportunity is to join those
mechanics to durable evidence, exact authority, founder judgment, and real market returns.

## Live product read

The populated firm was inspected at 1440x900 and 1280x800 across the venture picker, canvas overview,
teammate and bet selection, configuration proposal and receipt, expanded configuration diff, heat,
outline, keyboard focus, clear wall, and a transient server loss.

Already load-bearing:

- Selection is one cross-surface gesture: it focuses the canvas, conversation, composer, and
  attributable teammate without opening another product mode.
- `CrewFace` gives teammates stable identity across the roster, conversation, composer, and canvas.
- The outline is a real keyboard and scale fallback, not a decorative minimap.
- Color and material are restrained; the wall owns amber, and content remains opaque over the canvas.
- Wall code distinguishes release, answer, outcome review, product-change review, deploy
  authorization, and ending a bet instead of presenting one ambiguous approval.

The sharpest gaps:

1. The overview shows topology before consequence. Eleven fitted nodes become spatial texture; it is
   hard to tell what changed, what returned, or what needs the founder.
2. A selected bet recenters and filters, but does not yet expose a complete evidence trail: why it
   exists, what changed, what was staged, which revision formed it, what the world returned, and what
   judgment follows.
3. A selected thread inherits global configuration history and chronological noise. One durable
   conversation has become too close to one unbounded transcript.
4. The expanded 63-field configuration difference exposes storage structure before founder meaning.
5. When the server disappeared, stale content remained confidently "live" while polling failed. A
   founder workbench cannot be ambiguous about freshness.
6. The current working indicator is an anonymous pulse. It does not show real work, elapsed time,
   staged output, cost, or a redirect path.

The full ranked code-level drift ledger lives in the refreshed
[`docs/design/DESIGN.md`](DESIGN.md#current-drift-ledger).

## Three directions considered

### 1. The proven command center

**Core idea:** make every bet a durable agent thread with its artifacts and review beside it.
**Information structure:** venture and bet list -> selected conversation -> artifact/diff workspace.
**Interaction:** delegate, leave, return to a review queue, comment on the exact difference.
**Layout:** sidebar-anchored three-pane workbench.
**Puts first:** the work waiting for founder review.
**Strength:** immediately legible and already proven by agent coding products.
**Weakness:** turns Drover into an agent manager and makes the canvas ornamental.
**Best when:** the work is mostly isolated tasks with deterministic artifacts.

### 2. The founder return brief

**Core idea:** open every venture on a terse account of what materially changed and what needs the
founder's hand.
**Information structure:** consequence-ranked brief -> evidence disclosure -> local decision.
**Interaction:** each sentence opens its proof; routine activity remains available by pull.
**Layout:** single-column editorial return with a contextual side stage.
**Puts first:** what happened while the founder was away.
**Strength:** fastest daily comprehension and the least operational overhead.
**Weakness:** asks the founder to trust another machine-authored summary and can demote the firm to a
feed.
**Best when:** the founder returns briefly and the volume of unattended work is high.

### 3. The living proof scene

**Core idea:** the firm speaks in the continuous conversation; the canvas proves each consequential
sentence with an evidence-backed scene assembled from durable records.
**Information structure:** conversation for account and direction; bet-centered scene for evidence,
difference, lineage, authority, and return; wall as the visible outward boundary.
**Interaction:** click a sentence or bet to pull its proof near, refine it in the same composer, and
return to the wider field without a route change.
**Layout:** asymmetric conversation-and-canvas split with semantic zoom.
**Puts first:** the exact bet whose evidence changed, whose market return arrived, or whose next act
needs the founder.
**Strength:** makes Drover recognizably different and joins its unique product physics in one
interaction.
**Weakness:** can manufacture false coherence if chronology, attribution, or model inference is drawn
as proven causality.
**Best when:** work is always on, evidence is heterogeneous, and the founder must move between breadth
and one exact decision.

## Convergence

The product heads already commit Drover to direction 3: persistent conversation, one canvas lens,
open bets, outcomes, and one wall. The converged direction therefore keeps the living proof scene and
grafts one move from direction 2: the first turn on return is a terse, evidence-linked account of
consequential changes.

The account is not a dashboard, notification feed, or second authority. Every sentence maps to one or
more durable records, declares what it omitted, and can pull the corresponding proof into focus. The
canvas may create a temporary focus arrangement, but only founder placement persists.

## Current shipped references

All status statements below were checked on 2026-07-14. Vendor announcements are treated as proof of
what shipped only when the source says the capability is available.

- [OpenAI Codex app](https://openai.com/index/introducing-the-codex-app/) — shipped project threads,
  parallel worktrees, inline diff review, scheduled Automations, and a results review queue prove the
  delegate-leave-review loop. Borrow isolated work and in-thread review; reject a per-task scheduler
  or project/thread ontology for Drover bets.
- [Cursor Agents Window](https://cursor.com/changelog/3-0),
  [Canvases](https://cursor.com/changelog/04-15-26), and
  [multitask/worktrees](https://cursor.com/changelog/04-24-26) — shipped parallel supervision,
  background/foreground handoff, worktrees, and durable interactive artifacts prove that work can be
  pulled near without losing its exact substrate. Borrow direct pointing and handoff; reject a tiled
  wall of agent chats and cross-venture workspace.
- [Linear Agents](https://linear.app/docs/agents-in-linear) and
  [coding sessions](https://linear.app/docs/coding-sessions) — shipped delegation keeps the human
  responsible while agent activity and returned code stay attached to the issue. Borrow the
  separation of contribution, ownership, and authority; reject issues, statuses, and a separate
  review destination as Drover's universal model.
- [Notion Custom Agents](https://www.notion.com/help/custom-agents) — shipped explicit content/tool
  access, activity history, reversible configuration, triggers, and spend controls prove that
  autonomy needs inspectable scope and receipts. Borrow versioned access and failure records; reject
  per-agent trigger builders, scheduler administration, and autonomous external messages.
- [Figma's design agent](https://www.figma.com/blog/the-figma-agent-is-here/) — the May 2026 limited
  beta proves selection-scoped prompting, parallel alternatives, and direct manipulation while an
  agent iterates in the same artifact. Borrow selection as the supervision language; reject letting
  the canvas own durable firm truth.
- [Miro Sidekicks](https://help.miro.com/hc/en-us/articles/29902701849618-Sidekicks-overview) — shipped
  canvas presence and selected-object context prove that an agent can be spatial without becoming a
  workflow node. Its fuller plan-approve-build Sidekick was still announced as coming soon in the
  [May 2026 release](https://miro.com/blog/whats-new-may-2026/). Borrow quiet presence and attached
  suggestions; reject format libraries, Flows, and approval before harmless inward work.
- [GitHub deployment protection](https://docs.github.com/en/actions/how-tos/managing-workflow-runs-and-deployments/managing-deployments/reviewing-deployments)
  — the cross-domain reference: protected jobs wait, secrets remain unavailable until approval, and
  the review leaves a receipt. Borrow a boundary that withholds the capability itself; reject admin
  bypass and bundled approve-and-deploy behavior.

No Mobbin connector was available in this environment. This pass used the live Drover render and
current first-party product sources rather than remembered screenshots.

## Pressure-test result

What survived:

- Return must compress unattended work to consequences and founder decisions, with breadth available
  by pull.
- The conversation tells; the canvas proves. Both surfaces refer to the same durable records.
- A bet is the atomic focus unit. Teammate focus is attribution across bets, not a fabricated causal
  thread.
- Inspection and refinement stay in place: evidence, staged work, exact difference, lineage,
  authority, and return do not fragment into an inspector maze.
- The wall may contain accumulated attention while still reading as an authority boundary instead of
  queue-product chrome.
- The canvas remains a projection. Generated focus never persists as firm truth.

What failed:

- Lineage is not causality. The UI must distinguish exact receipt, evidence-supported join, teammate
  inference, and unattributed signal.
- "The canvas composes" is unsafe without an omission boundary and a path to the wider field.
- Teammate and bet selection are not symmetrical.
- One continuous conversation surface does not require one ever-growing chronological transcript.
- Dimming everything outside focus is not enough; shared evidence, conflicting effects, and wall
  dependencies may be necessary context.

## This-week proof

Build one deterministic return turn from current venture records. It names only:

- evidence that materially changed;
- a returned market voice;
- an exact outward act at the wall;
- a founder judgment whose effect is visible in current work.

Each sentence focuses its bet-centered proof on the existing canvas. A visible "Show the wider firm"
action exposes what the composition omitted. No new route, store, score, status, or work noun is
allowed.

Put that build in front of an outside founder after a venture has run unattended. Without a
walkthrough, test whether they can explain what changed, identify the exact act needing them, verify
one surprising claim, notice an inferred relationship, refine or fork the bet in place, and recover
something important that the return turn did not foreground. If they explore the whole graph before
they trust the account, the compression failed.
