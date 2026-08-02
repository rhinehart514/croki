# Harness Canvas product specification

Status: superseded compatibility specification

> Superseded by the 0.4.2 Croki Senses / Perception Frame contract in
> [Croki on Croki](../croki.md). Agents must not call `canvas_present` or
> maintain Canvas artifacts. This document describes legacy history parsing
> only and is retained so existing Thread artifacts remain understandable.

## Product decision

Historically, this specification covered Thread-scoped visual artifacts created by an explicit
Product or GTM harness when spatial representation materially improves founder
judgment. It is not an active Canvas mode.

A visual artifact is not project memory, release state, an execution surface,
a proposal inbox, a plan view, or an agent coordination dashboard.

Croki keeps three responsibilities separate:

- the Thread contains the conversation, native provider work, approvals,
  steering, changed files, and verification;
- Canvas visualizes the subject of Product or GTM reasoning;
- repository-owned project context contains founder-approved durable truth.

Opening, closing, selecting, or arranging Canvas never silently changes provider
behavior or approved project context.

### Bring your own OpenClaw agent

OpenClaw agents are user-owned. Croki discovers the agents configured in the
user's Gateway, lets the user select one, and connects through ACP. Croki never
provisions, renames, replaces, or rewrites an agent's workspace, memory,
skills, model, tools, or delegation settings. The selected agent remains the
authority for native behavior; Croki stores only the connection and agent
identity needed to associate a Thread with that existing runtime.

## Primary experience

### Select a harness

The composer offers three one-turn behaviors:

- `Native`: no Croki behavior instruction and no Canvas execution capability;
- `Product`: product judgment with optional Canvas presentation;
- `GTM`: go-to-market judgment with optional Canvas presentation.

Product and GTM reset to Native after a successful send. The active harness is
visible in the composer before sending and in the turn receipt afterward.

### Produce a visual only when useful

The Product or GTM harness may call `canvas_present` when the answer contains a
relationship that is materially easier to judge visually. The harness does not
need Canvas to be open. Producing a Canvas artifact does not open the panel or
steal focus.

Good Product visuals include:

- materially different product routes;
- current and proposed user journeys;
- responsibility or authority boundaries;
- contradictions and their consequences;
- evidence supporting or challenging a decision;
- transformation from current behavior to a selected experience.

Good GTM visuals include:

- distinct user or buyer segments and their triggers;
- buyer, user, influencer, and channel relationships;
- funnel failure points;
- account maps;
- positioning alternatives against evidence;
- experiment systems with dependencies and proof.

Canvas must not be used for a single recommendation, a text outline placed in
boxes, ordinary tool activity, agent workstream status, or a generic dashboard.

### Reveal the artifact in the Thread

When a presentation is saved, the Thread receives a lightweight activity:

```text
Product visual ready
Three Canvas routes compare the role of project memory and visual reasoning.

[Open Canvas]
```

The activity is attributed to the harness turn that created it. It shows the
visual question, artifact revision, and item count. It never exposes raw
provider instructions or project context bodies.

### Open Canvas

Canvas opens as the existing right-panel surface. It has a true-black
background, white primary text, restrained zinc secondary text, thin borders,
and no decorative cards, pills, gradients, shadows, or continuous animation.

The top bar contains:

```text
Canvas                                      Product · revision 2
How should Canvas participate in Croki?     Updated from this Thread
```

It does not contain Product, Run, Proposals, or GTM tabs. The artifact already
knows which harness and visual kind produced it.

The field is the dominant surface. Objects use shapes to communicate role:

- focal question or outcome: large text with an open registration frame;
- route or claim: strong white title and concise consequence;
- evidence: quoted or source-led treatment with subdued typography;
- action, experiment, or consequence: numbered rail treatment;
- warning or contradiction: thin amber rule and explicit conflict label.

Edges are quiet by default and become labeled when selected or when connected
to the focused object. Position is presentation, not authority.

### Inspect and select

Selecting an object opens a narrow inspector containing only:

- title and full body;
- why it matters;
- evidence references;
- relationships to the presented scene;
- `Use in Thread`.

The inspector has no authority-state selector, node-kind selector, delete-
project-truth control, or relationship editor.

Multi-selection is supported. Selected object titles appear above the composer:

```text
Canvas selection: Native coordination · Optional visual artifact
```

Sending a message with a Canvas selection serializes the selected artifact
content into the visible user message context. Selection never sends itself.

Examples:

- `Converge on these two.`
- `Challenge this route against the evidence.`
- `Keep the responsibility boundary but remove the workflow surface.`

### Revise

The harness may present a new revision during a later turn. If Canvas is open,
Croki shows `Revision 3 available` without replacing the artifact currently
being inspected. Jacob chooses `View update`.

Revisions are immutable snapshots associated with one Thread. Returning to the
Thread opens the latest revision and restores local presentation positions.
Position changes never become part of the artifact.

### Complete the work

The final assistant response remains in the Thread. If the conclusion should
change durable project context, the harness proposes a plain context diff after
the result. Canvas itself never becomes approved context.

The founder may accept, edit, or reject each durable statement. Approval is an
explicit project-context transition and is separate from opening or selecting
the visual.

## Visual composition

### Field

- background: `#000`;
- primary text and active geometry: `#fff`;
- secondary text: zinc 400 to zinc 600;
- passive edges: zinc 800;
- selected edges: zinc 300;
- warning accent: amber 400, used only for contradictions and attention;
- minimum object width: 240 px;
- maximum readable body width: 420 px;
- zoom range: enough to inspect details and fit the whole scene;
- no minimap unless a real scene exceeds one viewport in both dimensions;
- no continuously repainting animation.

### Layouts

The artifact declares one presentation kind. Croki derives layout rather than
asking the user to position every object.

#### Compare

Used for product routes, positioning alternatives, segments, and competing
claims. The focal question sits above two to four aligned columns. Shared
evaluation dimensions align horizontally so scanning reveals tradeoffs.

#### Journey

Used for current and proposed user paths or funnel stages. Steps run left to
right on wide surfaces and top to bottom when narrow. Breaks, decisions, and
hand-offs interrupt the line visibly.

#### System

Used for responsibility, authority, dependency, account, or channel maps.
Objects form bounded groups with directional relationships. The layout favors
legibility over symmetry.

#### Evidence

Used when a conclusion depends on conflicting signals. The claim or decision
occupies the center. Supporting, contradicting, and unknown evidence occupies
separate surrounding lanes.

The harness chooses the semantic presentation kind. Croki owns deterministic
responsive layout.

### Responsive behavior

- wide: field and inspector may coexist;
- medium: inspector overlays at up to 42 percent width;
- narrow: Canvas becomes a full-height surface and the inspector becomes a
  bottom sheet;
- scenes preserve reading order when converted to a vertical layout;
- selection and `Use in Thread` remain available on every size.

## Authority and safety

Canvas artifacts are agent-authored presentation data. They are neither canon
nor instructions.

The system may silently:

- generate a bounded provisional visual artifact during an explicit Product or
  GTM turn;
- derive its layout;
- store a new immutable revision;
- append the content-safe Thread activity.

The system must not silently:

- open Canvas;
- change approved project context;
- attach Canvas content to another turn;
- replace the revision Jacob is inspecting;
- make a Product or GTM harness persistent;
- expose provider prompts, private memory, or raw Canvas bodies in receipts.

The user explicitly controls:

- opening and closing Canvas;
- selection;
- using selected material in a Thread message;
- accepting durable project-context changes;
- moving objects for local readability;
- choosing whether to view a newer revision.

## Data model

Canvas artifacts are persisted with Thread orchestration state, not in
`.croki/context.json`.

Each immutable revision contains:

```ts
interface CrokiCanvasArtifact {
  id: string;
  revision: number;
  threadId: string;
  turnId: string | null;
  harnessId: "product-v1" | "gtm-v1";
  presentation: "compare" | "journey" | "system" | "evidence";
  question: string;
  nodes: readonly CrokiCanvasArtifactNode[];
  edges: readonly CrokiCanvasArtifactEdge[];
  createdAt: string;
}
```

Nodes contain stable semantic IDs, presentation roles, bounded titles and
bodies, and portable evidence references. Edges contain only endpoint IDs and a
bounded relation. Artifact data is untrusted and strictly parsed at the server
and client boundaries.

The existing project-context schema remains the compatibility source for
approved durable truth during this change. Agent Canvas presentations stop
writing provisional nodes into it. Existing provisional Canvas nodes remain
reviewable until migrated or dismissed, but new artifacts do not extend that
model.

## Brownfield migration

### Keep

- React Flow field, responsive layout foundation, object shapes, evidence
  references, local positions, right-panel integration, MCP capability
  boundary, activity ingestion, and conflict-safe project-context editing.

### Reinterpret

- `canvas_present` creates a Thread artifact revision;
- Canvas object roles describe the visual, not project-context node kinds;
- the presentation activity carries the bounded artifact required by clients;
- harness selection grants Canvas capability for that turn.

### Remove

- Product, Run, and Proposals navigation;
- native plan projection into Canvas;
- manual node and edge creation;
- global Save Canvas, undo, redo, and dirty-draft workflow for artifacts;
- agent presentation writes to `.croki/context.json`;
- opening Canvas as a prerequisite for the provider to present a scene;
- treating ordinary Native turns as Canvas-producing turns.

## Failure behavior

- invalid artifact: the tool fails with a bounded validation error and the
  provider turn continues;
- artifact persistence failure: the Thread reports that the visual could not be
  saved while preserving the assistant response;
- unsupported provider MCP tools: the harness completes without Canvas and does
  not claim a visual exists;
- missing artifact after reload: the activity renders an unavailable state with
  no broken panel;
- newer revision while inspecting: current revision stays fixed until Jacob
  chooses the update;
- malformed legacy context: artifact presentation remains independent, while
  project-context repair remains explicit.

## Completion proof

The product is complete when one real Product turn and one real GTM turn can:

1. run without Canvas already open;
2. decide that a visual is useful;
3. save a bounded Thread-scoped artifact;
4. show `Open Canvas` in the originating Thread;
5. render the correct responsive presentation;
6. select one or more objects;
7. use that selection visibly in a follow-up message;
8. create a new immutable revision without replacing the inspected revision;
9. reload the Thread and recover the artifact;
10. leave `.croki/context.json` unchanged until an explicit founder-approved
    project-context transition.

Native turns must remain visually and behaviorally unchanged.
