# AI Coding and MCP Surface

> **SUPERSEDED PACKAGE FILE.** This MCP plan is historical input only. Current product direction and
> proof live in [FIRM-SPEC.md](../FIRM-SPEC.md) and [STATE.md](../STATE.md).

## Product principle

Drover should be available inside the AI coding experience, but the MCP layer must address the same stable
canvas objects and durable records as the UI. It is not a second product and not only a pipeline API.

Prefer a small verb surface—inspect, focus, ask, propose, record, and run—over one tool per new noun. Coding
actions may focus a canvas anchor, illuminate its lineage, ask the same persistent crew, or stage the same
dashed graph proposal without inventing a parallel workflow.

## Canonical capability groups

These groups describe user capabilities, not one MCP tool or durable record per bullet. Implement them through
the small verb surface over stable product/canvas references.

### Product reality

- inspect repository evidence;
- inspect product model;
- inspect recent product changes;
- inspect attribution and instrumentation gaps.

### Crew

- inspect product crew;
- inspect a teammate’s memory and track record;
- ask a teammate about a question;
- compare teammate contributions;
- record founder feedback to a teammate.

### Questions and evidence

- list/open/update a GTM question;
- attach evidence;
- attach a code/product reference;
- inspect unknowns and contradictions;
- record a founder decision.

### Actions

- propose possible GTM/product moves;
- compose an action graph;
- preview graph changes;
- run an action to the gate;
- inspect a run and its failures.

### Outcomes

- record a market signal;
- inspect joined outcomes;
- interpret an outcome;
- create a product implication;
- create a founder-reviewable product or code task.

## Operator behavior

The operator should not default every conversation to `compose_and_run`. It should be able to:

- understand;
- investigate;
- compare;
- ask the crew;
- propose;
- act;
- record;
- reflect.

The action path remains available whenever the founder asks for execution.

## Coding-session examples

```text
Ask the GTM crew who this change is for and what evidence we have.
```

```text
The last three replies support the problem but reject the workflow. Open a question and ask the crew what
product change would make the next test stronger.
```

```text
Turn this accepted GTM decision into a founder-reviewable product task. Do not edit or ship code.
```

## MCP safety

- read tools run free when classified read-only;
- write/product mutations are founder-reviewable;
- external actions remain behind the gate;
- tool descriptions state action, object, timing, and boundary;
- raw prompts, internal IDs, and soul plumbing never reach founder-facing responses.

## Implementation prompt

```text
Audit the operator tool surface against this document. Preserve the current inspect-product, product-model,
graph, gate, run, and outcome capabilities. Extend the six canonical verbs over stable references so they
cover crew, question, evidence, decision, and product-implication work; do not add noun-specific CRUD tools
or a graph-specific alias for every concept. Keep
the model's fuzzy work behind open agent/skill/MCP steps. Update the naked tool set so the operator can
understand and ask the crew before it composes an action, while preserving direct run capability. Add route,
tool-schema, wall, project-scope, and no-raw-machinery tests.
```
