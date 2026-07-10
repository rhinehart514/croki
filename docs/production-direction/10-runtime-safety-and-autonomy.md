# Runtime Safety and Autonomy

## Unchanged wall

Every action that reaches the outside world or changes durable product state in an irreversible way must carry
a real founder authorization. Composition cannot forge authorization. A model cannot approve its own action.

The wall applies to:

- sends;
- publishes;
- deploys;
- charges;
- external writes through MCP;
- product/code changes that the host applies or ships;
- promotion to trusted/autonomous execution.

## Free before the wall

The model may freely:

- inspect;
- research;
- interpret;
- generate hypotheses;
- ask teammates;
- compare options;
- draft;
- propose graph changes;
- stage reversible previews.

These activities must not be blocked by a missing measurement field, incomplete question, or absent optional
context. Contracts remain advisory before the gate.

A dashed product implication or graph proposal is still a hypothesis and reversible preview. It may be
generated freely. Applying, committing, publishing, deploying, or otherwise making its product/code effect
durable requires the appropriate founder authorization.

## Autonomy

Autonomy is explicit founder promotion only.

- composition never grants autonomy;
- a run never grants autonomy;
- a teammate never grants itself autonomy;
- trusted/autonomous patterns remain revocable;
- exceptions still escalate;
- every promotion is auditable.

## Product-shaped actions

An in-repo change or microproduct action must show:

- the intended product change;
- files or artifact scope;
- product/GTM rationale;
- evidence and assumptions;
- preview/diff;
- measurement or outcome plan;
- explicit founder authorization;
- rollback or review path.

Two runtime paths stay distinct:

- **Ordinary in-repo product-change pipeline:** may create an isolated branch/worktree and a founder-reviewed
  diff, but stops before commit, push, PR, merge, deploy, or publish. Each later effect requires its own
  explicit authority according to repository doctrine.
- **Gated microproduct deployment:** may deploy only through the existing exceptional path with gate approval
  plus a separate explicit deploy confirmation. Composition and ordinary code-change approval cannot supply
  either authorization.

## Failure behavior

- model errors are transient and visible as such;
- code failures are self-inflicted and captured;
- a stalled session is recoverable;
- a missing connector is an honest readiness problem;
- a failed outcome is not converted into a success metric;
- no raw engine or prompt error reaches the founder without translation.
- when several gates wait, only one review may seize focus; every other gate remains visible at its real
  canvas position and no duplicate review implementation is created.

## Implementation prompt

```text
Review every new runtime path through the three rails: truth, wall, taste.

Prove that composition cannot forge approval, autonomy, deploy authorization, or external write permission.
Keep pre-gate work open and non-blocking. Add explicit founder review for durable product/code mutations.
Preserve recovery, failure classification, idempotency, project scoping, and auditability. Extend anti-cage and
gate-wall tests before adding new runtime behavior.
```
