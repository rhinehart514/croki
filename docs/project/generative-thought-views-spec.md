# Generative Thought Views product specification

Status: 0.4.11 implementation contract  
Date: August 8, 2026

## Product decision

Croki remains an ADE organized around native coding-agent Threads. Product,
GTM, design, and implementation thinking happen in the same conversation as
the work. There is no Canvas destination, strategy workspace, Product mode, or
visualization workflow to learn.

When the latest founder question contains structure that linear text hides,
Croki places a source-grounded interactive **View** directly after that user
message in the Thread. The provider continues natively beside it. If a useful
View cannot be formed, Croki adds nothing.

A View is a temporary representation, not an answer, recommendation, plan,
memory system, project truth, or provider instruction. Local exploration never
sends a message. Only **Use in next message** carries a founder-selected source
reference into the ordinary composer.

Historical Canvas types remain readable for migration and wire compatibility.
They are not navigation, settings, commands, or the 0.4.11 interaction model.

## Why this direction

Chat compresses every cognitive task into linear prose. That is adequate for a
direct answer and weak for comparing alternatives, tracing change, reconciling
contradictions, following causality, or manipulating assumptions.

Relevant research consistently favors structured, inspectable representations
over more recommendation-heavy assistant prose:

- [Generative Interfaces for Language Models](https://arxiv.org/abs/2508.19227)
  reports strong preference for dynamically generated interfaces in its
  evaluated tasks and uses a structured intermediate representation.
- [Google Generative UI](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)
  demonstrates prompt-specific visual and interactive explanations while also
  showing that trusted designed components and accuracy remain important.
- [AI-Instruments](https://www.microsoft.com/en-us/research/publication/ai-instruments-embodying-prompts-as-instruments-to-abstract-reflect-graphical-interface-commands-as-general-purpose-tools/)
  supports turning intent into manipulable interface objects rather than
  forcing repeated prompt reformulation.
- [AI, Help Me Think—but for Myself](https://www.microsoft.com/en-us/research/publication/ai-help-me-think-but-for-myself-assisting-people-in-complex-decision-making-by-providing-different-kinds-of-cognitive-support/)
  found support that extends a person's rationale integrates better than
  recommendation-led assistance.
- [Appropriate reliance on LLMs](https://www.microsoft.com/en-us/research/publication/fostering-appropriate-reliance-on-large-language-models-the-role-of-explanations-sources-and-inconsistencies/)
  found that sources and visible inconsistencies help reduce reliance on wrong
  answers more than explanation alone.
- [Human-centered AI and visualization](https://arxiv.org/abs/2504.07529)
  frames AI support across the sensemaking loop: prepare, explore, schematize,
  and report.
- [Thinking with Images](https://arxiv.org/abs/2506.23918) describes visual
  scratchpads that people and models can inspect and manipulate.
- [A2UI](https://a2ui.org/specification/v1.0-a2ui/) demonstrates the useful
  architecture: declarative data, a client-owned component catalog, strict
  validation, and no model-authored executable UI.

The product implication is not “draw more diagrams.” It is “externalize the
structure and uncertainty already present in the work, at the moment it helps,
without creating another place.”

## Actual user behavior

### Trigger

The founder writes an ordinary Thread message such as:

- “Compare shipping this as infrastructure versus a founder product.”
- “Why does onboarding still fail after these changes?”
- “What changed between the last two releases?”
- “What evidence contradicts our positioning?”
- “What happens if this assumption is false?”

### System behavior

Croki reads the latest user question and the bounded project Perception Frame.
It ignores private reasoning, raw tool chatter, and visible handoff metadata.
It checks whether the sources contain enough material structure to visualize.

When they do, Croki inserts one View immediately after that user message. The
View remains attached to the turn even while the agent response streams below
it. It does not open a panel, move focus, interrupt typing, or change provider
behavior.

When they do not, the Thread is unchanged. There is no empty state, suggestion,
spinner, disabled command, or invitation to maintain metadata.

### Founder action

The founder may:

- read the View without interacting;
- select a statement and inspect its epistemic state;
- open its exact file or URL source;
- open **Basis** to see coverage, foregrounding, and omissions;
- choose **Reframe** to reorganize the same sources;
- choose **Use in next message** to add that source-labelled selection to the
  normal composer; or
- ignore the View and continue the Thread.

### Finished result

The founder notices a consequential relationship, difference, contradiction,
gap, or possible world that was difficult to perceive in prose, verifies its
source, and continues building without leaving the Thread.

## Automation contract

Automatic does not mean indiscriminate.

Croki forms a View when at least one of these is true:

- bounded perception contains meaningful relationships;
- four or more semantic observations create useful grouping structure; or
- a question explicitly asks for comparison, causality, change, evidence,
  experience, alternatives, or a counterfactual and at least two observations
  are available.

Croki abstains when:

- fewer than two semantic observations exist;
- the available material is mainly runtime or tool telemetry;
- the question is empty or only contains context handoff metadata; or
- validation fails.

Abstention is silent. A generic summary disguised as a visualization is worse
than no View.

## Representation grammar

0.4.11 supports these representations through one validated semantic contract:

- **Comparison** — materially different paths or positions.
- **Possible worlds** — coherent readings that cannot yet be collapsed.
- **Causal** — candidate causes, consequences, and leverage points.
- **Temporal** — earlier, developing, and current states.
- **Evidence** — a claim against support, contradiction, and missing coverage.
- **Experience** — user trigger, action, friction, and result.
- **System** — boundaries, dependencies, and flows.
- **Counterfactual** — an altered assumption and downstream consequences.

The representation is chosen from the question and source relationships. It is
not selected from a mode menu. Reframe moves to a materially different valid
representation over the same source revision.

## Epistemic grammar

Every statement carries one visible state:

- **Observed** — directly present in a trusted source.
- **Attributed** — asserted by a named person, Thread, or provider.
- **Derived** — mechanically computed from observed data.
- **Inferred** — Croki's interpretation of visible evidence.
- **Hypothetical** — a proposal, scenario, or candidate.
- **Contradicted** — challenged by another visible source.
- **Not in sources** — a bounded gap, never proof of universal absence.

Visual polish must not flatten these distinctions. Contradictions and gaps must
remain as legible as supporting evidence.

## Basis and framing

Every View exposes:

- the exact cleaned founder question;
- the source revision;
- coverage count and source families;
- what the chosen representation foregrounds;
- what it omits, including bounded/truncated material; and
- the fact that private model reasoning is never represented.

Croki never claims that a visualization is neutral. Basis is part of the
product, not debugging metadata.

## Use in next message

Selecting a statement is local attention. It does not affect the agent.

**Use in next message** adds a visible composer selection containing stable
source IDs, View identity, and source revision. The founder can remove it before
sending. Successful send clears it; failed send preserves it. The selection
does not grant authority, choose tools, select a harness, or serialize private
reasoning.

## 0.4.11 architecture

The first generator is deterministic and provider-independent:

1. The existing server project-perception query returns a bounded typed frame.
2. `@croki/shared/crokiThoughtView` filters non-semantic telemetry, chooses a
   representation, assigns epistemic states, and produces validated regions,
   relationships, statements, sources, and basis.
3. The Thread client inserts the View after the matching latest user message.
4. Client-owned web, React Native, and SwiftUI components render only trusted
   semantic primitives.
5. Selection returns through the existing visible composer boundary.

There is no second agent session, hidden Thread, prompt harness, model-authored
HTML, executable generated code, or durable authored View database.

A future model refiner may emit richer data through the same contract. It may
not bypass validation, remove provenance, weaken deterministic fallback, or
couple View availability to the selected coding provider.

## Lifecycle

- A View is keyed by question, representation, source revision, and statement
  revisions.
- A new founder question replaces the active automatic View.
- Reframe is local and reversible.
- If sources change while a reframed View is being inspected, **Update** appears.
- Historical turns retain their ordinary messages and source evidence; 0.4.11
  does not create a second durable visual history system.
- Old Canvas receipts and identifiers remain readable but do not render as new
  navigation or timeline calls to action.

## Responsive and accessible behavior

- Desktop: the View uses the existing Thread content width and may form two
  semantic lanes. It never claims the entire workspace.
- Narrow widths: regions stack in reading order and actions retain 44-point
  touch targets.
- Keyboard: all statements and controls are reachable in logical order.
- Screen readers announce representation, epistemic state, selection, source,
  and expanded Basis state.
- Color is never the only signal for epistemic meaning.
- Reduced motion produces no spatial transition requirement.

## Performance and privacy

- Deterministic compilation is synchronous and bounded to 18 statements and 24
  relationships.
- Project perception is queried only for an active Thread with a user question.
- No raw transcript, private reasoning, connector payload, secret, or arbitrary
  repository content is copied into a View beyond the existing perception
  boundary.
- Opening a View source uses normal Files or Preview authority.
- Consequential external and production writes remain ordinary Thread actions
  with their existing permission boundaries.

## Failure boundaries

- Unsupported or sparse input: render nothing.
- Perception query failure: preserve the Thread; no blocking error surface.
- Invalid semantic output: reject it and render nothing.
- Source becomes stale: retain named revision and expose Update when relevant.
- Reframe produces the same structure: do not pretend it is different.
- Selected source disappears: keep the visible selection until the founder
  removes it or a send succeeds, and report source failure through normal UI.
- Provider request differs merely because a View was displayed: release blocker.
- A Canvas tab, command, setting, route, or “open visualization” instruction is
  required: release blocker.

## Required proof

### Contract and compiler

- every representation and epistemic state decodes;
- all statement and relationship endpoints trace to sources;
- comparison, temporal, causal, and abstention cases are deterministic;
- Reframe preserves statements and source revision;
- visible handoff metadata never becomes the represented question.

### Product interaction

- a qualifying View is placed immediately after its user message;
- a non-qualifying turn has no placeholder;
- Basis and Reframe work without sending;
- source opening routes through Files or Preview;
- Use in next message is visible, removable, preserved on failure, and cleared
  on successful send;
- no Canvas UI is offered in Settings, panels, commands, Thread actions, mobile,
  or native iOS;
- Build and Plan remain the only visible provider interaction choices.

### Regression

- Thread streaming, anchoring, minimap, folding, and composer insets remain
  stable with a variable-height View row;
- Preview, Files, Review, Git, Terminal, worktrees, checkpoints, reconnect, and
  provider requests behave as before;
- old Canvas state remains readable and safely closable.

## Explicit non-goals

- A Canvas product surface or manually maintained scene.
- Product, GTM, Founder, Strategy, or Visualizer provider modes.
- Automatic recommendations or hidden decisions.
- A strategy folder, task board, object browser, or canonical visual database.
- Arbitrary generated applications inside Croki.
- Scores for product quality, confidence, alignment, or progress.
- A fixed node-link graph as the universal representation.

## Product proof

The proof is not that Croki can draw a sophisticated diagram. The proof is that
ordinary work in an ordinary Thread becomes easier to reason about because
Croki automatically exposes source-grounded structure at the exact turn where
it matters, and the founder can inspect, reframe, or use it without learning or
maintaining another product surface.
