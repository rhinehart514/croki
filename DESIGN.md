---
surface: desktop-founder-workspace
authority: intended-experience
date: 2026-07-20
north_star: one-venture-three-founder-jobs
layout: mode-rail-dominant-surface-contextual-agent
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

Conversation remains the direction and judgment surface. It is primary in Work and contextual and closable
in Product / GTM and Releases, where the canvas or release path owns the center. Closing it preserves its
draft, Thread identity, and last coherent content. The release—not a Thread, mode, workflow, or agent—is what
moves the venture.

Work → Product / GTM → Releases → Evidence describes causal venture physics, not navigation stages. The
founder may enter anywhere. Switching modes preserves the focal subject and follows only existing direct
references to the nearest exact linked context. With no destination link, Drover retains the source context
and shows the missing link; it never fabricates a counterpart or invokes a generalized resolver.

## Mode-owned frame

The desktop frame begins with:

- workspace rail: `240px`, resizable from `208px` to `320px`, with a mode-owned body;
- the active mode workspace: all remaining width;
- Work, Product / GTM, and Releases navigation below the venture switcher;
- Settings at the rail bottom.

Use `aria-current="page"` for the active mode. `⌘1`, `⌘2`, and `⌘3` switch modes; `⌘K` focuses the
current mode's search. Do not add a decorative profile, Edit overlay, permanent agent roster, dashboard,
global cross-mode search, or competing navigation root.

Work is a stable agent development environment:

- rail: its current width;
- conversation: all remaining Work width until exact material or a coding workspace exists;
- selected material: conversation beside the exact artifact, founder gate, or other inspectable return;
- coding workbench: `minmax(480px, 1.18fr)`, with Changes and Preview above a collapsible terminal;
- coding composer: bound repository, isolated-worktree posture, exact model selection, and founder guard.

Work conversation follows native coding-client geometry. Transcript rows and the composer share a centered
`48rem` measure. Founder turns align right in compact bubbles no wider than 80% of that measure; agent output
is unboxed and reads directly on the conversation plane. The transcript is the only vertical scroll owner.
It restores each Thread's position, stays at the end while streaming only when the founder was already there,
and otherwise exposes the scroll-to-latest control without moving the anchored composer.

This Work kit ports the interaction geometry of T3 Code's shipped `MessagesTimeline`, `ChatComposer`,
`DiffPanel`, `ThreadTerminalDrawer`, and status/checkpoint treatment. Drover deliberately replaces T3's
project, session, Thread, event, draft, terminal, and checkpoint stores with Drover `Thread`, `Run`,
`WorkIndex`, timeline, coding-workspace, checkpoint, and founder-gate contracts. It also replaces T3's blue
interaction accents with Drover's restrained neutral/amber authority language, omits provider planning chrome,
and keeps exact consequential controls in Drover's wall. Those are intentional product differences, not a
second visual kit.

In Product / GTM and Releases, the primary canvas or release path occupies all available center space.
**Ask Drover** opens contextual conversation as a right column when room permits and as an overlay at narrow
desktop widths. It is scoped to the selected object, path, release, gap, or carried source context. Its
composer does not inherit Work's repository, worktree, or model controls. Closing and reopening it preserves
its draft, exact Thread identity, last coherent content, and scroll position.

Below an effective width of `1120px`, including browser zoom, the mode rail collapses behind its launcher and
contextual conversation overlays rather than compressing the primary surface. Both remain keyboard reachable.

## Startup and return

Open the last active venture and restore the selected mode, Thread, Product / GTM object, release, canvas
scope/camera, rail width, contextual-conversation state, and per-Thread conversation scroll from venture-keyed
presentation memory. Legacy readers may map useful selections forward but must ignore generalized
context-router and focus-stack fields.

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

The rail provides stable orientation without becoming a second source of truth. The venture switcher, mode
switch, and Settings remain stable; the body belongs to the selected mode and never shows every list at once.

**Work** shows New thread, Thread search, and compact Pinned, Active, Needs review, Recent, and older rows.
Participant/runtime state stays attached to Threads, headers, and conversation updates. Thread state uses an
icon, label, and accessible text—not color alone:

- active;
- waiting for founder judgment;
- failed or interrupted;
- unread result;
- quiet open;
- closed.

**Product / GTM** shows Whole venture, Product, Go-to-market, Needs attention, mode-local search, and compact
context for the selected object or path. **System** is not a founder-facing label. The rail does not become an
object explorer; exact editing remains on the canvas or selected-path depth.

**Releases** shows New release when exact context can seed it, mode-local search, and Needs you, Preparing,
In market, and Recent groups. It never opens a blank release form when selected work or Product / GTM truth
already supplies context.

New Threads and releases begin as local drafts; canonical records form only on first meaningful send or
founder save. Mode-local search never changes modes or invents a global result router.

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
`threadRef`. In Work, the founder can choose Auto or an exact connected Claude/Codex model; sending begins a
nonblocking coding turn in that Thread. Product / GTM and Releases infer the runtime because their agent is
context for the canvas or release path, not a second coding client. Participant assignment remains inferred
unless the founder names a participant. A correction sent while a visual is open updates the same thread and
material.

### Conversation information levels

The main conversation contains only:

- founder directions and corrections;
- Drover’s visible interpretation;
- material progress and contradictions;
- meaningful agent handoffs;
- compact references to exact material;
- results, failures, evidence, and exact founder questions.

Each run may add one collapsed activity disclosure, for example:

```text
Codex inspected 18 files, changed 6, and ran 4 checks.
[Show activity]
```

Full tool calls, sources, costs, runtime/model details, and low-level receipts remain available beneath that
disclosure or in the side visual. They never stream through the primary conversation by default.

## Conversation material references

Model-generated prose always uses the shared markdown response renderer. Six domain projections may appear
as compact material references. The transcript never renders a full artifact body, code review, comparison,
evidence collection, or founder gate card. A reference carries only enough kind, title, provenance, and state
to identify the return; opening it shows the exact material beside conversation or routes to its canonical
Product / GTM or Releases surface without moving the composer.

### Live visual work

Open the exact artifact or code return beside conversation. Owner, contributor, and verification states stay
with that material, and only actions supported by truth appear there.

### Before and after

Open current/proposed or before/after columns beside conversation.

### Flow

Open an accessible ordered flow beside conversation. Interactive nodes and edges never make that graph the
operating surface.

### Alternatives

Reference sibling attempts derived from their existing bets/runs and compare them beside conversation without
duplicating their work records.

### Evidence

Preserve original words or measured source, supports/challenges relationships, provenance, and uncertainty.
Never flatten evidence into an invented score.

### Consequence review

The reference names the exact Product, go-to-market, code, or external effect awaiting review. Opening it
grants nothing. Send, apply, deploy, spend, and destructive controls remain inside the precise founder gate
and fail closed.

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
latest attempt in the permanent workbench and lets the founder select older attempts. Changes combines a
changed-file navigator with the exact selected diff; Preview is its sibling tab. Command and verification
receipts, failures, checkpoints, and unresolved risk stay beside the conversation. Before repository work
exists, Work reserves no empty workbench, but its composer still identifies the bound repository, worktree
posture, selected model, and founder-held consequence boundary. A collapsible terminal runs only in the
canonical isolated worktree; Electron resolves the workspace and executable rather than trusting renderer
paths. Preview uses one sandboxed native view and accepts only HTTP(S). The browser harness states that these
native capabilities require Electron rather than simulating them.

Founder actions state the exact repository consequence: approve the current checkpoint, apply or reverse it
in the source workspace, commit the isolated branch, prepare a branch or pull request, restore a checkpoint,
or discard the workspace. Multiple attempts open as separate material and can be compared; one never
overwrites another. Repository ambiguity disables the consequence instead of inviting a guess. Completed
implementation also shows an editable Product consequence and distribution question as provisional Work
material. The founder may save the revision provisionally, reject it without changing Product / GTM, or adopt
it after exact verification; only adoption makes the capability canonical and directly reachable on the map.

The venture map is the primary Product / GTM workspace projection. Selecting a node changes the focal subject.
If contextual conversation is open, it follows the latest exact linked Thread; without one, the next message
creates a Thread scoped by the existing `objectRef`. Opening Work follows that direct Thread reference or
carries the selected object as a visible missing Work link. Node work state is derived from `WorkIndex`, never
stored on the graph. The graph never becomes another authority or an executable workflow.

The current spatial composition is a hypothesis. Until one real release returns attributable evidence into
next Work, do not introduce semantic-zoom capacity layers, reusable-method promotion, or reusable-capacity
ontology. Founder-made joins save immediately and remain undoable; agent-inferred joins stay visibly
provisional until adopted.

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

- `Cmd/Ctrl+1`, `2`, and `3` switch founder modes; `Cmd/Ctrl+K` focuses the current mode's search.
- `Esc` closes the topmost optional non-code visual and restores its originating control.
- rail resize supports pointer and arrow-key adjustment.
- the collapsed rail remains keyboard reachable.
- all controls expose semantic roles, visible focus, accessible names, and non-color status text.
- the conversation has log semantics, accessible auto-scroll, and an explicit scroll-to-latest control.
- Work preserves one transcript scroll owner and a stable per-Thread position across ordinary updates.
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

1. startup restores the exact venture, mode, focal Thread/object/release, canvas camera, contextual-conversation
   state, drafts, and scroll state;
2. switching modes preserves the focal subject through direct existing references and shows a missing link
   rather than restoring an unrelated selection;
3. node or release selection scopes contextual conversation to its latest linked Thread or a correctly scoped
   local draft, and closing it loses neither;
4. Work starts a nonblocking coding turn with the selected connected model, keeps transcript and exact
   material separate, exposes attempts and changed-file diffs in one Changes surface, and provides native
   preview/terminal, verification, and founder consequences;
5. Product / GTM objects and connections can be added and edited reversibly within venture scope;
6. a release begins unsaved, persists on meaningful save, joins exact work and actions, receives evidence,
   and ends or reopens only by the founder;
7. consequences wait at the founder boundary and do nothing without the exact host action;
8. unassigned release actions and missing path connections remain visible without a percentage;
9. stale/offline state preserves readability and prevents unsafe mutation;
10. keyboard navigation, rail collapse, focus restoration, and reduced motion remain coherent at desktop and
    narrow desktop widths.
11. each mode renders only its own rail content, and no founder-facing control or heading names Product / GTM
    as System.
