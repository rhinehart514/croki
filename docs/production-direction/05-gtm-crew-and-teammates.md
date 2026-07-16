# GTM Crew and Teammates

> **SUPERSEDED PACKAGE FILE.** This crew model is historical input only. Current teammate physics
> are defined by [FIRM-SPEC.md](../FIRM-SPEC.md).

## Product role

The crew is not a collection of graph nodes. It is Drover's durable GTM team.

The team is product-scoped. A pipeline or question may temporarily assemble a working pod, but a teammate
does not disappear when that action completes.

## Teammate contract

Every teammate must have:

- a distinct GTM job or point of view;
- a founder-safe name and voice;
- a source definition or authored artifact;
- product-specific soul/memory;
- one stable illustrated character keyed to the teammate's durable ref;
- evidence and outcome history;
- a visible relationship to founder judgment;
- a clear guardrail boundary;
- a useful answer when it has never run: honest “no record yet.”

Every teammate contribution should answer:

1. What do I believe?
2. What evidence supports it?
3. What am I uncertain about?
4. What would I do next?
5. What would change my mind?

## Agent families

The product may ship a small useful starter crew, but the host must not hard-code a closed role taxonomy.
The model may compose or discover a new role when the goal requires it.

Typical GTM perspectives include:

- product interpretation;
- buyer and market reality;
- GTM route strategy;
- positioning and proof;
- activation and adoption;
- customer signal interpretation;
- product-shaped distribution;
- measurement and attribution.

These are examples of perspectives, not a fixed sequence or required roster.

## Crew assembly

The model chooses which teammates are relevant to a question or action. The host provides:

- product truth;
- current product model;
- market context;
- question context;
- founder taste;
- prior contributions;
- relevant outcomes;
- available capabilities.

The host does not choose the winning teammate or predefine the crew for every action.

## Disagreement is a feature

When teammates disagree, the product should show:

- the distinct claims;
- evidence behind each;
- what is actually contradictory;
- what is still unresolved;
- the smallest action that could resolve it.

Never blend disagreement into a single untraceable summary.

## Memory and refinement

Founder approvals, rejections, edits, and explicit blessings refine a teammate’s soul. Market outcomes
refine the teammate’s evidence-backed record. Neither should silently mutate the source definition.

Keep versioned lineage where the source or durable learned guidance changes. Do not introduce a policy factory.

## Canvas embodiment

The crew is persistently embodied on and around the product canvas. A teammate appears where it holds a
belief, supplied evidence, owns a pipeline step, or learned from an outcome. Faces communicate identity,
authorship, or responsibility, never decoration.

One teammate keeps one deterministic illustrated character across the canvas, left rail, conversation,
crew room, creation flow, and profile. Compact surfaces do not substitute initials or anonymous status dots.
A monogram may appear only when character rendering fails, preserving a legible identity without creating a
second visual language. The same ref must render the same character; different refs must remain distinct.

Selecting a teammate focuses every connected contribution, action, decision, and outcome without removing
the surrounding product context. The relevant pod becomes visually primary while the full product-scoped
crew remains reachable at the canvas perimeter.

In context, the canvas and teammate sidecar must show:

- who is working on the current question;
- their current contribution;
- their evidence and unknowns;
- their track record;
- what the founder taught them;
- their current recommendation;
- a direct “ask this teammate” path.

The whole roster remains available, but the relevant pod should be primary. A teammate with no history says
“No decisions or outcomes yet,” not a synthetic performance label. Working state is limited to the current
step, elapsed time, and one contextual line. Disagreement renders as separate claims and evidence paths,
never a blended summary or decorative debate.

## Implementation prompt

```text
Implement this as a durable product-level GTM crew, not a pipeline-local agent factory.

Reuse crew-roster-store.mjs, teammate-soul-store.mjs, memory.mjs, agent-bridge.mjs, and existing agent
artifacts. Add only the smallest contribution/context links needed for a teammate to work across questions,
actions, coding sessions, and outcomes. Do not create policies, profiles, instances, or a closed role enum.
Ensure each teammate has evidence, uncertainty, recommendation, founder-learning, and honest empty states.
Add tests for product isolation, agent-memory isolation, founder edits, disagreement preservation, stable
character identity, distinct characters for distinct refs, and no raw prompt/soul internals reaching
founder-facing surfaces.
```
