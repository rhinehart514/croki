---
surface: desktop-founder-workspace
authority: intended-experience
date: 2026-07-19
north_star: one-venture-three-founder-jobs
layout: thread-rail-primary-surface-persistent-agent
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

Conversation remains the direction and judgment surface. It is primary in Work and stays permanently visible
beside Product / GTM and Releases. The release—not a thread, mode, workflow, or agent—is what moves the
venture.

## Permanent frame

The desktop frame begins with:

- workspace rail: `240px`, resizable from `208px` to `320px`;
- the active mode workspace: all remaining width;
- Work, Product / GTM, and Releases navigation below the venture switcher;
- Settings at the rail bottom.

Use `aria-current="page"` for the active mode. `⌘1`, `⌘2`, and `⌘3` switch modes; `⌘K` focuses
Thread search. Do not add a decorative profile, Edit overlay, permanent agent roster, dashboard, or
competing navigation root.

Work is a stable agent development environment:

- rail: its current width;
- conversation: `minmax(380px, .82fr)`;
- coding workbench: `minmax(480px, 1.18fr)`, with Files, Diff, and Preview above a collapsible terminal.

In Product / GTM and Releases, the primary canvas or release path occupies the center and conversation is a
permanent right column. There is no Open chat control, chat drawer state, or mode-specific conversation
navigation. Composer drafts remain scoped and intact while switching modes.

Below an effective width of `1120px`, including browser zoom, the thread rail collapses behind its launcher.
The primary surface and agent stay usable; neither may collapse into decorative chrome.

## Startup and return

Open the last active venture and restore the selected mode, thread, Product / GTM object, Release, system
scope/camera, rail width, and per-thread conversation scroll from venture-keyed presentation memory. The v4
reader maps useful v3, v2, and v1 selections forward while ignoring legacy drawer, subview, context-router,
and persisted visual-stage fields.

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

The rail provides stable orientation without becoming a second source of truth. Its body never changes into
Product/GTM scopes or release lists. Across all three modes it contains the venture switcher, mode switch,
New thread, thread search, compact Pinned, Active, Needs review, Recent and older rows, agent state on the
corresponding thread, and Settings. Participant/runtime state stays attached to threads, headers, and
conversation updates. Thread state uses an icon, label, and accessible text—not color alone:

- active;
- waiting for founder judgment;
- failed or interrupted;
- unread result;
- quiet open;
- closed.

Product / GTM scope controls live in the canvas header. Release selection and New release live inside the
Releases surface. New threads and releases begin as local drafts; canonical records form only on the first
meaningful save or send. Thread search never changes the current mode.

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

## Work ADE and visual material

The visual is a projection of the current thread’s material. Its registry supports preview, diff, flow,
comparison, map, evidence, and consequence. It never owns business truth or changes conversation scope.

Code artifacts do not open as optional overlays. When a Thread carries native coding work, Work shows its
latest attempt in the permanent workbench and lets the founder select older attempts. Files, exact diff,
preview, command and verification receipts, failures, checkpoints, and unresolved risk stay beside the
conversation. A collapsible terminal runs only in the canonical isolated worktree; Electron resolves the
workspace and executable rather than trusting renderer paths. Preview uses one sandboxed native view and
accepts only HTTP(S). The browser harness states that these native capabilities require Electron rather than
simulating them.

Founder actions state the exact repository consequence: approve the current checkpoint, apply or reverse it
in the source workspace, commit the isolated branch, prepare a branch or pull request, restore a checkpoint,
or discard the workspace. Multiple attempts open as separate material and can be compared; one never
overwrites another. Repository ambiguity disables the consequence instead of inviting a guess. Completed
implementation also shows the resulting Product capability and its release or distribution question.

The venture map is the primary Product / GTM workspace projection. Selecting a node opens its latest linked
Thread in the permanent agent; without one, the next message creates a Thread scoped by the node’s existing
`objectRef`. Node work state is derived from `WorkIndex`, never stored on the graph. The graph never becomes
another authority or an executable workflow.

Releases shows one connected path: Product delta → Customer consequence → Distribution → Outward action →
Evidence. Every populated section traces to an existing relationship, Thread, decision, or outcome; an open
section names the missing connection. Exact outward gates remain in the Outward action section, joined
activity follows the path, and rename/end/reopen live in the compact Details control.

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

- `Cmd/Ctrl+1`, `2`, and `3` switch founder modes; `Cmd/Ctrl+K` focuses thread search.
- `Esc` closes the topmost optional non-code visual and restores its originating control.
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

1. startup restores the exact venture, mode, selected thread/object/release, system camera, and scroll state;
2. switching modes preserves the selected Thread while node and release selection use direct existing refs;
3. node or release selection opens its latest linked Thread or a correctly scoped local draft;
4. Work exposes attempts, files, exact diff, native preview/terminal, verification, and founder consequences;
5. Product / GTM objects and connections can be added and edited reversibly within venture scope;
6. a release begins unsaved, persists on meaningful save, joins exact work and actions, receives evidence,
   and ends or reopens only by the founder;
7. consequences wait at the founder boundary and do nothing without the exact host action;
8. unassigned release actions and missing path connections remain visible without a percentage;
9. stale/offline state preserves readability and prevents unsafe mutation;
10. keyboard navigation, rail collapse, focus restoration, and reduced motion remain coherent at desktop and
    narrow desktop widths.
