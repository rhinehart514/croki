# Migration, Deletion, and Documentation Hygiene

## Migration principle

This is a production enrichment, not a rewrite or replacement shell. Preserve the canvas, pipeline/run/gate
loop, persistent teammates, and historical data while making the product-to-market loop legible in the same
coordinate space.

## Compatibility mapping

| Current concept | Production meaning |
| --- | --- |
| Project | Product/repository root |
| Channel/pipeline | One open GTM/product action |
| Graph | Action execution plan |
| Operator session | Durable crew conversation or action drive |
| Crew roster | Product-level GTM team |
| Teammate soul | Product-specific agent identity and learned taste |
| Product model | Founder-editable product interpretation |
| ProductTruth/MarketObject | Evidence-backed product and market context |
| Run/Result/Learning | Action execution, observed outcome, and durable learning |
| Feedback ledger | Founder and market signal source |

Keep historical identifiers where changing them would create risk. Translate them in the product and docs.

## Migration order

1. Assemble a read-only product/canvas projection over existing state.
2. Enrich the existing woven canvas with product, question, crew, decision, and outcome references.
3. Add only the minimal durable links whose cross-session behavior cannot be derived.
4. Add teammate disagreement and focus-to-trace without contribution/profile machinery.
5. Make product-shaped pipelines use the existing graph/gate spine.
6. Return outcomes and proposed implications across the same canvas.
7. Add MCP parity over stable canvas references.
8. Migrate persisted records only where a concrete projection has failed.
9. Remove dead UI and docs after browser verification.

## No destructive migration

- never reset the user's working tree;
- never drop existing pipeline/run/outcome data;
- never silently rewrite founder decisions;
- never collapse historical teammate identity;
- never delete current user changes;
- keep legacy reads until the replacement is proven.
- treat empty new state or missing enrichment as valid; the existing canvas/run/gate loop must remain
  runnable throughout rollout and rollback.
- verify a pre-enrichment fixture can load with no new fields, retain unknown or archived references without
  crashing, and round-trip through the compatibility reader without rewriting its historical records;
- preserve founder geometry across refresh and rollback through the existing object-graph layout namespace.

## Docs to reconcile

The following historical documents should remain marked historical or be retired after the production target
is accepted. Do not remove `docs/GOAL.md` or `docs/CANVAS.md` while current `AGENTS.md` or another current doc
still points to them; replace those pointers and preserve any still-authoritative invariants first.

- `docs/history/DDD.md`;
- `docs/GOAL.md`;
- `docs/MODEL.md`;
- `docs/PRODUCT-MODEL.md`;
- `docs/PRODUCT-SPEC.md`;
- `docs/CANVAS.md`;
- `docs/EXPERIENCE.md`;
- earlier build plans that describe programs, policies, foundries, or fixed canvas modes.

Update `docs/STATE.md` only when behavior has actually landed. Do not make the state file claim that the
production direction is validated before a real founder drives it.

## Implementation prompt

```text
Plan a behavior-preserving migration from the current project/channel/graph/operator/crew stores to the
production direction. Use read-model projections before destructive schema changes. Preserve all current
runs, outcomes, founder decisions, teammate memories, and user working-tree changes. Mark old DDD machinery
historical; do not recreate it. Add migration tests, fixture round trips, backward-compatible reads, and a
rollback note for every persisted-shape change.
```
