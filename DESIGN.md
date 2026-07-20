---
surface: desktop-founder-workspace
authority: intended-experience
date: 2026-07-19
north_star: one-venture-three-founder-jobs
layout: workspace-rail-contextual-conversation
---

# Drover desktop experience

## North star

Drover is a true agentic development environment for building a venture. Its three presentation modes serve
parallel founder jobs over one canonical venture model and one shared selection:

- **Work** directs agents, monitors active work, and reviews returns through conversation.
- **Product / GTM** makes the connected venture system understandable and directly shapeable.
- **Releases** assembles market movement, holds exact outward authority, and joins returned evidence.

> **One venture, one context, three ways to work. Modes change the founder's working surface, never the
> underlying authority or the lifecycle of the venture.**

Conversation remains the direction and judgment surface. It is primary in Work and contextual in Product /
GTM and Releases. The release—not a thread, mode, workflow, or agent—is what moves the venture.

## Permanent frame

The desktop frame begins with:

- workspace rail: `240px`, resizable from `208px` to `320px`;
- the active mode workspace: all remaining width;
- Work, Product / GTM, and Releases navigation below the venture switcher;
- Settings at the rail bottom.

Use `aria-current="page"` for the active mode. `⌘1`, `⌘2`, and `⌘3` switch modes; `⌘K` focuses
mode-scoped search. Do not add a decorative profile, Edit overlay, permanent agent roster, dashboard, or
competing navigation root.

In Work, conversation owns the main workspace. A deliberately opened visual sits beside it:

- rail: its current width;
- chat: `clamp(420px, 34vw, 520px)`;
- visual: the remaining width, normally 55–65% of the post-rail area.

In Product / GTM and Releases, conversation stays mounted but visually closed. Opening chat docks a
`clamp(420px, 34vw, 520px)` drawer from the right and compresses the workspace at ordinary desktop widths.
`Esc` closes the topmost visual or drawer and returns focus to the control that opened it. Composer drafts
remain scoped and intact while switching modes.

Below an effective width of `960px`, including browser zoom, the rail and contextual chat are overlays. Work
chat and an open visual retain usable minimum widths; neither may collapse into decorative chrome.

## Startup and return

Open the last active venture, mode, and shared context. Restore Work thread/visual/scroll state, Product / GTM
scope/selection/camera, Release selection/subview, rail width, and drawer state from venture-keyed presentation
memory. A v2 thread session migrates into Work without losing its thread, visual, width, or scroll. A legacy
map session migrates into Product / GTM only when its target still resolves; otherwise it returns to Work home.

When the venture has no used thread, show a lightweight conversation home using the same composer:

```text
Drover

Since you left:
• one result is ready for review
• two agents are still working
• one assumption was challenged

What do you want to work on?
```

The summary is derived only from unread consequences, returned evidence, failures, and active runs. Show no
more than three truthful suggested review actions. The founder can always type a fresh direction instead.

## Workspace rail

The rail provides stable orientation without becoming a second source of truth. Below venture and mode
navigation, its body changes with the founder job.

Work orders return value: optional Pinned, Active, Needs review, Recent, then compact older history. Only
Active and Needs review use expanded cards. Participant/runtime state stays attached to threads, headers,
and conversation updates. Thread state uses an icon, label, and accessible text—not color alone:

- active;
- waiting for founder judgment;
- failed or interrupted;
- unread result;
- quiet open;
- closed.

Product / GTM offers Whole system, Product, GTM, Needs attention, and Add to system. Releases offers New
release, Needs you, conditional Drafts, In market, Recent, and conditional Unassigned release actions.

New thread and New release begin as local drafts. Canonical records form only on the first meaningful save or
send. Search is mode-scoped and opening a result restores its canonical context, never an unrelated selection.

## Chat

The thread header contains:

- title;
- lifecycle or attention status;
- active participant statuses;
- venture-map action;
- a small menu for pin, rename, close, and receipts when those actions are backed by real contracts.

Selecting a participant status scrolls to that participant’s latest meaningful inline update. It never opens
an agent dashboard.

The composer stays attached to the bottom of the chat column and always submits against the selected
`threadRef`. Runtime, model, and participant assignment remain inferred unless the founder names a
participant. A correction sent while a visual is open updates the same thread and material.

### Conversation information levels

The main conversation contains only:

- founder directions and corrections;
- Drover’s visible interpretation;
- material progress and contradictions;
- meaningful agent handoffs;
- visual work products;
- results, failures, evidence, and exact founder questions.

Each run may add one collapsed activity disclosure, for example:

```text
Codex inspected 18 files, changed 6, and ran 4 checks.
[Show activity]
```

Full tool calls, sources, costs, runtime/model details, and low-level receipts remain available beneath that
disclosure or in the side visual. They never stream through the primary conversation by default.

## Rich conversation grammar

Model-generated prose always uses the shared markdown response renderer. Six domain projections may appear
as first-class conversation items.

### Live visual work

Show a compact real preview, owner/contributor and verification states, and only actions supported by truth:
Open, Compare, and View code.

### Before and after

Show current/proposed or before/after columns in the conversation and open the full comparison beside it.

### Flow

Show an accessible ordered flow in chat. Its larger view may expose interactive nodes and edges without
making that graph the operating surface.

### Alternatives

Show sibling attempts as approach cards derived from their existing bets/runs. Compare them side by side
without duplicating their work records.

### Evidence

Preserve original words or measured source, supports/challenges relationships, provenance, and uncertainty.
Never flatten evidence into an invented score.

### Consequence review

Summarize the exact Product, go-to-market, code, and external effects. Opening the review grants nothing.
Send, apply, deploy, spend, and destructive controls remain inside the precise founder gate and fail closed.

Every rich item needs honest loading, empty, partial, stale, failed, and long-content behavior.

## Agent presence and conversation commands

Agents are visible in context:

```text
Claude  • exploring a job-first mental model
Codex   • tracing the current implementation
Browser ✓ current experience captured
```

The founder can say:

- “Stop Codex.” — abort only the matching active run;
- “Have Claude critique what Codex built.” — start a Claude run in this thread with that material;
- “Let both try independently.” — attach distinct attempts to the same Thread;
- “Close this thread.” — end only with explicit founder authority.

Ambiguous participants or targets produce a founder question. Approval language may surface the exact gate;
it never executes the outward consequence itself.

## Optional visual

The visual is a projection of the current thread’s material. Its registry supports preview, diff, flow,
comparison, map, evidence, and consequence. It never owns business truth or changes conversation scope.

When the work is implementation, the same visual becomes a serious coding surface and may take most of the
available width. It shows the participant, Run and workspace lineage, current activity, changed files, exact
diff, command and verification receipts, failures, checkpoints, and unresolved risk. The conversation and
composer remain mounted beside it, so a correction, critique, stop, or another approach continues the same
Thread. Raw terminal and tool noise stays collapsed unless it supplies useful control or proof.

Founder actions state the exact repository consequence: approve the current checkpoint, apply or reverse it
in the source workspace, commit the isolated branch, prepare a branch or pull request, restore a checkpoint,
or discard the workspace. Multiple attempts open as separate material and can be compared; one never
overwrites another. Repository ambiguity disables the consequence instead of inviting a guess. Completed
implementation also shows the resulting Product capability and its release or distribution question.

The venture map is the primary Product / GTM workspace projection. Selecting a node updates shared context
and its inspector. Opening linked work or contextual chat resolves through the same context; the graph never
becomes another authority or an executable workflow.

Product and go-to-market material may appear together when a promise, capability, campaign, or evidence
record crosses that boundary. Drover should explain the mismatch or consequence in chat and let the founder
inspect both materials beside it.

## Visual language

The shell is a near-black editorial split. DM Sans carries the conversation; JetBrains Mono is reserved for
receipts, identifiers, and exact code. `#4f86f7` is the single interaction accent. Borders and type hierarchy
do more work than card chrome. Dense information remains quiet until it earns emphasis.

Motion is causal and fast-settling:

- opening and closing the side visual explains the spatial relationship to chat;
- new material arrives without moving the composer;
- focus restoration is deterministic;
- no decorative looping motion;
- reduced-motion preferences remove transforms and smooth scrolling.

## Keyboard and accessibility

- `Cmd/Ctrl+1`, `2`, and `3` switch founder modes; `Cmd/Ctrl+K` focuses mode-scoped search.
- `Esc` closes the topmost visual or contextual chat drawer and restores its originating control.
- rail resize supports pointer and arrow-key adjustment.
- the collapsed rail remains keyboard reachable.
- all controls expose semantic roles, visible focus, accessible names, and non-color status text.
- the conversation has log semantics, accessible auto-scroll, and an explicit scroll-to-latest control.
- at 200% zoom, the active workspace, rail overlay, and chat overlay remain usable.

## Truth and authority

The interface projects one canonical venture model: Product, go-to-market, evidence, code, decisions,
Threads, Runs, and consequences. Rich messages are projections over those records, not durable UI-message
documents. Presentation memory never enters venture truth or export.

Founder-only outward authority, venture isolation, evidence provenance, worktree review, and the founder’s
exclusive right to end active work remain unchanged. Stale or offline state keeps the last coherent
conversation readable and disables consequential mutation honestly.

## Acceptance

The rebuilt shell is ready when deterministic journeys prove:

1. startup restores the exact venture, mode, shared context, drawer, draft, visual, and scroll state;
2. Work moves to its linked Product / GTM object and Release without losing context;
3. contextual chat opens the linked thread or a correctly scoped local draft;
4. Product / GTM objects and connections can be added and edited reversibly within venture scope;
5. a release begins unsaved, persists on meaningful save, joins exact work and actions, receives evidence,
   and ends or reopens only by the founder;
6. consequences wait at the founder boundary and do nothing without the exact host action;
7. unassigned release actions remain visibly unassigned and completeness is never shown as a percentage;
8. stale/offline state preserves readability and prevents unsafe mutation;
9. keyboard navigation, Escape focus restoration, and reduced motion remain coherent;
10. the shell remains usable at 1440×900, 1280×800, and through 200% browser zoom.
