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

Fixed product grammar: one woven canvas, persistent embodied teammates, open pipelines/graphs, and the
founder gate. Enrich this grammar with product truth, optional questions, evidence, decisions, outcomes, and
product implications. Do not replace it with a dashboard, question-page hierarchy, or parallel product shell.

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

Use Product/Project as the root and the existing canvas as its projection. Start from product truth, clarity
pins, operator/run artifacts, crew/soul, feedback, pipelines, results, learning, and founder-owned layout.
Add references and projections before records. Keep questions optional and advisory. Do not introduce
GtmQuestion, AgentContribution, FounderDecision, generic Action, program/policy/profile/instance/foundry, or
link-platform records without proving a concrete use case existing authorities cannot support. Prove project
isolation, lineage, no-fabrication, backward compatibility, and outcome attribution with tests.
```

## Crew prompt

```text
Promote the existing agent roster and souls into a durable product-level GTM crew.

Teammates persist across questions and actions. Add only the contribution/context links necessary for each
teammate to show beliefs, evidence, uncertainty, recommendations, founder-taught lessons, and outcomes.
Preserve distinct identities and disagreement. Keep role vocabulary open. Do not create a pipeline-local
agent factory, policy store, evaluation engine, or mandatory crew sequence. Embody the persistent crew at the
canvas perimeter and on the work they own; use an anchored teammate sidecar with honest empty states and no
raw prompt/soul internals.
```

## Operator/MCP prompt

```text
Extend the operator and MCP surface so the AI coding session can focus and work with the same product, crew,
question, evidence, pipeline, decision, and outcome references as the canvas.

Preserve direct compose/run capability and the founder wall. Add inspect/ask/record/propose capabilities only
where they are backed by durable state. The model may reason and compose; the host validates, persists, scopes,
and gates. Update the naked tool set so the operator can understand and ask teammates before composing an
action. Add tool-schema, route, project-scope, wall, read-only, and no-raw-machinery tests.
```

## Canvas-enrichment UI prompt

```text
Enrich the existing woven canvas with product, question, and action altitudes plus focus-to-trace. Product
truth remains the source landmark; persistent teammates remain visible around the canvas and on the work they
own; disagreement remains separate evidence branches; pipelines remain the action grammar; the single gate
opens at its position; outcomes return toward the product and may stage dashed implications. Do not build a
product-room dashboard, separate question pages, duplicate gate review, decorative avatars, or extra named
canvas modes. Browser-verify the complete canvas → crew → question/disagreement → pipeline → gate → outcome
return at desktop, keyboard-only, and narrow widths.
```

## Product-shaped GTM action prompt

```text
Extend the action path so GTM can change or expose the product itself: activation, instrumentation, referral,
public product surfaces, data-backed pages, calculators, proof artifacts, microproducts, or code changes.

Reuse the open graph and existing gate, artifact-preview, and deploy protections. Show the proposed product
effect, evidence, measurement intent, preview/diff, authorization, and rollback/review path. An ordinary
in-repo pipeline may create an isolated worktree and reviewed diff but must stop before commit, push, PR,
merge, publish, or deploy. The exceptional microproduct deploy still requires gate approval plus a separate
deploy confirmation. A question answer, accepted implication, or ordinary product-change approval supplies
neither gate release nor deploy authorization. Composition must never forge either authorization. Return
outcomes to the original pinned question when present, teammates, product model, and coding context.
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
