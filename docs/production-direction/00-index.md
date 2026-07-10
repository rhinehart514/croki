# Drover Production Direction

Status: production target and implementation source of truth for the GTM-for-product-development direction.
Current product stage: alpha; the target described here is not a prototype or a throwaway experiment.

## Mission

Drover is the GTM team inside product development.

It gives a founder a persistent crew of frontier-model teammates that understand the product's code,
the market around it, the founder's judgment, and what has happened over time. The crew helps decide
what to build, why it matters, how it reaches the market, what the product should make easier to adopt,
and what the market teaches next.

The product claim is:

> Drover helps AI coding agents build products people can discover, understand, adopt, and keep using.

## What this package changes

The current product is centered on project → pipeline → graph → run → gate. That execution spine is
valuable, but it is too narrow as the product's primary object.

The production product is centered on:

```text
Product
├── GTM crew
├── Questions
├── Evidence
├── Founder decisions
├── Actions
└── Outcomes
```

Pipelines remain one open action shape. They are not the business object, the user journey, or the
required starting point.

## The thin-host rule

The host owns only what must be durable, deterministic, or enforceable:

- repository and product identity;
- cited product truth and provenance;
- founder-owned crew identity and memory;
- questions and durable links between existing records;
- founder decisions and audit history;
- graph validation and execution;
- the founder gate and autonomy wall;
- outcome and attribution records.

Frontier models own judgment:

- which teammates matter;
- what question matters;
- market research;
- product interpretation;
- disagreement;
- GTM strategy;
- action composition;
- signal interpretation;
- next-move recommendations.

Do not recreate the old program/policy/profile/instance/foundry machinery from
`docs/history/DDD.md`. That DDD is historical and explicitly superseded.

## Existing code to preserve

- `brain/src/scan.mjs` — read-only product truth with file:line evidence.
- `brain/src/product-model-*` — founder-editable interpretation of the product.
- `brain/src/evidence*.mjs` — provenance discipline.
- `brain/src/gtm-store.mjs` — truth, market objects, paths, runs, results, motions, learning.
- `brain/src/graph.mjs` and `brain/src/graph-operations.mjs` — open graph execution and validation.
- `brain/src/crew-roster-store.mjs` — product crew membership.
- `brain/src/teammate-soul-store.mjs` and `brain/src/memory.mjs` — teammate identity and taste learning.
- `brain/src/operator-*` — durable operator sessions and founder gate interaction.
- `brain/src/feedback-ledger.mjs` — feedback capture.
- `brain/src/outcome-ingest.mjs` — outcome return.
- `brain/src/mcp.mjs` and `brain/src/operator-mcp.mjs` — AI-coding entry point.
- the current founder gate, autonomy ladder, and anti-cage tests.

## Reading order

1. `01-mission-and-product-contract.md`
2. `02-current-state-and-disposition.md`
3. `03-thin-host-boundary.md`
4. `04-production-domain-model.md`
5. `05-gtm-crew-and-teammates.md`
6. `06-questions-evidence-and-decisions.md`
7. `07-actions-runs-and-outcomes.md`
8. `08-ai-coding-and-mcp.md`
9. `09-product-room-and-ui.md`
10. `10-runtime-safety-and-autonomy.md`
11. `11-migration-deletion-and-doc-hygiene.md`
12. `12-production-workstreams.md`
13. `13-verification-and-acceptance.md`
14. `14-implementation-prompt-pack.md`
15. `15-file-level-task-map.md`

## Working rule

Every implementation must state which product contract it advances, which wedge dimension it moves,
what existing behavior it preserves, and what machinery it deliberately does not introduce.
