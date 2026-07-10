# Thin Host Boundary

## Purpose

Drover rents frontier intelligence. The host must remain thin enough that new model capabilities improve
the product without requiring a new host subsystem.

## Host owns

### Truth

- read-only repository scanning;
- file:line evidence validation;
- provenance normalization;
- grounded versus inferred/speculative display;
- product/model revision history where founder edits must persist.

### Wall

- graph validation;
- founder-gate placement and reassertion;
- per-item approval stamps;
- external send/publish/deploy authorization;
- explicit autonomy promotion and revocation;
- rollback and audit history for irreversible actions.

### Taste

- founder approval/rejection/edit records;
- teammate souls and learned guidance;
- product-level decisions;
- durable references to the evidence that shaped a decision.

### Deterministic infrastructure

- persistence;
- identity and joins;
- event/feedback/result ledgers;
- graph execution;
- scheduling mechanics and budgets;
- API/MCP routing;
- read-model projections;
- observability and failure capture.

## Model owns

- selecting relevant teammates;
- forming GTM questions;
- market research;
- generating hypotheses;
- comparing possible routes;
- interpreting contradictions;
- composing action graphs;
- drafting and explaining;
- deciding what is strategically interesting;
- proposing product-shaped GTM motions;
- interpreting market outcomes.

## Thinness tests

Reject a proposed module if:

- it exists only to hold model judgment;
- it introduces a closed GTM vocabulary;
- it blocks a run before the founder gate;
- it duplicates an existing store or projection;
- it requires the host to choose the “best” market move;
- it adds a policy/instance/foundry layer between a teammate and an action;
- it can be expressed as an open agent, skill, code, or MCP step.

Prefer a projection when a value can be derived from existing truth, touch, run, feedback, or result records.

The product canvas is such a projection. It may persist founder-owned geometry and explicit durable links,
but it never becomes a second source of product truth, action state, teammate history, or outcome state.
Every visible status must be traceable to an authoritative record or runtime signal.

## Required host interfaces

The host should expose small, composable seams through existing stores and application services. The names
below are behavioral boundaries, not instructions to create one module or record per line:

- `getProductTruth(projectId)`;
- `getProductModel(projectId)`;
- `getCrew(projectId)`;
- `getCanvasProjection(projectId, focus?)`;
- `recordFounderFeedback(input)`;
- `composePipeline(input)`;
- `runPipeline(input)`;
- `getOutcomeContext(input)`;
- `recordOutcome(input)`;
- `assertGateWall(graph)`.

The names may differ in code. The boundary must not.

## Implementation prompt

```text
Review the requested feature against the thin-host rule.

Classify every proposed behavior as one of: host truth, host wall, host taste, deterministic infrastructure,
or rented intelligence. Move fuzzy judgment out of host code. Prefer existing ledgers and projections. Do not
add a new subsystem merely to make a model response look structured. Preserve open vocabularies and make all
external effects founder-gated. Add an anti-cage regression if the change could reintroduce a policy, program,
fixed-stage, or pre-run contract layer.
```
