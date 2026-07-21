---
surface: desktop-founder-workspace
authority: intended-experience
date: 2026-07-20
north_star: one-venture-two-surfaces-one-market-loop
layout: surface-rail-with-collapsible-release-section
---

# Drover desktop experience

## North star

Drover is a true agentic development environment for building a venture. Its two presentation surfaces serve
parallel founder jobs over one canonical venture model and one shared selection:

- **Work** talks directly to the selected Claude or Codex SDK model, monitors active work, and reviews returns through conversation.
- **Product / GTM** makes the connected venture system understandable and directly shapeable. Its distinct
  **Releases** section assembles market movement, holds exact outward authority, and joins returned evidence.

> **One venture, one context, two working surfaces. Sections change the focal workspace, never the
> underlying authority or the lifecycle of the venture.**

Conversation remains the direction and judgment surface. It is primary in Work and contextual and closable
in Product / GTM, where either the venture canvas or its release path owns the center. Closing it preserves its
draft, Thread identity, and last coherent content. The release—not a Thread, mode, workflow, or agent—is what
moves the venture.

Work → Product / GTM → Releases → Evidence describes causal venture physics, not navigation stages. The
founder may enter anywhere. Switching modes preserves the focal subject and follows only existing direct
references to the nearest exact linked context. With no destination link, Drover retains the source context
and shows the missing link; it never fabricates a counterpart or invokes a generalized resolver.

## Mode-owned frame

The desktop frame begins with:

- workspace rail: `272px`, resizable from `272px` to `360px`, with a mode-owned body;
- the active mode workspace: all remaining width;
- Work and Product / GTM navigation below the venture switcher; Releases is a collapsible Product / GTM rail section;
- Settings at the rail bottom.

Use `aria-current="page"` for the active surface. `⌘1` opens Work and `⌘2` opens Product / GTM; `⌘K` focuses the
current surface's search. Do not add a decorative profile, Edit overlay, dashboard,
global cross-mode search, or competing navigation root.

Work is a stable agent development environment:

- rail: its current width;
- SDK participant: the selected Claude or Codex model is who the founder is talking to; model/session state
  stays in the composer, Thread, transcript, and exact run receipts rather than a separate character roster;
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

In Product / GTM, the selected venture canvas or release path occupies all available center space.
**Ask about this** opens a compact contextual composer over the owning surface. It is scoped to the selected
object, path, release, gap, or carried source context. Its
composer does not inherit Work's repository, worktree, or model controls. Closing and reopening it preserves
its draft, exact Thread identity, last coherent content, and scroll position.

Contextual conversation is visually a composer, not a miniature Work window. It omits the duplicate Thread
title, lifecycle label, Map action, and empty transcript frame. Exact history expands above the composer only
when messages exist; restoring state stays one quiet line. The same SDK routing classifies the turn. A real
clear question answers in place; a real new direction opens its exact Thread in Work immediately, while the
canvas/path retains its direct reference.

Below an effective width of `1120px`, including browser zoom, the mode rail collapses behind its launcher.
The contextual composer remains an overlay at every width and stays keyboard reachable.

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

**Work** places New thread beside Thread search, then shows compact Pinned, Active, Needs review, Recent, and older rows.
When five or more Threads need judgment, Recent yields into a count-bearing disclosure so return work remains
the rail's clear center; the founder can reopen Recent in place without losing or rerouting anything.
There is no separate agent roster or agent-creation path in Work. The composer exposes the connected Claude
and Codex models directly, and the selected model is the participant addressed by the next turn. Provider and
run state remain attached to Threads, headers, and conversation updates. Thread state uses an icon, label,
and accessible text—not color alone:

- active;
- waiting for founder judgment;
- failed or interrupted;
- unread result;
- quiet open;
- closed.

**Product / GTM** opens directly to one connected agent-workflow canvas with mode-local search and a palette of
available agents and connected capabilities.
Product, go-to-market action, founder authority, attention, and returned evidence appear in the workflow itself rather
than separate scopes, lists, saved-view sections, or diagnostic destinations. Selecting a step expands it in place;
working with an agent opens scoped conversation in a bottom dock over the still-visible canvas. **System** is not a founder-facing
label, and the rail never becomes an object explorer. This is an advanced node editor, not a simplified flow strip:
conditional branches, loops, gates, retries, agent/tool assignments, and evidence-return paths should feel dense,
precise, and directly manipulable. Complexity is compressed spatially; it is not removed or converted into forms.

**Releases** is a collapsible Product / GTM rail section showing Prepare release when exact context can seed
it and Needs you, Preparing, In market, and Recent groups. Selecting the section or a release keeps Product /
GTM active and replaces the center canvas with the full release workspace. It never opens a blank release form when selected work or Product / GTM truth
already supplies context. An adopted coding consequence pre-fills its exact capability, distribution question,
Product reference, and owning Work reference; explicit preparation creates the release and both joins together.
Releases is an autonomous spatial operating surface, not a release record editor. It uses the same node, edge,
conditional-path, selection, and contextual-conversation grammar as Product / GTM, scoped to one exact release.
Starting or resuming its operator
immediately directs an agent against the exact release and its visible gaps. The agent advances every reversible,
supported step, prepares concrete outward actions, and establishes evidence return; it stops only at founder
authority or a genuinely unsupported decision. Product / GTM context stays visible in the release and opens back
to the exact node on the full canvas. Gap controls direct the agent and never open relationship forms.

New Threads and releases begin as local drafts; canonical records form only on first meaningful send or
explicit preparation. Mode-local search never changes modes or invents a global result router.

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
`threadRef`. In Work, one quiet in-chat switch changes who receives the next turn without changing the Thread,
draft, transcript, scroll position, or workspace. **Code** exposes an exact connected Claude/Codex model and
begins a nonblocking coding turn. **Product / GTM** hides coding controls and directs Drover agents to ideate
workflows, branches, founder gates, capabilities, and evidence loops; its restrained moving spectrum edge and
agent marks make the authority change unmistakable. The selector slides between participants, and submission lifts
the still-readable prompt toward the transcript, where it immediately becomes the founder turn in the same Thread,
before the asynchronous work state takes over. Product / GTM’s canvas-owned contextual composer still infers the runtime because
it is context for the canvas or release path, not a second coding client. Participant assignment remains inferred
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

Factual tool steps, sources consulted, exact questions, and measured durations remain available beneath that
disclosure or in the side visual. They never stream through the primary conversation by default. Raw private
chain-of-thought and unshaped model prose are never presented as inspectable activity.

Exact material beside Work is one calm review workspace across artifacts, comparisons, evidence, consequences,
and code. Non-HTML Product / GTM output is projected as an intentional visual artifact, not a typeset memo: the exact
content becomes a hero, artifact metadata, section bands, structured list tiles, grouped approaches, and a distinct
next-action panel as its semantics support. Legacy all-caps memo headings are normalized at the projection seam.
Each semantic section is also a direct steering target. Clicking a section focuses the existing Thread composer on
that exact section and durable work identity; the founder writes the correction in their own words, while structured
section context tells the agent to revise in place. The selected section remains visibly active, submission confirms
that the revision stayed in the same Thread, and clearing the target returns the composer to whole-artifact direction.
This is local correction, not a freeform document editor or a second artifact truth.
Evidence uses source-bearing quotations, comparisons share one aligned frame, and consequences center the exact
question and decision controls. Never dump a long prose block into one oversized card, bury the operative question in
a disclosure, or leave a small decision floating above an unexplained empty canvas.

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
paths. Brain Run receipts, coding-workspace settlement, and the native terminal use the same terminal words:
`completed`, `failed`, and `cancelled`, with `paused`, `budget-exhausted`, and `interrupted` retained where
only agent work can produce them. Raw exit code and signal remain visible receipts rather than competing
states. Preview uses one sandboxed native view and accepts only HTTP(S). The browser harness states that these
native capabilities require Electron rather than simulating them.

Founder actions state the exact repository consequence: approve the current checkpoint, apply or reverse it
in the source workspace, commit the isolated branch, prepare a branch or pull request, restore a checkpoint,
or discard the workspace. Multiple attempts open as separate material and can be compared; one never
overwrites another. Repository ambiguity disables the consequence instead of inviting a guess. Completed
implementation also shows an editable Product consequence and distribution question as provisional Work
material. The founder may save the revision provisionally, reject it without changing Product / GTM, or adopt
it after exact verification; only adoption makes the capability canonical and directly reachable on the map.

The venture map is the primary Product / GTM workspace projection. Selecting a node changes the focal subject.
Go-to-market pipelines read left to right as compact operating workflows: trigger, agent work, founder gate,
market action, and evidence return. They never duplicate the same truth as background lanes plus floating cards.
The Product / GTM rail exposes available agents and genuinely connected capabilities as draggable materials. A
capability names the access the founder has configured, never its secret, and distinguishes safe reading or inward
work from outward work that still requires an exact founder gate. Provider marks make connected access recognizable
without relying on initials. Dropping an agent or capability onto a step persists that composition on the workflow;
the entire workflow is also a drop target, routing agents to Agent Work, safe capabilities to Agent Work, and outward
capabilities to the Founder Gate when the founder does not choose a more exact step.
clicking an agent opens a focused purpose view with its runtime, tools, authority, and current workflow assignments.
That view can open scoped conversation without navigating to Work or exposing configuration UI. The founder can drag
across nodes or modifier-click them to select exact canonical objects,
then declare the selection as a workflow. Double-clicking empty canvas creates an unresolved workflow and opens
scoped conversation to shape it rather than opening a form.
The easier primary path starts with Product / GTM conversation. A substantive direction routes to one exact
Work Thread and generates a provisional conditional graph. In Work, that graph is a collapsible panel pinned
immediately above the composer—not a detached artifact card—so conversational corrections revise the same
mechanism in place. **Review full graph** opens its complete staged shape without promoting it. **Adopt in
Product / GTM** is the explicit truth boundary; adoption creates or updates one canonical workflow and focuses
it on the full canvas. Later staged revisions read as **Workflow changes** and require adoption again.
If contextual conversation is open, it follows the latest exact linked Thread; without one, the next message
creates a Thread scoped by the existing `objectRef`. Opening Work follows that direct Thread reference or
carries the selected object as a visible missing Work link. Node work state is derived from `WorkIndex`, never
stored on the graph. The graph never becomes another authority or an executable workflow.

At rest, Product / GTM reads as a live go-to-market engineering system rather than a generic object graph or
strategy diagram. Every reusable go-to-market mechanism reads left to right through **Signal → Pipeline →
Campaign → Outcome**. Returned outcomes connect back to the next meaningful signal through canonical
evidence-return relationships; the canvas never fabricates that interpretation.

A pipeline contains only its trigger, intended outcome, connected agents, available data and tools, founder
authority boundaries, and evidence to return. A campaign is one bounded activation for an audience,
objective, offer or Product release, period or batch, and stop/continue conditions. Audience, offer, message,
channel, assets, agents, tools, releases, Product proof, and evidence stay as connected venture objects rather
than becoming additional permanent bands. Selecting a pipeline reveals its complete contract, active
campaigns, and evidence. Selecting a campaign reveals live agent work, founder gates, and returned outcomes.

The four bands are presentation guides over canonical Product / GTM objects and SDK-backed work, not a fixed
node executor or generalized workflow ontology. Existing relationship lines remain the only connectors.
Agent state and **Start agent work** attach to the exact selected object or gap; the canvas does not invent a
marketing-agent organization. Editorial nodes keep shape, border, assertion, and exact relationship lines as
the meaningful signals, while the legend explains founder-set, provisional, and evidence-return connections.

An outcome joined to a release returns as a distinct evidence node at the market edge. Restrained backward
curves reach only the Product / GTM objects connected directly to that release; no similarity match or context
resolver invents another target. Its inspector separates **What happened**, **What it may mean**, and
**Affects**, states when no interpretation has been adopted, and offers **Start next work** with the exact
outcome and affected object references. The evidence node is projection-only and cannot be edited as canonical
Product truth. The headerless mode-owned map must retain the full available center height.
The evidence inspector keeps **Start next work** as a compact exact action immediately after the affected
objects; it must not stretch to fill unused inspector height.

The four-part GTM composition is the current approved operating model. Keep the pipeline contract compact and
feature-local; do not turn it into fixed execution nodes, semantic-zoom capacity layers, reusable-method
promotion, or generalized workflow machinery. Founder-made joins save immediately and remain undoable;
agent-inferred joins stay visibly provisional until adopted.

Releases shows one connected spatial graph whose causal spine is Product delta → Customer consequence →
Distribution → Outward action → Evidence. Supported branches, conditions, retries, gates, and evidence-return
loops remain visible on the canvas without becoming fabricated ontology. Every populated node traces to an
existing relationship, Thread, decision, or outcome; an open node names the missing connection. Exact outward
gates remain attached to Outward action, joined activity follows the path, and rename/end/reopen live in the
compact Details control. A failed transport
states **Nothing was sent**, preserves the provider error, and leaves the same action available as **Retry
send**. A revoked Gmail grant opens the existing reconnect form; reconnecting never retries by itself.

A deploy is available only when the bound repository supplies an exact `package.json` deploy script and the
effect names its destination. Drover host-stamps the script name, current definition, destination, and digest
before review; the gate shows the command and definition, then requires **Authorize deploy** followed by
**Deploy**. Execution re-verifies the pinned contract and runs `npm run <script>` in that venture repository
without exposing the desktop founder capability. A missing or changed contract stays visibly unavailable or
fails as **Nothing was deployed**. This repository-owned adapter is deliberate: embedding Vercel, Netlify,
or another provider SDK would add lock-in and credentials without improving the exact founder boundary; a
venture may use any provider behind its reviewed package script.

After a real Gmail action has a provider message identity, the Evidence end of the release path offers a
separate bounded-observation contract. The founder sees and grants the exact source, purpose, start, end,
return conditions, and number of sent messages in scope. The active contract exposes **Check now** and
**Revoke observation** with its last honest result. Until an exact sent source exists, the control is disabled
with the reason. This read authority records only attributable evidence; it cannot send, deploy, spend, start
unrelated work, or establish an interpretation. Provider reconnect is explicit and never retries a send.

Product and go-to-market material may appear together when a promise, capability, campaign, or evidence
record crosses that boundary. Drover should explain the mismatch or consequence in chat and let the founder
inspect both materials beside it.

## Visual language

The shell is a near-black editorial split. DM Sans carries the conversation; JetBrains Mono is reserved for
receipts, identifiers, and exact code. `#4f86f7` is the single interaction accent. Borders and type hierarchy
do more work than card chrome. Dense information remains quiet until it earns emphasis.

Drover's application mark is a warm-white `D` carrying one restrained amber return stroke on near-black. The
desktop package and browser harness use the same mark; inherited provider or source-product branding never
becomes Drover identity.

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

Electron owns one dynamic loopback Brain process and publishes only its private runtime address and instance
identity beneath the local Drover state root. The MCP transport resolves that current instance for every call
and verifies its response identity; `npm start` retains the fixed development fallback. Neither transport
creates another Brain, store, or venture authority.

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
4. Work switches within the same chat between direct Claude/Codex coding and Product / GTM agent ideation
   without losing the draft or Thread; coding turns keep transcript and exact material separate, expose attempts
   and changed-file diffs in one Changes surface, and provide native preview/terminal, verification, and founder
   consequences;
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
12. returned evidence curves to exact release-connected Product / GTM objects, keeps interpretation unresolved,
    and can seed next Work with the outcome and affected-object references without mutating canonical truth.
