# Questions, Evidence, and Decisions

## Why this layer exists

Drover needs a durable place where the GTM crew can work on product-market questions without forcing every
interaction into a pipeline run.

The question layer is connective tissue, not a new cage.

## Question behavior

A question can be:

- founder-created;
- inferred from a code change;
- surfaced by a market signal;
- opened by a teammate;
- attached to an action;
- reopened by an outcome.

It can hold multiple competing interpretations. It does not need to be “resolved” before another action can
start, and an action can exist without a question.

## Evidence behavior

Every statement shown to the founder must carry one of:

- observed;
- researched;
- founder-stated;
- inferred;
- speculative.

The host enforces structural provenance. Agents decide the interpretation.

Evidence should be linkable to:

- repository files and lines;
- product model elements;
- market sources;
- people or organizations;
- product events;
- sent artifacts;
- founder decisions;
- outcomes.

## Founder decisions

The founder is not asked to approve every thought. The founder is asked to decide only when judgment matters:

- choose among materially different GTM directions;
- accept or reject an interpretation;
- bless or overturn a teammate lesson;
- approve a product-shaped change;
- approve an external action;
- interpret an ambiguous outcome.

Routine formatting, routing, research, and composition remain model work.

## Product implication

An outcome or market signal can create a product implication. That implication is initially a hypothesis, not
an automatic code change.

Examples:

- “The buyer understands the promise but cannot find the first useful action.”
- “This capability attracts a different segment than the current positioning claims.”
- “The market response supports the problem but not the proposed workflow.”

The founder can accept, reject, edit, or defer the implication. An accepted implication can become a coding
task or a product-change action.

## Implementation prompt

```text
Build the question/evidence/decision layer as thin connective tissue over existing product truth, market
objects, product model, feedback ledger, runs, results, and teammate memory.

Preserve competing interpretations and provenance. Never flatten disagreement into a model-authored truth.
Do not make questions mandatory before runs. Do not gate pre-gate work on question completeness. Founder
decisions must be durable and auditable, while routine agent work remains free to proceed. Add tests for
provenance demotion, question/project isolation, disagreement preservation, outcome-to-implication links,
and founder decision writeback into teammate memory.
```

