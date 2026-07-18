---
product: Drover
surface: desktop-founder-workbench
stage: alpha
north_star: "The workbench holds the work; the conversation directs the venture; the canvas is a summoned map."
layout: "Cursor-like workspace index and conversation beside an adaptive workbench center; the venture graph is a summoned map, not the resting host"
signature_interaction: founder-direction-materializes-a-provisional-venture-model-and-useful-work
token_source: ui/src/index.css
system_record: docs/design/DESIGN.md
target_viewports:
  - 1440x900
  - 1280x800
last_reconciled: 2026-07-18
---

# Drover experience doctrine

## Authority

[`docs/FIRM-SPEC.md`](docs/FIRM-SPEC.md) defines product and build physics. [`docs/STATE.md`](docs/STATE.md)
records what the current tree proves. This file owns the intended Electron desktop experience. It does not
turn aspiration into implementation proof.

[`ui/src/index.css`](ui/src/index.css) is the production token source. [`docs/design/DESIGN.md`](docs/design/DESIGN.md)
is the extracted current-code design-system record. Other `docs/design/` files are research or historical
receipts unless this file explicitly adopts them.

## North star

**Drover makes the full product and go-to-market system visible, understandable, manipulable, and
executable by one founder.**

> **The workbench holds the work; the conversation directs and interrogates the venture; the canvas is a
> map the founder summons when causal or spatial understanding helps. Claude and Codex expand what the
> founder can accomplish.**

Drover is not a dashboard, task manager, chat wrapper, workflow-node builder, agent org chart, or diagram
that the founder must maintain. It is a founder-native agent development environment: a precise adaptive
workbench for the selected work, a continuous conversation for directing and interrogating the venture, and
a durable visual model of the company the founder can summon as a map when it adds understanding.

The primary return moment answers within ten seconds:

1. What changed while the founder was away?
2. Which work and agents are active, and where?
3. What needs the founder's judgment?
4. What exact artifacts or changes came back?
5. What crossed into the world?
6. What evidence returned?
7. What understanding should change next?

The composer remains continuously available, but after first use it is not the hero. A capable venture
opens by showing what moved and what it means.

## Experience principles

### The workbench is the center; the canvas is a summoned map

The resting surface is the adaptive workbench: it shows where things stand, and when the founder selects a
direction / run / artifact / decision it opens the best representation for that work. The founder's durable
visual model of the company — the canvas — is one action away as a summoned `map` mode; descending from it
hands the founder back to the selected work. The graph is never the permanent center or the primary
navigation model, and it is not a page the founder must maintain.

### Conversation is the intelligence layer

Conversation handles ambiguity, reasoning, critique, generation, and direction. It never becomes the only
place where important Product or go-to-market understanding exists.

> **Conversation carries intent. The workbench holds consequence. The map exposes relationships.**

### Stable orientation, adaptive depth

The founder always knows where they are. Complexity appears through semantic zoom, selection, generated
lenses, and adaptive workbench representations, not permanent clutter or false simplicity.

### Direct control remains available

The founder can manipulate the venture directly. Claude and Codex resolve ambiguity; they do not confiscate
control behind prompts and regeneration.

### Progress means the venture changed

Agent busyness is not progress. Progress is improved understanding, a formed artifact, changed
implementation, a discovered contradiction, returned evidence, a founder decision, or a revised Product or
go-to-market model.

## The one desktop frame

Drover ships one Electron founder workspace.

### Workspace index

A compact left side organizes attention through:

- the venture conversation;
- persistent scoped branches;
- saved live views;
- snapshots;
- active directions and recent runs;
- decisions requiring the founder.

It is a chronological and operational index, not another venture navigation tree. It may compress and
filter attention; it never duplicates the canonical venture model.

### Conversation

Each venture has one continuous top-level conversation. A product surface, capability, system, audience,
campaign, artifact, direction, evidence item, or saved view may have a persistent scoped branch. Branches
inherit venture context without fragmenting the venture into separate workspaces.

Conversation is a resizable working surface. It may collapse for spatial work and must restore selection,
draft, branch, scope, and scroll position. Important founder turns, model interpretations, consequential
returns, decisions, and evidence remain visible; raw work logs live behind disclosure.

### Adaptive workbench center

The permanent center is the adaptive workbench. With no selection, `VentureHome` gives the founder the
resting operating picture: where active directions stand, what returned, and what needs judgment. Selecting
a direction, run, artifact, or decision opens the best registered representation for that work in the same
center: code, diffs, previews, campaign assets, research, telemetry, positioning, comparisons, workflows, or
exact founder consequences.

The workbench preserves selection, conversation scope, composer scope, and the route back to the wider
venture. It is not a temporary overlay and does not depend on a canvas remaining mounted behind it.

### Summoned map

One explicit action replaces the workbench center with the venture map. The founder may pan, zoom, select,
arrange, group, create, connect, and compare there. Map selection preserves the same workspace and composer
scope. Double-click or Enter descends from the selected map object back into its workbench representation;
the map unmounts rather than dimming behind an overlay. Escape first returns from map to work, then broadens
selection or depth until `VentureHome` is restored.

The map projects the one canonical venture model and never owns a second business-truth store.

> **The workbench holds the work. The map supplies spatial and causal meaning.**

### Contextual founder gate

The founder boundary appears on the exact object, artifact, or release that needs a decision. It may expand
into the workbench but never becomes a separate inbox product. A clear boundary stays quiet.

## Experience laws

### 1. Cursor-like frame, venture-specific center

The frame borrows Cursor's high-level interaction physics: persistent sessions, scoped context, parallel
work, exact review, visible evidence, and keyboard-first control. The center is not files or an agent list;
it is the evolving causal model of a venture.

### 2. One venture conversation with persistent branches

The root conversation and scoped branches share one durable record. Scope changes the projection, not the
source of truth.

### 3. Selection scopes the entire environment

Selecting an object:

1. focuses it visually;
2. reveals relevant relationships;
3. scopes the composer;
4. surfaces its existing branch;
5. restores related artifacts and work;
6. keeps the wider venture visible.

Selection never sends the founder to a disconnected details page.

### 4. Progressive depth changes representation

Zoom is semantic, not merely geometric.

- **Far:** venture intent, Product value, go-to-market reach, active pressure, founder-held consequence,
  and returned reality.
- **Middle:** relationships, components, capabilities, audiences, campaigns, work, conflicts, and evidence.
- **Near:** exact artifacts, implementation, telemetry, decisions, provenance, contributors, verification,
  and line-level differences.

Tiny text is never a substitute for meaningful level-of-detail behavior. The deterministic outline preserves
access to every object at every altitude.

### 5. Product and go-to-market can reorganize into operating view

The free canvas has two permanent territories: Product and go-to-market. One action rearranges the same
objects into the Understand / Design / Execute / Learn lens defined by `FIRM-SPEC.md`. The lens is not a
process. Returning restores the exact free layout, camera, scope, and selection.

### 6. Generated visual answers are temporary

A question such as “Show why our positioning is unsupported” may temporarily rearrange relevant claims,
capabilities, evidence, campaigns, and contradictions. Dismissal restores the prior view exactly. Generated
layouts never overwrite founder placement.

The founder may explicitly save the result as a synchronized live view, capture an immutable snapshot, or
promote selected findings into canonical truth.

### 7. Direct manipulation uses hybrid semantics

Clear, cheap, reversible gestures apply immediately: move, resize, rename, edit, visual group, soft delete
and restore, save, promote, and connect an obvious relationship.

Ambiguous or consequential gestures expose Drover's interpretation before semantic truth changes:

```text
You connected “AI audit” to “Buffalo contractors.”

Drover understands:
This offer is designed for this audience.

Apply · Change relationship · Keep visual only
```

No schema form or configuration wizard is required.

### 8. Creation is open

The founder may type, paste, draw, group, connect, or ask Claude/Codex without choosing a type first.
Suggested roles remain quiet. Promotion names the behavior it unlocks: bind to repository implementation,
use as a capability, track as a campaign, attach telemetry, execute through a channel, or provide agent
context.

### 9. Detail resolves in the permanent workbench

Selection preserves enough local context to understand the object in the map, then Enter or double-click
returns to the permanent workbench for the best available representation. Precision does not open a second
overlay or leave a dimmed map mounted behind the work.

### 10. Agent visibility is adaptive

By default, Drover surfaces consequential progress only:

- approach formed;
- evidence found;
- artifact ready;
- contradiction discovered;
- implementation changed;
- verification completed;
- decision required.

The founder may descend into model interpretation, gathered context, approaches, sources, tools,
verification, cost, failures, and blockers. Agent identity never becomes the canvas's primary content.

When several agents work, the canvas shows their claims on real scopes, dependencies, branches, conflicts,
and artifacts. The founder can inspect, steer, stop, or redirect each run. Completed agents collapse into
provenance rather than becoming permanent fictional employees.

### 11. Every visible claim has provenance

The interface distinguishes founder-established truth, repository-backed truth, measured evidence, model
inference, conflict, weak or stale interpretation, unsupported relationship, and historical state. Color is
never the only signal; text, icon, shape, line treatment, and position carry the distinction.

### 12. Learning visibly changes understanding

Evidence never disappears into analytics or a report. It strengthens, weakens, contests, or revises the
relevant Product and go-to-market objects. The founder can see what changed because of what was learned.

## Signature interaction: direction materializes the venture

A broad direction such as “Help this venture grow” immediately creates a complete, editable provisional
interpretation in the canonical venture model and begins useful inward work. The workbench shows the useful
work and returns first; the founder can summon the map to inspect who may benefit, how Product value occurs,
ways to reach people, campaigns worth trying, current evidence, missing links, and concrete Product or market
work.

The structure is unmistakably inferred. It does not wait behind architecture approval, create empty
containers, or silently become canonical. The founder can correct it directly or in ordinary language.
Useful inward work begins in the same turn; every external consequence still waits for the founder.

The signature multi-agent moment is causal rather than theatrical: a founder direction branches into
visible scoped work, agents produce inspectable artifacts, verification completes, exact consequences stop
at the founder boundary, and returned evidence changes the venture model.

## Direct interaction contract

1. One click selects and preserves that scope across work and map.
2. Double-click or Enter on the map returns to the selected work in the workbench.
3. Escape broadens in order: map to work, then selection or representation depth to `VentureHome`.
4. Typing with nothing selected directs the venture through `/drive`.
5. Typing with selected work continues its durable conversation through `replyInConversation`.
6. Dragging changes placement immediately.
7. Obvious semantic connections apply directly and remain undoable.
8. Ambiguous gestures expose interpretation before semantic truth changes.
9. Generated layouts never overwrite founder layouts.
10. Saving a view is explicit.
11. Capturing a snapshot is explicit and immutable.
12. Promoting an inferred finding is explicit and preserves provenance.
13. Every external act presents the exact consequence.
14. Switching between work and map never loses selection, conversation, or composer scope.
15. Switching lenses never duplicates objects.
16. Search reaches the entire venture model, evidence, conversations, views, snapshots, and work.
17. Raw internal identifiers never become required founder vocabulary.
18. Agent work attaches to the Product or go-to-market object it changes.
19. A result without visible consequence or evidence is incomplete.
20. Every major action is reversible until it crosses into the world.

## Work and return behavior

Design first for leaving and returning. When the founder watches, show honest work rather than productivity
theater:

- the visible interpretation and autonomy envelope;
- a real plan or next action only when the runtime has one;
- current consequential milestone and elapsed time;
- durable artifacts as they form;
- participant, runtime, model, cost, configuration, and verification as quiet receipts;
- per-run redirect and stop only where the host can honor them;
- a precise explanation when work is blocked, stale, offline, or budget-limited.

No anonymous spinner, invented step list, looping avatar, ambient pulse, or activity metric may simulate work.

## Truth grammar

Lineage, chronology, attribution, causality, evidence, and interpretation are different visual claims.

- **Exact receipt:** a durable event Drover can prove.
- **Evidence-supported join:** a real return linked to originating work by captured identity or evidence.
- **Established truth:** explicitly adopted or edited by the founder.
- **Repository-backed truth:** supported by a cited repository source.
- **Measured evidence:** supported by telemetry, market response, revenue, or another captured observation.
- **Model inference:** editable interpretation with visible source and uncertainty.
- **Contested:** contradicted by evidence or another established claim.
- **Stale:** no longer safely current.
- **Unsupported:** an important claim or edge without defensible evidence.
- **Historical:** preserved in a snapshot or prior revision.

Every Product claim is one gesture from cited repository evidence or visibly labeled inference. Every market
claim keeps its source, words, attribution strength, and uncertainty.

## Visual hand

### Composition

This is a desktop founder workbench, not a responsive dashboard. The workspace index is compact. Conversation
opens at a readable working width and can resize or collapse. The permanent adaptive workbench owns the main
field; the map replaces it only when explicitly summoned.

Product and go-to-market remain distinguishable territories without becoming rigid columns. The operating
lens may temporarily align them. Relationships and whitespace create structure before cards and chrome do.

### Color

- `#e3e0da` room, `#e9e6e0` canvas, `#f4f2ee` lifted surface, `#dcd8d0` inset surface.
- `#23211d` and its warm umber ramp carry operating content.
- `#1e5245` marks interaction and focus.
- `#a9791a` belongs to founder-held consequence.
- `#b4443a` belongs to destructive or failed states.

Evidence conditions never rely on positive/negative sentiment color. Color is always reinforced by words,
shape, icon, line treatment, or position.

### Type

- Geist Variable for venture titles and major focus headings.
- System sans for body, controls, and sustained reading.
- Geist Mono for code, paths, revisions, identifiers, and exact diffs only.

Metadata stays readable. Tiny prose is not calm density.

### Material

The canvas is ground. Readable operating content is opaque. Hairlines, topology, and space group content
before another panel does. Popovers and transient tools may float one level. Modal elevation is reserved for
an exact blocking consequence. No glass behind operating text, decorative gradients, glow, nested-card
stacks, or elevation used as status.

### Motion

The motion personality is **settling with consequence**.

- Pan and zoom respond directly and stop quickly.
- Focus travels from a selected landmark and Escape restores the exact prior camera.
- Direction branches visibly separate.
- An exact release travels only to its founder boundary.
- Evidence returns along the defensible join and changes the affected object.
- Semantic and operating views rearrange once and restore exactly.
- No ambient drift, bouncing, parallax, looping work animation, or `transition: all`.
- Reduced motion preserves every causal and status signal in the settled frame.

## Founder language

Product-owned copy names the concrete object, artifact, audience, consequence, or evidence. Historical
implementation terms such as `bet`, `fork`, `outcome`, `gtm-ide`, `pipeline`, `stage`, `work item`, or “the
wall” never become required founder vocabulary.

Use verbs that name the exact effect: direct, investigate, refine, try another approach, compare, answer,
release, apply change, authorize deploy, review evidence, keep, restore, end, or stop current work. Avoid
generic Approve, Continue, Confirm, or Submit where a more truthful verb exists.

## Anti-laws

Any of these is a design regression:

- autonomous-company theater;
- an agent activity dashboard;
- a task tracker with a decorative graph;
- a CRM pipeline as the venture;
- a workflow-node editor as the default experience;
- chat that contains understanding unavailable elsewhere;
- a canvas that requires taxonomy maintenance;
- an AI org chart;
- disconnected boards or duplicate models;
- Understand/Design/Execute/Learn presented as a fixed process;
- generated structure styled as truth;
- confident edges without evidence;
- empty-plan approval;
- simplification that removes necessary depth;
- complexity that cannot be manipulated;
- a permanent property inspector;
- miniaturized cards pretending to be semantic zoom;
- stale data presented as live;
- world-touching controls without a real executor.

## Desktop and accessibility

The shipped founder product is Electron desktop. The browser is a development and deterministic-test
harness. Judge at 1440×900 and 1280×800, plus browser zoom through 200%. No phone or tablet design work.

- Every action is a semantic control with visible focus and an accessible name.
- Selection, canvas navigation, branch navigation, search, outline traversal, workbench, and restoring the
  wider venture have deterministic keyboard paths.
- Zoom never removes access to the same information through outline, conversation, or search.
- Loading, stale, offline, empty, partial, error, long content, dense scale, transport failure, and
  founder-held states are explicitly designed.
- Interactive targets, contrast, reduced motion, and screen-reader structure meet the global accessibility
  floor.

## Shipping tests

Before shipping a founder-visible change, verify:

1. **Return:** can the founder answer the seven return questions within ten seconds?
2. **Orientation:** does selection preserve the wider venture and restore the prior camera/scope?
3. **Proof:** can every surprising claim reach its source or evidence in one gesture?
4. **Truth:** can the founder distinguish established, repository-backed, measured, inferred, contested,
   stale, unsupported, and historical states without color alone?
5. **Action:** can they direct, branch, steer, stop, inspect, release, review, restore, and end through the
   same context with exact consequences?
6. **Product/GTM:** can they trace one Product value/change through a market artifact and release to returned
   evidence and changed understanding?
7. **Views:** can a generated view dismiss without mutation, save live, and snapshot immutably?
8. **Authority:** does every external consequence stop at the real founder boundary and fail closed from
   browser, model, MCP, stale, away, or forged contexts?
9. **Failure:** does the product remain honest and recoverable through provider, network, transport,
   migration, and dense-scale failures?
10. **Substitution:** with the logo and brand color removed, do the canvas, conversation, evidence grammar,
    Product/GTM traceability, and founder boundary still make the product recognizably Drover?

Deterministic tests prove mechanics, not comprehension or market value. Alpha still requires a real founder
using a real venture, completing a consequential Product/GTM loop, and returning without a walkthrough.
