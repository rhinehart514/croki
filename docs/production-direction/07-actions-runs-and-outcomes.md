# Actions, Runs, and Outcomes

> **SUPERSEDED PACKAGE FILE.** This action/run model is historical. Current work uses bets, forks,
> outcomes, and the wall as defined by [FIRM-SPEC.md](../FIRM-SPEC.md).

## Role of actions

An action is any GTM or product-development move the crew proposes or executes.

The action vocabulary remains open. Examples include:

- research;
- positioning;
- customer conversation;
- content or community;
- partnership;
- outreach;
- in-product activation;
- instrumentation;
- product-generated pages;
- referral loop;
- microproduct;
- code change;
- proof artifact;
- measurement probe.

## Product-shaped GTM

The highest-leverage actions may change the product itself:

- expose a shareable result;
- add a referral or invitation loop;
- make a key activation step observable;
- build a public surface from real product data;
- create a calculator or diagnostic from product logic;
- change onboarding around a market-observed friction;
- add proof where trust blocks adoption.

These actions use the same founder wall as sends, publishes, and deploys.

## Canvas and graph position

Pipelines remain persistent, editable, watchable action hypotheses on the canvas. Their open graphs remain
the execution plans. The sequence below is one possible path through the product, not a fixed journey:

```text
Question or direct request
  → crew judgment
  → selected action
  → model-composed graph
  → run
  → founder gate
  → external/product effect
  → outcome
```

The graph may take any shape and may begin from a direct request, product element, question, signal, or prior
outcome. There is no fixed stage skeleton.

## Measurement

Every measurable action should carry a joinable measurement intent before execution. This remains an
advisory and compile-time concern, not a reason to block an otherwise valid pre-gate run.

Outcomes must distinguish:

- sent or published;
- observed response;
- product activation;
- business outcome;
- founder-entered result;
- unmeasured.

Do not turn approval counts into success metrics.

## Outcome return

Every outcome should be able to return to:

- the action/run;
- the question;
- the relevant product model element;
- the contributing teammates;
- the founder decision that enabled it.

The next crew composition should be able to see what happened without re-reading an unstructured transcript.
On the canvas, a joined outcome returns to the relevant gate or Measure node, illuminates the path that
produced it, and may propose a dashed implication back to the product.

## Repeatable motions

Keep repeatable motions light: cadence, scorekeeping, next-run context, and explicit founder promotion.
Do not create a heavyweight program or campaign lifecycle.

## Implementation prompt

```text
Reframe existing channels/graphs/runs as open GTM/product actions without breaking their current execution
and gate behavior.

Preserve graph openness, gate enforcement, explicit autonomy promotion, real transport readiness, and outcome
joins. Add links from action/run/result back to question, product element, teammate, and founder decision where
available. Keep measurement honest and optional before the gate. Support product-shaped actions such as
in-product loops, public artifacts, instrumentation, and code changes, but never allow composition to forge
authorization. Add end-to-end tests for action → gate → outcome → product implication.
```
