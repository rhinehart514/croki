# Adaptive venture workspace

**Status:** product/design exploration, not authority.

**Date:** 2026-07-18.

**Decision:** preserve a workbench-first resting experience, but test replacing the explicit Workbench/Map
split with one intent-shaped workspace.

## Recommendation

Drover should feel like **one venture coming into focus**, not a task list beside a second graph product.

The founder's mental model should be:

> I point at the part of the venture I want to understand or change. Drover brings the relevant context,
> work, evidence, and consequence into one stable view. I can broaden to understand more or descend to edit
> exact material without losing my place.

The canonical venture remains the durable world. A founder direction creates durable work against a subject.
The interface is a temporary, reversible projection of that world around the current intent. Conversation is
an input and an explanation layer. The transcript is history, not the workspace. The map is a representation,
not a destination.

This preserves the strongest decision in `FIRM-SPEC.md`—a founder should not live inside or maintain a
canvas—but challenges its current mechanism: a permanent `work`/`map` mode and visible Workbench/Map switch
make one model feel like two products.

## The user and the concentrated value

The primary user is a solo founder returning to a venture after agents have performed substantial Product
and go-to-market work. The valuable moment is not starting another prompt. It is understanding what changed,
judging the exact material, seeing why it matters to the venture, and safely causing the next consequence.

Today Drover can render those ingredients, but the live product separates them:

- `VentureHome` and the left index repeat a direction-led view of the venture.
- A selected work thread becomes a long chronological stack whose exact material and several decisions can
  sit far below the fold.
- The summoned map exposes Drover's unique venture model, but ordinary scale compresses meaningful objects
  into unreadable geometry and requires the founder to switch mental models.
- The composer preserves scope, but the surface does not continuously show how that scope relates to the
  Product/GTM system the founder is changing.

The current hierarchy is therefore calmer than canvas-first, but not yet uniquely Drover. At rest it can be
mistaken for an agent task inbox; in Map it can be mistaken for a maintained systems diagram.

## Three competing experience architectures

### 1. Time first: the work ledger

**Core idea.** The venture is a chronological ledger of founder directions, agent work, artifacts, decisions,
external acts, and returned evidence.

**Information structure.** A compact work index on the left; one continuous event stream in the center;
exact material expands inline; a return queue filters the same events to what changed and needs judgment.

**Primary interaction.** Delegate and review. Open a durable direction, read the delta since the last visit,
inspect the artifact or diff, then steer or perform the exact founder-held act.

**Layout.** Sidebar-anchored single-column editorial stream.

**Puts first.** The latest consequential change, claiming that Drover is where the founder supervises real
venture work rather than agent activity.

**Strength.** Fast, familiar, keyboard-friendly, highly learnable, and naturally honest about time, latency,
and return.

**Weakness.** The venture model becomes backstage. Product/GTM causality is reduced to links and disclosure;
with enough work, Drover converges on an AI task manager with a decorative graph.

**Best when.** Most sessions are short review-and-release passes and the founder already carries the venture
model in their head.

**Narrow proof.** Replace one current direction view with a true typed event stream and test whether founders
can review a returned product change and its evidence without leaving the thread.

### 2. Space first: the living venture

**Core idea.** The canonical Product/GTM model is the desktop. Work, artifacts, evidence, and agents appear in
place around the venture objects they affect.

**Information structure.** A semantically zoomable Product/GTM world; work opens as embedded surfaces;
temporary generated arrangements answer questions; the founder saves useful scenes.

**Primary interaction.** Direct manipulation. Select, connect, arrange, ask, zoom, and open exact material in
place.

**Layout.** Full-bleed spatial canvas with semantic layers and embedded workpieces.

**Puts first.** The venture's causal model, claiming that Drover gives one founder visual cognition no chat,
issue tracker, or static document can provide.

**Strength.** Most differentiated and best aligned with the north star of making the entire Product/GTM
system visible and manipulable.

**Weakness.** At real density, orientation and legibility collapse before capability does. The founder becomes
responsible for camera, layout, and ontology hygiene. Exact reading and review are worse than in a document or
workbench. This breaks the current authority and repeats the canvas-first failure already recorded in
`STATE.md`.

**Best when.** The venture is early, the object count is modest, and spatial/causal reasoning is the dominant
job rather than daily review.

**Narrow proof.** Put one complete Product-to-market-to-evidence loop on a canvas at 1280x800 and test whether a
founder can find, inspect, and release exact work without a separate overlay or walkthrough.

### 3. Intent first: the adaptive focus

**Core idea.** Drover composes the smallest complete view needed for the founder's current intent. Exact work
holds the center; the relevant causal neighborhood stays visible around it; broader spatial structure appears
only as the founder broadens or asks a relational question.

**Information structure.** One durable venture model, one durable work identity, and one reversible focus
stack. Each focus contains:

- the selected subject and founder intent;
- the delta since the founder last reviewed it;
- the exact material being formed or judged;
- the upstream claims, Product capabilities, audiences, or evidence that make it meaningful;
- the downstream consequence and the founder boundary;
- the receipts that establish, contest, or weaken the interpretation.

**Primary interaction.** Focus, broaden, and descend. Selection scopes the composer and work. Enter descends
into exact material. Escape broadens. A relational question temporarily reshapes the surrounding context;
dismissal restores the exact prior view.

**Layout.** Off-center focal workpiece with a quiet causal perimeter and a compact addressable-work index. At
rest, the focal workpiece is a consequence-led return brief, not a list duplicated from the index.

**Puts first.** The part of the venture currently changing and the exact founder judgment it requires,
claiming that Drover can unite venture understanding and execution without making the founder administer the
representation.

**Strength.** Keeps the workbench's speed and exactness while making the canonical venture model continuously
useful. It is the only option whose core interaction depends on frontier AI rather than merely adding AI work
to an existing software shape.

**Weakness.** Generated composition can feel like teleportation or hidden curation. If landmarks move, context
appears without explanation, or Drover guesses the wrong neighborhood, trust collapses.

**Best when.** Work is long-running and heterogeneous, the venture is dense, and the founder must alternate
rapidly between judgment, exact execution, and causal understanding.

**Narrow proof.** Rebuild one realistic direction as a stable focus view: product change in the center;
founder intent and affected capability upstream; exact release downstream; market reply and changed belief
attached as evidence. Let the founder broaden once and return exactly.

## Why the adaptive focus wins

The work ledger is the strongest familiar baseline, but it makes Drover compete with Codex, Cursor, and
Linear on their home ground. The living venture is the strongest demonstration, but it makes the founder
maintain the interface and fails at the scale the product promises. The adaptive focus uses the singular
venture model as active interface substrate while retaining the workbench as the practical center.

The recommendation is not to merge a thread and a canvas side by side. It is to remove the seam:

```text
return
  -> the most consequential changed part of the venture comes into focus
  -> exact work and the reason it matters are visible together
  -> the founder steers, edits, compares, or reaches an exact boundary
  -> the act crosses only through the founder's hand
  -> returned evidence changes the same focused model
  -> broaden reveals the wider Product/GTM consequence
```

The stable unit is the selected subject plus the founder's direction. The system may change the
representation, but never that identity, the draft scope, the review cursor, or the founder's back stack.

## What disappears

- The product-level Workbench/Map switch. A map becomes a temporary representation reached by broadening or
  by asking a relational question.
- The duplicate direction list in the sidebar and `VentureHome`. The index remains addressable navigation;
  the center explains what changed and why it matters.
- Transcript-first composition. Important turns remain in causal order, but raw conversation and run logs
  fold behind the material or decision they produced.
- Decision/Changes/Result as generic representation tabs when they are only different slices of one returned
  workpiece. The exact material leads; relevant decisions and receipts attach to it.
- Manual canvas grooming as a prerequisite for legibility. Founder placement may remain a saved preference,
  but generated focus views arrange themselves and never overwrite it.
- Agent identity as persistent geography. Contributors collapse into provenance once their work returns.
- Repeated “Needs you” counts and generic status labels. The exact needed act is named where it occurs.

## What becomes automatic

- Choose and compose the representation that best fits the founder's expressed intent and the available
  material: diff, preview, comparison, evidence trace, market return, or causal map.
- Restore stable focus, draft, scroll/review cursor, and the founder's broaden/descend back stack by durable
  `threadRef + focusRef` rather than reconstructed UI state.
- Collapse completed agent activity into a consequence-led return with inspectable receipts.
- Rank and compress dense context while preserving a deterministic outline and search path to every object.
- Attach returned evidence to the defensible Product/GTM join and show what interpretation it changes.
- Suggest the semantic meaning of a founder gesture or generated finding. Canonical promotion remains
  explicit; automation never manufactures truth or authority.

## What must always be obvious

1. What part of the venture is in focus.
2. What changed since the founder last saw it.
3. Why it matters to Product value, go-to-market reach, or returned evidence.
4. What is established, inferred, unsupported, contested, stale, or historical.
5. What Drover is doing now and what is merely prepared.
6. The exact next founder-held consequence.
7. How to correct, undo, broaden, descend, stop, or return.

## The frontier-AI interaction

The inevitable interaction is not “chat with the canvas.” It is:

> Ask a question or select a subject; the workspace rearranges into a complete working answer, with exact
> material in the center and every important claim one gesture from its receipt. Dismiss it and the prior
> workspace returns exactly.

Frontier AI makes the representation disposable while durable identity stays fixed. That permits generated
causal views, alternate theories, side-by-side approaches, evidence-gap views, and scale-aware compression
without asking the founder to configure a dashboard, create a database view, or maintain a graph. The AI's
composition must remain visible and correctable: “Showing the product promise, first-run implementation, and
market reply because this decision may change all three.”

## What reference products would refuse

- **Apple** would not ship a normal-scale view in which meaningful objects become unreadable specks. Freeform
  treats its infinite canvas as a user-authored board: the user adds, formats, moves, and organizes items and
  scenes. Drover cannot inherit that maintenance burden and still claim the map is an automatic venture
  model. [Apple Freeform](https://support.apple.com/guide/freeform/create-a-board-frfm9474646a9/mac)
- **Linear** would not make the agent or its activity graph the accountable object. Delegated work stays on
  the issue, the human remains responsible, and the history lives in the issue activity. Drover should attach
  agents to founder-owned venture work, then collapse them into provenance. [Linear agents](https://linear.app/docs/agents-in-linear)
- **Cursor and OpenAI** would not force parallel, long-running work into one undifferentiated transcript.
  They preserve addressable agent tasks/threads and return work for review. Drover should borrow stable work
  identity and inline review, but not let projects or agent threads become the venture ontology.
  [Codex app](https://openai.com/index/introducing-the-codex-app/) ·
  [Cursor cloud agents](https://cursor.com/en-US/cloud)
- **Notion** would not discard the object the user is already touching when AI enters. Its Agent inherits the
  current page or selected blocks and can be given explicit additional sources; write actions ask for
  confirmation. Drover should make selection the stable intelligence boundary, then go further by generating
  a venture-specific representation around it. [Notion Agent](https://www.notion.com/help/notion-agent)
- **Vercel** would not hide project logs, deployments, configuration, and runtime state behind a fictional
  coworker surface. Drover should render real venture material and execution receipts, with provider identity
  as provenance rather than ontology. [Vercel Agent context](https://vercel.com/changelog/vercel-agent-has-updated-pricing)
- None of these products would knowingly ship two co-equal centers backed by the same data and require the
  user to decide which center is the real product.

## Trust contract for generated composition

The adaptive focus is viable only if it obeys stricter rules than a static workbench:

- Subject, scope, and exact execution target never move implicitly.
- A generated view names why each non-obvious object is present.
- Stable landmarks persist across refresh and return; animation shows the transition rather than hiding it.
- Broaden, descend, Back, and dismissal restore exact prior state.
- Every hidden cluster reports its contents and has a deterministic keyboard/search equivalent.
- Generated arrangements are temporary. Founder placement, saved live views, and snapshots remain distinct.
- No inferred relationship becomes canonical merely because the interface displayed it.
- The founder boundary stops motion and names the exact act; no other control visually competes with it.

## This-week proof

Prototype only the “fix why signups stall” return shown in the current Buffalo Projects fixture.

Build one 1280x800 interactive slice with:

1. A consequence-led return focus, not the current Home list.
2. The first-run change or preview as the focal material.
3. The affected first-run capability and founder intent visible upstream.
4. The market reply and its attribution strength attached as returned evidence.
5. The exact local apply and deploy boundary downstream.
6. A plain-language question—“Show why this change matters”—that broadens into a temporary causal
   Product/GTM view, then dismisses back to the exact prior focus.
7. Stable composer scope throughout.

Test it against the current work ledger and summoned map with five task-based sessions. Do not ask which
screen founders prefer. Observe whether they can, without a walkthrough:

- state what changed and why it matters;
- find the exact artifact and evidence;
- predict what Apply and Deploy will do;
- correct the right subject without a scope error;
- broaden to the venture consequence and return;
- recall the Product-to-market causal chain after leaving the view.

The riskiest assumption is that an AI-composed view can be adaptive without feeling unstable. The fastest
killing evidence is repeated disorientation, inability to predict where material will appear, or lower
causal recall than the current thread-plus-map experience. If that happens, keep the work ledger and limit
generated composition to explicit temporary questions.

## Authority impact if proven

Do not update authority before the prototype earns the change. If it does, reconcile the current wording
from “workbench center plus summoned `map` mode” to:

> The adaptive workspace is the center. Exact work is primary. Spatial and causal representations are
> summoned projections within the same focus stack, never a resting host or a parallel navigation model.

Founder direction, singular truth, Product/GTM territories, reversible projection, evidence grammar, and
exact authority remain unchanged.
