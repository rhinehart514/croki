# Migration, Deletion, and Documentation Hygiene

## Migration principle

This is a production reorientation, not a rewrite. Preserve working behavior while changing the center of
gravity.

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

1. Add read-only product-room projections over existing state.
2. Add question/context links without changing action execution.
3. Promote crew memory and teammate contributions.
4. Add MCP parity.
5. Move UI home from pipeline-first to product/question-first.
6. Make product-shaped actions use the existing action/graph/gate spine.
7. Migrate persisted records only where the new read model proves its value.
8. Remove dead UI and dead docs after browser verification.

## No destructive migration

- never reset the user's working tree;
- never drop existing pipeline/run/outcome data;
- never silently rewrite founder decisions;
- never collapse historical teammate identity;
- never delete current user changes;
- keep legacy reads until the replacement is proven.

## Docs to reconcile

The following historical documents should remain marked historical or be retired after the production target
is accepted:

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

