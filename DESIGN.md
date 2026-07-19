---
surface: desktop-founder-chat
authority: intended-experience
date: 2026-07-19
north_star: chat-is-the-operating-surface
layout: thread-rail-persistent-chat-optional-visual
---

# Drover desktop experience

## North star

Drover is a true agentic development environment for building a venture. Conversation is the command,
coordination, return, correction, and approval surface. Visual work appears inside that conversation and,
when it needs more room, beside it.

> **Chat is the operating surface. Visuals are inspectable, interactive outputs of the conversation. The
> thread rail preserves continuity. The canonical venture model supplies memory behind the interface.**

The thread is where the founder directs and understands work. The release—not the thread, workflow, or
agent—is what moves the venture: rich messages and the stage should make the joined Product delta, customer
consequence, distribution mechanism, founder-held act, measurement, and returned evidence legible without
forcing a release form into every conversation.

The founder opens a venture or thread, says what they want, watches meaningful agent progress, inspects
material when useful, and continues directing the work through the same conversation. The founder never has
to operate the company by dragging nodes or maintaining a Product/go-to-market graph.

## Permanent frame

The default desktop frame is a two-column grid:

- thread rail: `240px`, resizable from `208px` to `320px`;
- chat: all remaining width;
- no permanent right panel, dashboard, canvas, or workbench.

The chat surface owns the full remaining area. Message content may cap its reading width for legibility.

When a visual is deliberately opened, the frame becomes:

- rail: its current width;
- chat: `clamp(420px, 34vw, 520px)`;
- visual: the remaining width, normally 55–65% of the post-rail area.

Chat never disappears. Opening a visual does not create a route or product mode. It preserves the selected
`threadRef`, chat position, and composer draft, and stores presentation state only on the local machine.
`Esc` closes the visual and returns focus to the control that opened it.

Below an effective width of `960px`, including browser zoom, the rail becomes a keyboard-accessible launcher.
Chat and an open visual divide the viewport evenly with a `320px` minimum each. Horizontal space may scroll;
the conversation must not collapse or vanish.

## Startup and return

Open the last active venture, then its last active thread. Restore its last deliberately open visual when the
viewport has room; otherwise leave that visual available from its originating message.

An obsolete session saved in map mode migrates to its linked thread with no visual open. No legacy product
mode survives migration.

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

## Thread rail

The rail is continuity, not an ontology browser. Its order is:

1. venture switcher;
2. New thread;
3. Search;
4. Pinned, only when explicit pins exist;
5. open Threads;
6. compact agent counts;
7. closed History grouped by Today, Yesterday, Last 7 days, and Older;
8. Settings.

Do not permanently render Product, Go-to-market, audiences, campaigns, releases, evidence, code, or other
canonical object levels as navigation folders. They remain searchable, referenceable system memory and
material that can open beside chat.

Open thread order is: founder attention, active work, unread result, then recency. Thread state uses an icon,
label, and accessible text—not color alone:

- active;
- waiting for founder judgment;
- failed or interrupted;
- unread result;
- quiet open;
- closed.

New thread creates a local draft only. The canonical Thread forms when the founder sends the first direction.
Pinning is an explicit row action ordered by `pinnedAt`; Drover invents no default pins.

Search covers thread title, referenced messages, visual bodies and titles, evidence and outcomes, and
decisions. Opening a match restores its owning thread and, for material matches, opens the matched visual.

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

The venture map is one registered visual. Selecting a map object changes only local map inspection. Switching
the conversation requires the explicit Open thread action. The map never replaces chat.

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

- `Cmd/Ctrl+K` focuses venture-wide search.
- `Esc` closes the open visual first and restores its originating control.
- rail resize supports pointer and arrow-key adjustment.
- the collapsed rail remains keyboard reachable.
- all controls expose semantic roles, visible focus, accessible names, and non-color status text.
- the conversation has log semantics, accessible auto-scroll, and an explicit scroll-to-latest control.
- at 200% zoom, chat and an open visual remain present with at least `320px` each.

## Truth and authority

The interface projects one canonical venture model: Product, go-to-market, evidence, code, decisions,
Threads, Runs, and consequences. Rich messages are projections over those records, not durable UI-message
documents. Presentation memory never enters venture truth or export.

Founder-only outward authority, venture isolation, evidence provenance, worktree review, and the founder’s
exclusive right to end active work remain unchanged. Stale or offline state keeps the last coherent
conversation readable and disables consequential mutation honestly.

## Acceptance

The rebuilt shell is ready when deterministic journeys prove:

1. startup restores the last thread or truthful venture conversation home;
2. a founder direction produces interpretation and live participant status in one thread;
3. visual work appears inline and opens beside chat;
4. correction while it is open updates that same thread;
5. independent attempts compare in one thread;
6. one named participant can be stopped without stopping another;
7. Product and go-to-market material can be inspected together;
8. consequences wait at the founder boundary and do nothing without the exact host action;
9. returned evidence appears in the originating thread and changes venture understanding;
10. stale/offline state preserves readability and prevents unsafe mutation;
11. the map opens beside chat and closes with `Esc`;
12. the shell remains usable at 1440×900, 1280×800, and through 200% browser zoom.
