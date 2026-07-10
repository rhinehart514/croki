# Implementation Prompt Pack

These prompts are copy-pasteable work orders for future coding agents. Each agent must read the relevant
production-direction files and the repository instructions before acting.

## Master prompt

```text
You are implementing Drover, an alpha product whose production direction is defined in
docs/production-direction/00-index.md through 13-verification-and-acceptance.md.

Mission: make Drover a GTM-native product-development system with a persistent product-scoped crew of
frontier-model teammates. The crew helps decide what to build, why it matters, how it reaches the market,
what product-shaped GTM actions are worth taking, and what outcomes teach us next.

The host is intentionally thin. It owns truth, the founder wall, taste memory, deterministic persistence,
identity, graph validation/execution, and outcome attribution. Frontier models own market/product judgment,
research, interpretation, disagreement, composition, and next-move recommendations.

Read AGENTS.md and the full production-direction package before editing.

Hard bans:
- do not recreate OutcomeProgram, AgentCreationPolicy, PersonalizationProfile, AgentInstance,
  CapabilityFoundry, or a similar policy/instance/foundry layer;
- do not add a fixed GTM stage skeleton or closed GTM taxonomy;
- do not make a question/program/measurement contract a mandatory pre-run gate;
- do not add host-side fuzzy strategy, scoring, or “best GTM move” authority;
- do not bypass or weaken the founder wall;
- do not overwrite or discard current user changes;
- do not claim validation that has not happened.

Before changing code, provide:
1. the user-visible capability;
2. the current code paths and records it preserves;
3. the thin-host boundary classification;
4. the wedge dimension advanced;
5. the explicit deletion/non-scope list;
6. the tests and browser flow you will run.

Then implement the smallest production-complete change, test it, browser-verify it where relevant, and report
facts, inferences, failures, and remaining risks separately.
```

## Domain model prompt

```text
Implement the production domain adjustment.

Use Product/Project as the root. Add only a thin product-scoped GTM question/context layer and contribution
links over existing product truth, market objects, crew/soul, feedback, action/run, result, and learning
records. Keep questions optional and advisory. Preserve open vocabularies and provenance. Do not introduce
program/policy/profile/instance/foundry objects. Prove project isolation, lineage, no-fabrication, backward
compatibility, and outcome attribution with tests.
```

## Crew prompt

```text
Promote the existing agent roster and souls into a durable product-level GTM crew.

Teammates persist across questions and actions. Add only the contribution/context links necessary for each
teammate to show beliefs, evidence, uncertainty, recommendations, founder-taught lessons, and outcomes.
Preserve distinct identities and disagreement. Keep role vocabulary open. Do not create a pipeline-local
agent factory, policy store, evaluation engine, or mandatory crew sequence. Update profiles, crew room, and
relevant-pod surfaces with honest empty states and no raw prompt/soul internals.
```

## Operator/MCP prompt

```text
Extend the operator and MCP surface so the AI coding session can work with the same product, crew, question,
evidence, decision, action, and outcome records as the UI.

Preserve direct compose/run capability and the founder wall. Add inspect/ask/record/propose capabilities only
where they are backed by durable state. The model may reason and compose; the host validates, persists, scopes,
and gates. Update the naked tool set so the operator can understand and ask teammates before composing an
action. Add tool-schema, route, project-scope, wall, read-only, and no-raw-machinery tests.
```

## Product-room UI prompt

```text
Reorient the default Drover workspace around one product, its GTM crew, open questions, evidence, decisions,
actions, and outcomes. The graph/canvas remains the focused execution surface for an action. Do not build a
generic dashboard or add more lenses. Use real current data, clear scope, honest empty/loading/error/partial
states, accessible keyboard behavior, and the existing visual system. Preserve teammate identity and the
founder gate. Browser-verify the full question → crew → action → gate → outcome flow.
```

## Product-shaped GTM action prompt

```text
Extend the action path so GTM can change or expose the product itself: activation, instrumentation, referral,
public product surfaces, data-backed pages, calculators, proof artifacts, microproducts, or code changes.

Reuse the open graph and existing gate/delta/deploy protections. Show the proposed product effect, evidence,
measurement intent, preview/diff, authorization, and rollback/review path. Composition must never forge the
authorization. Return outcomes to the original question, teammates, product model, and coding context.
```

## Migration prompt

```text
Perform a behavior-preserving migration. Keep project/channel/graph/run persistence and historical identifiers
where needed. Add projections before schema rewrites. Preserve all founder decisions, teammate memories,
outcomes, and current working-tree changes. Mark docs/history/DDD.md and old program/foundry docs historical;
do not recreate their objects. Add fixture round trips and rollback notes.
```

## Verification prompt

```text
Verify the production direction end to end.

Prove grounded product truth, persistent crew memory, question optionality, preserved disagreement, open action
composition, founder-gated external/product changes, real outcome return, coding-session parity, and honest
unmeasured states. Run backend tests, UI tests, lint, build, and browser verification. Check the anti-cage and
gate-wall invariants. Report any environment or pre-existing failure separately from regressions.
```

