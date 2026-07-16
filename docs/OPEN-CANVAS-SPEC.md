# Drover open canvas product specification

> **Superseded — 2026-07-14.** [FIRM-SPEC.md](FIRM-SPEC.md) is the only product and build contract.
> This document is implementation history and has no independent authority. The Firm spec carries
> forward the truth, wall, taste, and spatial findings it explicitly retains.

**Status:** superseded implementation history
**Stage:** alpha
**Decision date:** 2026-07-11
**Product verdict:** build

This specification defines the complete target product and the smallest trustworthy path toward it. It
supersedes earlier product-direction documents where they require every meaningful build to become a
pipeline, treat the execution graph as a separate product surface, or limit Drover to go-to-market work.
Those documents remain useful implementation history. The truth layer, founder wall, learned taste,
terrain, open step runtime, and current alpha evidence standard remain binding.

**Current build direction (2026-07-14):** [FIRM-SPEC.md](FIRM-SPEC.md) replaces this product model.
The spatial substrate and truth/wall/taste findings survive only where the firm spec retains them.

## 1. The decision

Drover is one visual working environment where a founder directs Claude or Codex to understand, create,
change, and operate a product.

Its purpose is:

> Make go-to-market and product development easier by turning Claude and Codex's work into something the
> founder can see, shape, run, and learn from on one living canvas.

The founder speaks in outcomes, not system vocabulary. Each product can carry dozens of concurrent product
and go-to-market goals. They can ask Drover to diagnose activation, compare
positions, research a market, redesign onboarding, change code, prepare a launch, find customers, or explain
what happened. Claude or Codex determines how to do the work. Drover makes the work visible and steerable,
keeps it grounded in the real product, and stops every outward effect at the founder wall.

Open-endedness is not the value by itself. It matters because the founder does not have to translate a real
problem into a pipeline, template, agent configuration, or prescribed process before intelligence can help.

## 2. Product promise

### 2.1 The user

The primary user is a founder running one or more software products. They can build quickly but cannot hold
every product decision, market read, artifact, action, and result in their head at once. They want the leverage
of frontier coding agents without managing a collection of disconnected chats, documents, branches, and
automation tools.

### 2.2 The job

The core job is:

> Help me figure out and do whatever will make this product more likely to work.

That includes work which ends in understanding, an artifact, a product change, an outward action, or a
measured result. None of those endings is privileged as the default.

### 2.3 The new capability

The new capability is not “generate a workflow.” It is:

> Hand Claude or Codex a real product problem, watch its understanding and work take shape spatially, correct
> it directly, and carry the chosen result through execution without losing context.

### 2.4 Success

Drover succeeds when it is easier to direct, understand, correct, and reuse Claude or Codex inside Drover than
inside a general-purpose coding-agent session for the same product or go-to-market job.

The alpha proof remains external reality. An outside founder must complete one real loop without help:

1. Open a real product and recognize what Drover understood.
2. Give Drover a broad product or go-to-market outcome in plain language.
3. Watch useful work appear on the canvas before the full run finishes.
4. Correct or redirect the work directly on the canvas.
5. Produce a real artifact, product change, or outward action.
6. Approve any outward effect at the founder wall.
7. Observe a real positive, negative, or zero result.
8. See that result change the canvas and the next work.

## 3. Product boundaries

### 3.1 Drover is

- A visual working environment for product development and go-to-market.
- A shared, persistent workspace for Claude, Codex, the founder, and the founder's crew.
- A grounded view of one real product meeting its market.
- A place where model work becomes editable objects, relationships, changes, and actions.
- A place where many goals coexist, share work, conflict, branch, pause, and complete independently.
- A safe path from uncertain intent to a reviewable result.
- A memory of what was tried, what the founder chose, and what the world returned.

### 3.2 Drover is not

- A generic whiteboard with an AI chat attached.
- A node editor the founder must program before work can begin.
- A fixed funnel, campaign builder, CRM, roadmap, or product-management suite.
- A collection of separate mini-products for research, positioning, analytics, coding, and outreach.
- A place where every answer or artifact must become a pipeline.
- A product organized around one required mission, primary goal, or linear roadmap.
- A host-side strategy ontology that tells the model which kinds of work exist.
- A replacement editor for every detail of code or design work.
- An autonomous system that can send, publish, deploy, charge, or merge without founder authority.

### 3.3 The implementation test

Every proposed feature must answer yes to at least one of these questions:

- Does it make Claude or Codex easier to direct?
- Does it make their work easier to understand?
- Does it make a correction cheaper and more local?
- Does it make useful work reusable across sessions?
- Does it make a real action safer?
- Does it make the market's answer clearer and more consequential?

If not, it is likely canvas decoration, workflow machinery, or another ontology.

## 4. The governing experience

The canvas is not a visualization of records created elsewhere. It is where the work happens.

The founder can begin in three equivalent ways:

- Type a request into the contextual composer.
- Select anything already on the canvas and ask Claude or Codex to work from it.
- Create, paste, drop, or connect material directly on the canvas.

The result of model work must appear on the canvas as soon as it becomes useful. A chat response may explain
what is happening, but the transcript is never the only home of meaningful work.

The founder can manipulate the result directly. They can edit text, change a value, move an object, connect
evidence, compare alternatives, reject a branch, ask another model to challenge it, or turn the result into
action. The model receives those changes as structured context rather than requiring the founder to explain
the canvas back to it in prose.

## 5. The one-canvas mental model

### 5.1 The ground

The canvas ground is the living product-market terrain. It contains the durable context that work grows from:

- Cited product truth from the repository.
- Founder-stated facts.
- Clearly labeled interpretations and open questions.
- Product objects and user journeys.
- Customers, audiences, markets, and relevant external evidence.
- Existing work, decisions, product changes, actions, and outcomes.
- The persistent crew and its accumulated lessons.

The terrain is useful before any request, artifact, or pipeline exists.

### 5.2 Work regions

When a founder starts substantial work, the canvas grows a named region around the source material. A region
is spatial organization, not a required business object or stage.

A region for “Fix activation” might contain the current onboarding journey, supporting evidence, competing
explanations, proposed changes, a code difference, and the measurement that would reveal whether the change
worked.

Regions can be moved, resized, collapsed, branched, archived, and reopened. Collapsing a region preserves a
legible summary and any unresolved decision. A region never hides an outward action waiting at the wall.

### 5.3 Goals

A goal is a durable statement of something the founder wants to understand, change, make, achieve, or learn.
Goals belong to a product, not to one global mission. A product may have dozens of active goals across product
development and go-to-market.

Examples include:

- Understand why invited teammates do not return.
- Make onboarding communicate value in under two minutes.
- Find five design partners in developer tooling.
- Publish the integration page.
- Determine whether annual pricing is credible.
- Improve attribution for project creation.
- Learn which message produces qualified replies.

There is no required top goal and no required goal tree. A goal may stand alone, relate to several other
goals, or contain smaller goals when decomposition is useful. Relationships stay explicit and open, such as
supports, conflicts with, depends on, tests, follows from, or shares work with.

A goal is not a required pre-run contract. The founder can inspect, ask, edit, or act directly without first
creating one. A substantial request may create a goal automatically as a visible, editable canvas object, or
attach to a selected existing goal. The founder can detach, combine, split, pause, resume, complete, or abandon
goals without changing unrelated work.

Goals share canvas material by reference. The same customer, evidence, artifact, product change, executable
path, or outcome may support several goals without being copied. When two goals propose incompatible changes
or outward actions, Drover shows the conflict where the shared object is touched and routes the real decision
to the founder.

Goals may be active at the same time. Each has its own work sessions, current activity, decisions, failures,
paths, and outcomes. The founder can see which goals need attention, which are progressing, which are waiting
on outside evidence, and which have gone stale without turning the canvas into a project-management board.

The host may use a small behavioral state set for coordination: active, needs-founder, waiting, paused,
completed, abandoned, failed, and stale. These states describe the work, not a universal product or GTM
process. Completing a goal records what changed and what evidence settled it; it does not imply commercial
success.

### 5.4 Items

Anything meaningful can appear as a canvas item:

- Evidence or a grounded fact.
- An inference, question, or decision.
- A person, market, product object, or product state.
- A document, table, list, comparison, diagram, image, or interactive preview.
- A customer journey, experiment, positioning direction, or plan.
- A code or design change.
- A Claude or Codex worker.
- An executable step or path.
- A founder gate, action receipt, or observed outcome.

The item's business kind is an open string. A new kind must not require a schema migration or host release
before it can exist. Drover provides consistent generic behavior and richer renderers for common forms.

### 5.5 Connections

Connections explain or execute.

Explanatory connections may say that one item supports, weakens, tests, changes, targets, produced, or
responded to another. Their labels remain open. Every model-created connection carries a basis or is clearly
marked as an inference.

Executable connections move data or context between steps. They use the existing validated graph runtime.
The founder does not need to distinguish these connection classes until they inspect or run the work.

### 5.6 Paths

An executable path appears when work needs tools, repeatability, coordination, or an outward effect. It can
contain agents, skills, code, MCP tools, deterministic connectors, human workbenches, branches, and measures.

A path is the canvas-native form of the current pipeline. “Pipeline” remains appropriate when the founder
wants to name and repeatedly run the path. It is no longer the required output of every build request.

### 5.7 The founder wall

The wall is a spatial boundary on the canvas, not a separate review destination. Any path that sends,
publishes, deploys, charges, merges, or otherwise changes the outside world must cross it.

Work approaching the wall shows the exact difference or effect:

- The message and recipients before send.
- The page and destination before publish.
- The code and environment difference before merge or deploy.
- The amount, recipient, and reason before charge.

Approval remains visible as a receipt after the action. An explicit founder promotion may graduate a proven
pattern, but exceptions still return to the wall. Neither Claude nor Codex can approve itself.

## 6. Universal canvas item contract

The canvas projects several existing authorities and one open work record. It must not copy every authority
into a second database merely to draw it.

### 6.1 Referenced items

Product truth, product-model elements, questions, teammates, pipelines, runs, gates, decisions, outcomes, and
other durable records appear through stable references. The canvas projection owns their position and visual
state, while their existing stores remain authoritative.

### 6.2 Open work objects

Model and founder work which has no existing authority uses one general record:

```text
WorkObject {
  id
  projectId
  lineageId
  revision
  kind                 open business label
  title
  summary
  content              structured JSON or text
  contentType          open rendering hint
  refs[]                stable references to source context
  evidence[]            file, URL, founder statement, run, or outcome receipts
  provenance           grounded, founder-stated, inferred, speculative, or generated
  createdBy            founder, Claude, Codex, teammate, import, or run
  status               open string; never a host-required business stage
  createdAt
  updatedAt
  retiredAt?
}
```

`kind`, `contentType`, and `status` are open. The host validates structural safety and provenance. It does not
decide which product or go-to-market concepts are allowed.

### 6.3 Goal authority

Goals use one provider-neutral authority rather than living inside Claude or Codex transcripts:

```text
Goal {
  id
  projectId
  statement
  desiredChange?
  scopeRefs[]
  relatedGoalRefs[]
  originRef?
  createdBy
  status
  statusReason?
  currentWorkRefs[]
  createdAt
  updatedAt
  completedAt?
}
```

`desiredChange` helps the founder and model recognize what the goal means without becoming a blocking success
contract. `scopeRefs` and `currentWorkRefs` are references, not copies. Relationships between goals use the
open relationship contract. A project has zero or many goals and no privileged singleton goal field.

### 6.4 Canvas relationships

```text
WorkRelation {
  id
  projectId
  sourceRef
  targetRef
  kind                 open relationship label
  label?
  basis[]              receipts or founder/model reasoning
  provenance
  createdBy
  createdAt
  retiredAt?
}
```

A relationship with no basis can exist as a speculative connection, but it cannot present itself as proven.

### 6.5 Layout

Layout remains separate from product authority:

```text
CanvasLayout {
  projectId
  positionsByRef
  regions[]
  collapsedRefs[]
  pinnedRefs[]
  viewport
  revision
  updatedAt
}
```

The layout persists spatial memory. Model-created items do not jump when a deterministic projection refreshes.
Automatic layout may propose or fill missing positions, but it never overwrites deliberate founder placement.

### 6.6 Presentation registry

Every item renders through a shared shell with selection, provenance, activity, revision, and actions. A
renderer registry may provide richer bodies for known content forms. Unknown forms use a capable generic
renderer instead of failing or appearing blank.

The initial native forms are:

- Concise statement and evidence.
- Question and decision.
- Rich text document.
- List and table.
- Side-by-side comparison.
- Product journey or state flow.
- Code difference.
- Visual or page preview.
- Agent or skill.
- Executable step and path.
- Founder gate.
- Outcome and learning receipt.

These are presentation capabilities, not a closed catalog of work the model may perform.

## 7. Canvas interaction specification

### 7.1 Navigation

- One project opens to one canvas.
- The far view makes concurrent goals legible as named regions connected to shared product and market
  context. It does not force them into one mission, ranked roadmap, or funnel.
- The project switcher changes the active product without mixing records.
- Pan and zoom are primary navigation.
- Search finds any addressable item and flies to it.
- Back returns to the previous spatial focus, not a different page.
- A minimap or quiet outline appears only when scale requires it.
- Browser refresh restores the last safe viewport, selection, expanded region, and active conversation.

### 7.2 Semantic zoom

Zoom changes detail, not identity.

- Far: regions, products, large decisions, active paths, gates, and outcomes.
- Middle: named items, major relationships, crew positions, and work status.
- Near: full artifact content, evidence, editable fields, step outputs, and controls.

The same reference remains selected across zoom levels. The canvas must not swap into a separate “Engineer”
product when the founder moves closer. Detailed execution is a near view of the same work.

### 7.3 Selection and focus

- Click selects one item.
- Shift-click or marquee selects several.
- Selecting an item highlights its meaningful incoming and outgoing relationships.
- Unrelated material recedes without disappearing.
- Enter or double-click expands the item in place.
- Escape returns through focus history to the prior canvas altitude.
- The composer automatically receives the current selection and region as context.
- When several goals are selected or implicated, the composer names them and preserves their separate intent.

### 7.4 Creating work

The founder can create work by:

- Typing on empty canvas.
- Dropping text, a file, image, URL, repository reference, dataset, or existing canvas item.
- Dragging a connection from one item into empty space and describing what should follow.
- Asking Claude or Codex to work from a selection.
- Duplicating or branching an existing item or region.

New work appears near its source unless the founder has deliberately placed a destination.

When a new request overlaps an existing goal, Drover may suggest attaching it, branching it, or keeping it
separate. The suggestion never blocks work. Similar language alone is insufficient to merge goals.

### 7.5 Editing

- Text and structured values edit in place.
- Cheap local changes apply immediately with undo.
- Structural model changes appear as a visible difference before application.
- Code and design changes show the original and proposed result together.
- Any item can be duplicated into an alternative.
- Alternatives can be compared, combined, retired, or restored.
- A founder edit becomes a durable, attributable correction that future model work receives.

### 7.6 Connecting

Dragging between items opens a small inline label field or lets the model infer a proposed relationship from
context. Model-inferred connections appear as proposals until accepted when they would materially change the
meaning or execution of work.

Dragging from an item into an executable path asks the model to adapt the path to use that context. The model
fills in the necessary steps as a dashed proposal. It does not silently reinterpret a visual line as a valid
execution graph.

### 7.7 Grouping and regions

- Marquee-selected items can be grouped into a named region.
- The model can propose a region as it materializes a substantial body of work.
- Regions can nest once, but deep arbitrary nesting is not supported.
- A collapsed region shows its purpose, current state, unresolved decisions, outward effects, and newest
  result.
- Deleting a region never silently deletes its referenced authority records.

### 7.8 History

Every structural mutation has undo and redo. The canvas keeps a human-readable change trail for model and
founder operations. A proposal, acceptance, rejection, edit, run, approval, and outcome each remain
attributable.

History is project-scoped. Restoring layout does not revert market outcomes or founder decisions. Reverting a
work object creates a new revision rather than destroying the audit trail.

## 8. Claude and Codex experience

### 8.1 One role in the product

Claude and Codex are workers on the same canvas. They are not separate product modes and they do not own
different stores, tools, or safety rules.

The founder may choose Auto, Claude, or Codex for a piece of work. Auto uses the best available connected
runtime according to product policy. The chosen runtime and model appear on the work receipt, not as dominant
branding across the canvas.

### 8.2 Shared context package

Every runtime receives the same bounded, project-scoped context package:

- The founder's request.
- Current selection, region, and nearby relationships.
- Repository grounding and cited product truth.
- Relevant product interpretation and market evidence.
- Prior decisions, edits, outcomes, and distilled taste.
- Available agents, skills, MCP tools, connectors, and workbench capabilities.
- Current permissions and the exact founder-wall boundary.
- The recent event history needed to resume without replaying the whole project.

Provider-private transcript or session identifiers never become the authoritative memory.

### 8.3 Shared work protocol

Claude and Codex follow the same product protocol:

1. Inspect the selected context and state what is known, inferred, and missing.
2. Materialize a useful first object or change before the entire task finishes.
3. Place subsequent work near its source and connect it visibly.
4. Narrate only meaningful changes in the contextual composer.
5. Ask the founder only for a decision that cannot be safely inferred.
6. Apply cheap, reversible edits directly and stage structural or consequential changes as differences.
7. Turn work into an executable path only when execution or repeatability requires it.
8. Stop any outward effect at the founder wall.
9. Attach the result and its receipts back to the originating context.

### 8.4 Model operations

The model-facing surface stays small and general. The semantic verbs remain:

- Inspect existing truth and work.
- Focus stable context.
- Ask other crew members for judgment.
- Propose reversible objects, relationships, changes, or paths.
- Record attributable model work.
- Run an executable path to the founder wall.

Under those verbs, typed canvas operations support creating and revising open work objects, connecting
references, creating regions, changing layout, proposing executable graph changes, and returning outcomes.
Business kinds and relationship labels remain open even though mutation verbs are typed.

### 8.5 Live work

The canvas shows model work as it happens:

- The responsible Claude, Codex, or crew face sits beside the current object.
- A concise current step and elapsed time are visible.
- New objects render progressively.
- Partial output remains inspectable while later work continues.
- The founder can stop, redirect, or narrow the work without restarting.
- A stopped run preserves useful completed objects and marks unfinished ones honestly.
- Errors attach to the object or path where they occurred, with retry and alternative-runtime actions.

### 8.6 Handoff and comparison

The founder can hand an item, region, or failed run from Claude to Codex or back without restating the task.
The receiving runtime gets the shared context package and the visible work, not an opaque provider transcript.

“Ask both” creates two attributable branches in the same region. It is a deliberate comparison action, not
the default cost. The founder can select, combine, or retain both. The system never blends disagreement into
false consensus.

### 8.7 Provider parity

A feature is not complete until the same normalized product behavior works through Claude Code and Codex:

- Same input context.
- Same object and proposal contracts.
- Same permissions.
- Same wall.
- Same persistence and resumption.
- Same failure vocabulary.
- Same outcome and taste return.

Provider-specific capabilities may improve quality, but cannot create a provider-specific product model.

## 9. Work endings

Drover supports several natural endings without presenting them as required stages.

### 9.1 Understand

The work ends in a grounded answer, comparison, diagnosis, or decision. It remains on the canvas with its
evidence and unresolved uncertainty. No pipeline is manufactured.

### 9.2 Make

The work ends in an editable artifact, design, dataset, or code change. The artifact is first-class on the
canvas. It may later feed another task or executable path.

### 9.3 Act

The work becomes an executable path and reaches the wall before any outward effect. The approved action and
its exact inputs remain attached as a receipt.

### 9.4 Learn

A real outcome returns and connects to the originating product context, work object, decision, action, run,
and crew when those joins exist. Approval, generation, and delivery are not market outcomes.

## 10. Product-development work

Product development is a first-class use, not a special code-native go-to-market motion.

Claude or Codex may inspect and reason over the repository, create product artifacts, and make changes in an
isolated branch or worktree. The canvas displays:

- The product problem and evidence.
- Relevant current behavior.
- Alternatives considered.
- The chosen experience or technical change.
- The file and interface difference.
- Verification progress and results.
- The intended behavioral or market signal.

Repository scanning remains read-only. Generated code never edits the founder's active branch without an
explicit apply action. Commit, merge, push, deploy, migration, destructive change, and production mutation
retain their existing approval boundaries. A standalone deploy retains the second explicit authorization.

Drover does not attempt to replace a full code editor. A code object shows the meaningful difference,
verification, and lineage, and can open the underlying files in the founder's chosen editor when detailed
editing is better there.

## 11. Go-to-market work

Go-to-market work may begin from the product, a customer, market evidence, an artifact, an outcome, or a
plain-language goal. The model may compose any useful approach. No channel enum, stage skeleton, or required
pre-run contract returns.

Research, positioning, content, outbound, product-led work, partnerships, community, pricing, distribution,
and code-native market artifacts all use the same canvas grammar. Common native renderers make frequent work
pleasant, but the renderer set never becomes the list of allowed strategies.

Every real-world action shows what will happen, to whom or where, with which artifact and measurement. The
founder wall remains the only authorization checkpoint.

## 12. Three complete example journeys

### 12.1 Diagnose and improve activation

The founder selects the activation area and writes, “Figure out why this is weak and fix the most likely
cause.” Claude or Codex creates a work region anchored to activation. Repository truth, the current journey,
available usage evidence, and missing evidence appear first. Competing explanations branch beside them.

The founder rejects one explanation and asks Codex to pursue another. A proposed onboarding change appears
with the current and proposed experience. The model creates the code in an isolated worktree and streams
verification. The code difference and test receipt attach to the proposal. A measurement object connects the
change to the intended activation behavior. Applying or deploying the change stops at the appropriate wall.
The later observed behavior returns to the activation area and updates the next recommendation.

### 12.2 Find and approach the first customers

The founder writes, “Find ten dev-tool founders who are likely to care and make the strongest approach.” The
canvas grows a region containing the product evidence, audience interpretation, research sources, candidate
people, disqualifying evidence, and two embodied approaches.

The founder edits the audience directly and removes one person. The candidate set and drafts update locally.
The selected approach expands into an executable path that researches, verifies, drafts, and stages the ten
messages. The path stops at the wall. The founder sees every recipient and message difference, approves or
edits individually, and releases. Replies, no replies, and meetings return to the same people, drafts, and
audience read.

### 12.3 Rework positioning and the landing page

The founder selects the product landmark and writes, “Our explanation feels generic. Find the sharpest truth
and rewrite the page.” The model places cited product capabilities, current copy, market alternatives, and
several distinct positions into a comparison. Each position names what it emphasizes and what it gives up.

The founder combines parts of two directions. A page artifact appears and edits in place. The associated code
difference and visual preview attach to the same object. A second model can critique the result as a separate
branch. Publishing reaches the wall. Later page behavior and conversations return as evidence against the
positioning decision.

## 13. Information architecture

### 13.1 Primary surface

There is one primary surface: the canvas.

Persistent chrome is limited to:

- Product switcher and global search.
- Canvas navigation and history.
- A contextual composer.
- A compact decision and failure indicator.
- Connection and runtime status.

Crew, skills, pipelines, outcomes, product understanding, and artifacts are summonable or searchable canvas
material, not competing base pages. Settings, credentials, and account administration may use conventional
secondary screens because they are system configuration, not product work.

### 13.2 Contextual composer

The composer is an input and steering surface attached to the canvas. It names the current selection and
runtime. It supports text, files, paste, model choice, stop, and steering.

Its empty prompt adapts to context:

- Whole product: “What should we understand, change, or make happen?”
- Selected object: “What should Claude or Codex do with this?”
- Active work: “Steer this work…”
- At the wall: “Review the exact effect before anything goes out.”

Closing or minimizing the composer never hides model-created work.

### 13.3 Focused editing

Rich objects expand in canvas space. The surrounding canvas recedes and remains spatially present through
edges, breadcrumbs, or a quiet minimap. Drover avoids modal stacks and page takeovers for product work.

An inspector may expose metadata, evidence, and advanced controls, but the primary artifact and its meaningful
actions remain on the canvas.

## 14. Visual and motion system

The physical scene is a founder working for hours at a desktop in normal daylight, moving between strategic
judgment and detailed review. This requires a calm light canvas, dense enough for real work, with restrained
color and clear spatial hierarchy.

- Near-monochrome zinc remains the base.
- Color carries interaction or semantic state, never decoration.
- The wall and pending founder attention are unmistakable without coloring every active object.
- Facts, founder statements, inference, uncertainty, proposals, and real outcomes have distinguishable
  treatments that do not depend on color alone.
- Work regions use whitespace, labels, and quiet boundaries rather than nested cards.
- Shared object shells create familiarity; rich bodies provide task-specific form.
- Typography uses the existing Geist and token scale.
- Motion uses transform and opacity only, with reduced-motion behavior.
- Model activity moves only to explain focus, materialization, connection, or state change.
- Automatic layout never creates continuous ambient motion.

## 15. Empty, partial, and failure states

### 15.1 New product

The canvas shows scan progress as contextual work. Cited product truth appears before a model is connected or
a goal is requested. The first useful actions are visible on the ground itself.

### 15.2 No Claude or Codex runtime

Grounded terrain and existing work remain available. The composer explains that a runtime is needed for new
model work and shows the available connection paths. The entire canvas is not replaced by a login wall.

### 15.3 Partial model work

Completed objects remain usable. Unfinished objects show what is missing and can be resumed, retried, handed
to the other runtime, or retired.

### 15.4 Stale evidence

Stale reads remain visible with the newer source or event that made them stale. Refreshing creates a new
revision and preserves founder edits unless a conflict needs review.

### 15.5 Runtime failure

The failure appears beside the affected item or path. It names whether the cause was availability, limit,
timeout, invalid output, tool failure, permission, or verification. Retry, narrow, switch runtime, and inspect
details are local actions.

### 15.6 Large canvas

The canvas virtualizes off-screen objects, collapses low-value detail by zoom, and emphasizes unresolved
decisions, active work, gates, failures, and new outcomes. It never attempts to show every customer, item, or
touch at once.

## 16. Accessibility and responsive behavior

- Meet WCAG 2.2 AA.
- Every canvas item and connection is keyboard reachable.
- Arrow keys move spatial focus; Enter expands; Escape backs out; standard shortcuts support search,
  selection, undo, redo, duplicate, and delete.
- A synchronized outline provides a linear, screen-reader-accessible representation of the visible canvas.
- The outline supports the same select, inspect, edit, run, and review actions.
- Focus is always visible.
- State never relies on color alone.
- Zoom to 200 percent preserves access to selection, composer, and wall.
- Reduced motion removes nonessential transitions and model-cursor movement.
- Narrow screens use focused object navigation and the outline rather than shrinking an unreadable infinite
  canvas. Full spatial authoring is optimized for desktop in alpha.

## 17. System ownership

The host continues to own only what must remain durable and safe:

### 17.1 Truth

Claims about what the product already does come from cited repository evidence or are labeled as inference.
External research carries source receipts. Founder statements remain attributable. A generated artifact can
use hypotheses, but it cannot silently promote them to fact.

### 17.2 State

The host owns project scope, stable references, open work records, relationships, layout, revisions, events,
runs, decisions, gates, outcomes, and taste. The model proposes or operates through typed mutations.

### 17.3 The wall

The host determines which tools and changes create outward effects, validates that every executable path has
the required founder authority, and rejects any model attempt to forge approval or autonomy.

### 17.4 Taste

Founder choices, edits, rejections, approvals, and outcome-linked judgments shape future work. Drafting work
must consult learned taste. Visual work must also consult learned design judgment.

### 17.5 Intelligence

Interpretation, strategy, research, synthesis, drafting, planning, design judgment, and composition remain
model-owned. The host does not replace them with ranking rules, prescribed task stages, or hardcoded strategy
objects.

## 18. Runtime and capability architecture

### 18.1 Runtime contract

The existing provider-neutral runtime boundary remains. A runtime drives a durable task to its next pause and
uses Drover-owned callbacks for tools, streaming, persistence, cancellation, and cost. It never writes gates,
decisions, outcomes, or stores directly.

The contract expands from “drive an operator session” to “drive canvas work” while preserving the current
adapter shape. A session binds to a project, work region, selection, runtime, model, permission envelope, and
event stream.

### 18.2 Capability inventory

The model receives a live inventory of available agents, skills, MCP tools, connectors, workbench surfaces,
artifact renderers, and code capabilities. Capabilities describe what they do, their read or write effect,
their required authority, and the content they accept and return.

The model remains free to combine them. There is no host-defined catalog of valid GTM or product-development
processes.

### 18.3 Permission envelope

Every session has an explicit permission envelope:

- Read repository and project state.
- Create or revise open canvas work.
- Create isolated product changes.
- Run local or read-only tools.
- Stage outward effects.
- Request founder review.

Release, publish, send, merge, deploy, charge, destructive change, and production mutation remain founder
operations. Permission is checked at the tool boundary, not inferred from model prose.

### 18.4 Context retrieval

The runtime receives the smallest relevant subgraph, then may inspect outward through stable references. It
does not receive the entire canvas or repository by default. Retrieval prioritizes selected items, connected
evidence, active work, recent decisions, outcomes, and product truth.

Every claim and materialized object retains source references captured when it was produced. Provenance is not
reconstructed later from a transcript.

## 19. API and event contracts

Exact route names may follow repository conventions, but the product needs these provider-neutral operations:

- Read the project canvas projection at a revision.
- Create, revise, relate, pause, resume, complete, and abandon product-scoped goals.
- Create, revise, retire, and restore an open work object.
- Create, revise, retire, and restore a work relationship.
- Read and update layout with optimistic concurrency.
- Start, steer, stop, resume, and hand off a model work session.
- Stream model beats, object patches, proposals, tool state, and failures.
- Accept or discard a reversible proposal.
- Compile selected work into an executable path.
- Run a path to the wall.
- Resolve a founder gate and record the receipt.
- Record and join a real outcome.
- Read history and restore a prior work-object revision.

Every mutation is project-scoped, attributable, idempotent where retried, and guarded by an expected revision.

The event stream includes at minimum:

- GoalCreated
- GoalRevised
- GoalRelated
- GoalStatusChanged
- WorkStarted
- WorkBeatRecorded
- WorkObjectCreated
- WorkObjectRevised
- WorkRelationCreated
- ProposalStaged
- ProposalResolved
- PathCompiled
- RunStarted
- RunPaused
- FounderDecisionRecorded
- ExternalEffectReleased
- OutcomeObserved
- WorkCompleted
- WorkFailed
- WorkCancelled

Names may change during implementation. The distinctions between model proposal, founder decision, external
effect, and observed outcome may not collapse.

## 20. Current system disposition

### 20.1 Keep and extend

- Read-only repository scan and file-line evidence.
- Living terrain and project-scoped product interpretation.
- Stable references and object-graph projection.
- Intertwined canvas and shared-object joins.
- Open executable nodes for agents, skills, code, MCP, tools, and workbenches.
- Claude Code and Codex runtime adapters.
- Typed graph proposals and ghost previews.
- Founder wall, staged local execution, and deploy authorization.
- Run ledger, outcomes, taste, and design memory.
- Persistent crew identity.

### 20.2 Change

- Broaden the operator from go-to-market operator to product and go-to-market collaborator.
- Replace the requirement that every build lands candidate pipeline shapes.
- Let substantial work create canvas objects and regions before or without an executable path.
- Make business object domains, work kinds, relationship labels, and statuses open.
- Treat Operator and Engineer as semantic zoom, not separate product lenses.
- Replace overlay-first detail with in-canvas expansion for meaningful work.
- Generalize graph proposals into canvas proposals which may include objects, relationships, layout, artifacts,
  and executable steps.
- Make model activity and partial output spatially visible.
- Make Claude-to-Codex handoff a first-class session operation.

### 20.3 Retire

- The pipeline-only build instruction in `operator-prompt.mjs`.
- Candidate pipeline shapes as the mandatory opening move.
- Closed business-domain and relationship enums in the general object graph.
- Duplicate product-understanding, ideas, operation, and pipeline destinations when their work can live on the
  canvas.
- Any base-screen takeover which hides the canvas for normal product work.
- Any copy that asks the founder to “compose,” choose a node kind, or configure a workflow before help begins.

### 20.4 Preserve as internal compatibility

Historical `channel`, `gtm-ide`, graph, and pipeline identifiers may remain while the migration is underway.
The founder-facing product should not expose those implementation boundaries when they do not help the task.

## 21. Delivery sequence

The target is broad, but the alpha build must prove one complete slice before expanding renderer breadth.

### T0. Reconcile the contract

- Historical task: make this specification and the revised vision the product direction at that time.
- Mark pipeline-first and separate-lens documents as implementation history where they conflict.
- Update operator language and anti-cage tests to protect the open-canvas contract.

Done when the repository has one unambiguous answer to what Drover is, what the canvas owns, and when a
pipeline is necessary.

### T1. Open the general object graph

- Add the product-scoped goal authority with zero-to-many goals and no singleton mission field.
- Support open relationships, shared references, independent state, and concurrent work across goals.
- Add the open work-object and work-relation records or deliberately generalize the existing object graph.
- Remove closed business domain and relationship validation from the general canvas layer.
- Keep executable graph validation strict and separate.
- Add revisioned persistence, stable references, events, and project isolation.
- Preserve existing truth, question, teammate, run, gate, and outcome authorities as referenced projections.

Done when a project can hold dozens of independent and related product/GTM goals, and Claude or Codex can
create an unknown but valid business kind and relationship, persist it, reload it, and render it without a new
host release.

### T2. Build the universal canvas shell

- One item shell for selection, provenance, model activity, revision, actions, and errors.
- Generic content renderer plus the initial native forms.
- Persistent positions and regions which respect founder placement.
- In-canvas expand and focused editing.
- Semantic zoom, focus tracing, search, and history.
- Keyboard outline and accessibility foundation.

Done when a grounded fact, document, comparison, code difference, agent, path, gate, and outcome coexist and
remain legible on one restored canvas.

### T3. Make model work materialize on canvas

- Generalize the durable operator session around selected canvas context.
- Add typed object, relation, region, and layout proposals.
- Stream work beats and partial objects.
- Support stop, steer, resume, retry, and local failure recovery.
- Remove mandatory candidate-pipeline behavior.
- Keep executable composition available when the request actually needs it.

Done when a broad analysis request produces useful, editable canvas work without creating a pipeline, and an
action request can still compile and run to the wall.

### T4. Complete Claude and Codex parity

- Run the same canvas-work protocol through both subscription runtimes.
- Persist runtime-neutral state and handoffs.
- Support Auto, explicit runtime choice, switch-on-failure, and deliberate ask-both branches.
- Normalize errors, limits, cancellation, and invalid outputs.

Done when one work region can start in Claude, continue in Codex, and finish through the same proposal and wall
contracts without lost context or provider-specific records.

### T5. Make product development native

- Add product-problem, journey, visual preview, and code-difference renderers.
- Connect isolated worktree creation and verification to canvas work.
- Support apply, commit, merge, push, and deploy review boundaries.
- Join product changes to intended measures and returned evidence.

Done when the activation example can be completed from diagnosis through a verified isolated change and
reviewable release without leaving the canvas for orchestration.

### T6. Make go-to-market action native

- Let any relevant canvas material compile into an open executable path.
- Render recipients, destinations, drafts, offers, and measurement at the wall.
- Preserve batch and item-level decisions, refinements, and promotion.
- Return positive, negative, and zero outcomes to their real sources.

Done when the first-customer example can reach a real gated send and return the actual response without a
fixed channel template.

### T7. Collapse duplicate surfaces

- Replace separate Operator and Engineer mental models with zoom and focus over one canvas.
- Retire redundant overlays, boards, and navigation destinations.
- Keep settings and credential management conventional and secondary.
- Verify desktop, compact, narrow, keyboard, refresh, and no-runtime states.

Done when the founder never has to ask which part of Drover contains the real work.

### T8. Close the alpha loop

- Run the complete journey on a real founder product.
- Record both Claude and Codex subscription receipts.
- Put the build in front of an outside founder.
- Observe without explaining the canvas.
- Capture the real result and its effect on the next work.

Done only when an outside founder survives the loop and a real-world answer returns.

## 22. Verification

### 22.1 Deterministic contracts

- Open work kinds and relationship labels remain open.
- Unknown content types render through the generic fallback.
- Stable references and records never cross projects.
- Layout updates preserve founder placement and reject stale conflicting revisions.
- Model mutations cannot write founder decisions, approvals, outcomes, or autonomy.
- Product facts require evidence or visible inference labels.
- Executable paths remain acyclic where required and retain an upstream wall on every outward path.
- Product changes cannot reach active branches or production through model tools alone.

### 22.2 Canvas behavior

- Zero-work product shows grounded terrain, not a blank pipeline editor.
- Analysis finishes with editable objects and no manufactured pipeline.
- An unknown model-created object is selectable, editable, connectable, reloadable, and searchable.
- Selection and focus survive semantic zoom.
- Direct edits become model context without prose restatement.
- Model proposals show exact spatial and content differences before acceptance.
- Partial work survives stop, failure, refresh, and runtime handoff.
- A large fixture remains navigable through zoom, search, focus tracing, and virtualization.
- Dozens of concurrent goals remain independently steerable and resumable while shared work is stored once.
- Conflicting goal changes are detected at the shared object and never silently resolved by a model.

### 22.3 Claude and Codex matrix

For each connected runtime, and for a project with neither connected, verify:

- Initial grounded terrain.
- Canvas analysis request.
- Canvas artifact creation and revision.
- Product-development request with isolated code change.
- Open path composition.
- Run to wall.
- Founder decision.
- Outcome return.
- Taste replay.
- Cancel, timeout, invalid output, and resume.
- Cross-runtime handoff when both are available.

### 22.4 Security matrix

- Browser, API, MCP, Claude, and Codex cannot self-approve.
- A model cannot forge autonomy or a deploy authorization.
- Every new write-capable MCP or connector declares its effect and sits behind the correct wall.
- Cross-project references fail closed.
- Untrusted artifact content cannot execute in the interface.
- Destructive repository and production operations require explicit founder authority.

### 22.5 Human alpha evaluation

Observe whether an outside founder can:

- Understand what the canvas is showing without learning internal vocabulary.
- Give a broad request without converting it into a process.
- Identify what Claude or Codex is currently doing.
- Find and correct a wrong assumption directly.
- Distinguish fact, inference, proposal, decision, release, and outcome.
- Predict what will happen before approving it.
- Return later and understand what changed.

Record confusion and trust breaks. Do not replace observation with a satisfaction score.

## 23. Performance requirements

- First grounded content should render without waiting for a model.
- Useful streamed work should appear before the task completes.
- Canvas pan, zoom, selection, and drag target 60 frames per second for the alpha dense fixture.
- Off-screen rich bodies are virtualized.
- Layout work does not block interaction and remains deterministic.
- Large model payloads arrive as bounded patches rather than full-canvas replacements.
- LCP is at most 2.5 seconds, INP at most 200 milliseconds, and CLS at most 0.1 for the normal desktop path.
- A runtime or connector hang cannot hang the canvas or erase completed work.

## 24. Product risks and counters

### Risk: generic AI whiteboard

Counter: real product grounding, executable paths, code differences, founder wall, outcomes, and durable taste
must be native. Spatial notes alone are not the product.

### Risk: canvas as decorative transcript

Counter: meaningful output is editable, connectable, addressable, reusable, and runnable. Chat-only completion
fails acceptance.

### Risk: infinite-canvas overload

Counter: semantic zoom, regions, search, focus tracing, progressive disclosure, stable layout, and aggressive
detail virtualization.

### Risk: hidden ontology returns through renderers

Counter: kinds, relationships, statuses, and content types remain open; every unknown kind has a generic path.

### Risk: “do anything” becomes unclear positioning

Counter: the product is always explained through the same job: visually direct Claude and Codex to develop and
grow a real product. Breadth is a capability, not the headline.

### Risk: broad build delays external proof

Counter: implement the activation journey as the first complete vertical slice. Add renderer breadth only
after the slice reaches a real founder.

### Risk: provider differences fracture the product

Counter: normalized context, operations, records, errors, permissions, and evaluation. Provider identity is a
receipt, not an object model.

### Risk: generated work is nearly right and expensive to repair

Counter: evidence at generation time, local direct edits, visible differences, verification, branching, and
cross-runtime critique.

## 25. Locked decisions

The following are product decisions, not implementation suggestions:

- One canvas is the primary product surface.
- Product development and go-to-market are co-equal uses.
- The founder speaks in outcomes rather than pipelines or agent configuration.
- Every meaningful model result becomes canvas material or a visible change to it.
- The canvas is directly editable and model-aware.
- A pipeline appears only when execution or repeatability requires it.
- Work kinds and explanatory relationships remain open.
- Claude and Codex use the same product and safety contracts.
- Provider-private state never becomes Drover's memory.
- Truth, the founder wall, and learned taste remain the durable harness.
- Real outcomes, including negative and zero results, return to the work that produced them.
- Alpha ends through a real outside founder loop, not through feature completion alone.

## 26. Implementation freedom

The team may change these while preserving the intent:

- Exact names of internal records, routes, and events.
- Whether open work generalizes the existing object graph or uses a new thin store.
- The canvas layout algorithm and region appearance.
- The exact initial renderer set after the required fallback and vertical slice are covered.
- The default runtime selection policy.
- Whether detailed editing expands inline, uses a canvas focus plane, or combines both.
- The order of T4 through T6 when dependency discovery favors another sequence.

The team may not solve implementation difficulty by restoring required stages, closed business enums, a
pipeline-only result, provider-specific product state, or an ungated outward path.

## 27. Do not build

Do not build a giant palette of every imaginable go-to-market and product-development object. Do not build a
new permanent destination for each job. Do not expose agent orchestration as setup. Do not make the founder
manually wire routine work. Do not persist a second copy of every authority because the canvas needs a node.
Do not turn generated interface forms into untrusted executable code inside the product.

The model invents the work. Drover provides the visual, editable, persistent, verifiable, and safe medium.

## 28. Evidence that would change the bet

Reconsider this direction if outside founders consistently arrive with a specific repeatable process they
want to author, primarily value direct graph construction, and find the broader canvas slower than Claude or
Codex alone.

Also reconsider if founders cannot form a stable spatial understanding after semantic zoom, regions, search,
and focus tracing are implemented. In that case, the product should retain the shared canvas as context while
moving detailed artifact work into a more conventional document environment.

Until either is observed, the default remains:

> Build the self-shaping canvas, prove it through one product-development-to-market loop, and let Claude and
> Codex expand what Drover can do without expanding what the founder must learn.
