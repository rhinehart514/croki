# Croki Canvas: 0 to 1 Product Spec

Status: Prepared product exploration
Date: July 30, 2026

## How to read this document

This document separates current direction from future possibility:

- The short-term contract restates current Croki canon and defines the Canvas renovation boundary.
- The long-term sections explore 0-to-1 product powers. They are not current canon or an implementation commitment.

The goal is to reason from new founder capabilities, not from a backlog of Canvas features.

## Stable product boundary

Croki remains a coding environment for founders building products with Codex and other coding agents.

The following remain stable:

- Project and repository are the working boundary.
- Threads are the durable spine.
- Providers retain their native behavior.
- T3-native worktrees, checkpoints, Git, files, terminal, preview, plans, recovery, and Review remain the operating environment.
- Canvas is optional and shares the contextual pane with exact coding surfaces.
- `.croki/context.json` is repository-owned product context.
- `current` means founder-approved canon, `provisional` means proposal, and `retired` is omitted from provider context.
- Agents may propose context changes. Only the founder may adopt or retire canon.
- Provider turns fail open when Canvas context is unavailable.
- No archived Brain, Relay, agent runtime, or workflow runtime is revived.

Canvas must extend the existing Croki experience. It must not create another conversation, memory, provider, Review, or worktree system.

## The 0-to-1 thesis

A founder should not need to repeatedly:

1. Reconstruct what the product is and why.
2. Translate market learning into product implications.
3. Translate those implications into agent instructions.
4. Coordinate the resulting work.
5. Reconcile what the work taught them.

The complete loop is:

```text
Current understanding
→ consequential question
→ native agent work
→ inspectable evidence
→ provisional learning
→ founder judgment
→ better current understanding
```

> Canvas is Croki's optional, repository-owned coherence layer between founder judgment and native coding-agent execution.

Threads preserve conversation and work. Canvas makes surrounding structure visible when chronology alone is insufficient.

## Rebuild implementation status

The first renovation slice is implemented in the new Croki/T3 overlay:

- Web, mobile, and provider turns resolve Canvas from the project root.
- Canvas nodes can carry a `product`, `gtm`, `workflow`, or `shared` domain plus explicit provenance.
- Web Canvas has Understanding, GTM, Workflows, and Semantic Review projections over the same repository-owned context.
- Familiar language changes by area: Product intent/decision/evidence/consequence, GTM audience/claim/signal/experiment, and Workflow outcome/gate/result/assignment.
- The node editor no longer exposes authority as an ordinary status field. Adoption, rejection, and retirement remain deliberate founder actions.
- Active workflow work is projected from the current Thread plan, and workflow composition prepares an ordinary native Croki turn.
- Canvas-prepared agent work names the canonical project-root file and explicitly forbids worktree-local context copies.
- Provider context stays bounded and selects relevant whole items for the current turn when the complete active model does not fit.
- Valid canon survives invalid individual nodes or relationships. Partial recovery is visible and requires explicit repair before rewriting the source.
- Every outward activity path, including full HTTP snapshots, retains content-free receipts while removing raw rendered Canvas prompts and replay identifiers.

Still-gated long-term capabilities are not smuggled into this slice:

- No Canvas-owned Run engine, provider runtime, conversation store, memory system, or Review system.
- No reusable workflow-definition or template runtime until native execution lineage is proven.
- No GTM system of record or live connector surface without explicit provenance, permissions, and persistence rules.
- No promise to render or coordinate one hundred agents until native cancellation, recovery, fan-in, and lazy projection pass the scale tests below.

## Three connected domains

Canvas has three distinct domains. They share authority, evidence, and repository scope, but do not need one visual grammar or one giant ontology.

| Domain            | Founder question                                                                   | Important material                                                                                |
| ----------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Product           | What are we building, why, and what does the repository actually express?          | Intent, experience, behavior, architecture, decisions, consequences, implementation evidence      |
| GTM               | Who is this for, what can we truthfully claim, and what is the market teaching us? | Audiences, language, claims, objections, alternatives, market evidence, experiments               |
| Agentic workflows | What coordinated work should investigate or change those things?                   | Outcomes, assignments, dependencies, native Threads, plans, scripts, decisions, expected evidence |

Their uniquely valuable connection is:

```text
Market evidence
→ product interpretation
→ native agent work
→ repository change
→ actual product experience
→ credible product claim
→ market test
```

This is not a company operating system. GTM belongs when it materially affects the product, repository, agent work, or reviewed product-facing output.

## Three live interpretations of Canvas

These should remain separate until real use demonstrates which deserves to be primary.

### Project cognition

Canvas is the project's durable understanding layer.

Proof:

- The founder and agents stop reconstructing the product from old Threads.
- The current question produces the smallest useful source-backed view.
- Product and GTM understanding survive individual conversations without bloating every turn.

Risk:

- Canvas becomes a knowledge-management product the founder must maintain.

### Founder authority

Canvas is where evidence, agent inference, provisional proposals, and founder-approved truth remain distinguishable.

Proof:

- Agent eloquence cannot silently become product truth.
- The founder reviews changed meaning instead of editing storage records.
- Every important claim can explain its origin and supporting evidence.

Risk:

- Product judgment becomes administrative Review.

### Native work choreography

Canvas visually arranges, observes, and reuses work performed by existing Croki Threads, Turns, providers, worktrees, scripts, and Review.

Proof:

- The founder coordinates materially more useful work without acquiring another Run system.
- Every executing unit remains ordinary, inspectable Croki work.
- Returned evidence improves Product or GTM understanding.

Risk:

- A visual coordinator quietly becomes a second workflow runtime.

## Verified current implementation

The current Canvas is much narrower than the earlier standalone product.

### Existing substrate

`packages/shared/src/crokiContext.ts` and `crokiContextValidation.ts` define:

- One file at `.croki/context.json`.
- Four node kinds: `intent`, `decision`, `evidence`, and `work`.
- Three authority states: `current`, `provisional`, and `retired`.
- Relationships and portable file or HTTP(S) references.
- A 256 KiB source limit.
- At most 200 nodes, 400 relationships, and 20 references per node.
- A 12,000-character rendered provider-context limit.
- Content-free provider receipts.

`apps/server/src/orchestration/Layers/CrokiContext.ts` and `ProviderCommandReactor.ts`:

- Load Canvas at the generic provider boundary.
- Preserve native provider behavior.
- Prioritize current canon, separate provisional suggestions, and omit retired context.
- Prepend active Canvas context to every supported turn up to the render limit.
- Leave the stored user message unchanged.
- Fail open when context is missing or invalid.

`apps/web/src/components/croki/` provides:

- Optional Understanding, GTM, Workflows, and Semantic Review projections.
- Compare-and-write saves through the existing project-file RPC.
- Recovery of unsaved drafts.
- Partial and malformed-file repair plus external-change conflict handling.
- Provisional evidence capture from coding surfaces.
- Normal Thread prompts for repository bootstrap and Canvas updates.

Mobile presents the same context read-only.

### What does not exist

There is no Canvas workflow-definition runtime, workflow execution engine, GTM operations system, journey engine, scheduler, dependency engine, fan-in, retry policy, or Canvas-specific Run.

A Canvas rebuild is therefore a rebuild of its product model, projections, and interaction. It is not a renovation of an existing workflow engine.

## Integrity work completed in this rebuild

### One source scope

Server injection, web editing, and mobile presentation now resolve project-root `.croki/context.json`. If branch-aware context is later desired, it must become an explicit product decision.

### No raw prompt exposure

The rendered Canvas prompt remains internal for idempotent replay. Outward `croki.context.applied` activities now project only the message id and content-free receipt.

### Local failure boundaries

Strict validation still governs saves. On reads, independently valid nodes and relationships are recovered from a valid envelope, invalid entries are omitted visibly, and source repair requires explicit confirmation. A malformed envelope still fails open without entering provider context.

## Short-term Canvas contract

### Purpose

Canvas exists to answer:

1. What Product or GTM understanding should guide this repository?
2. What changed because of the work or evidence in front of me?
3. What requires founder judgment before agents should treat it as canon?
4. What native work could investigate or change the current question?

If a capability does not answer one of these questions, it should not be primary Canvas chrome.

### Source and authority

- `.croki/context.json` remains the only durable Canvas source in the short term.
- Git remains history and reconciliation.
- Canvas has no parallel database, event store, or sync system.
- Agent-authored changes remain provisional.
- Founder adoption records the founder's current perspective. It does not make an inference objectively true.
- `work` means a consequential obligation or unresolved consequence. It is not ordinary Run state or a task list.

### Presentation

Canvas should stop asking the founder to operate its storage schema.

The same context may support several familiar projections:

- Current understanding
- Current versus provisional comparison
- Claim and evidence field
- Product consequence trace
- Product experience or journey
- System or dependency view
- Product and GTM tension
- Founder lineage
- Native plan or work constellation

The active question determines the projection. The visual arrangement is not automatically canonical.

Generated structure for founder judgment should be the default. Blank graph authoring should not be.

### Epistemic behavior

Every consequential statement should be able to answer:

- Where did this come from?
- Is it repository observation, outside evidence, agent inference, founder belief, or proposal?
- What supports or contradicts it?
- When did it change?
- What would adoption change for future agents?

This detail should be inspectable without becoming permanent badge chrome.

### Context behavior

These must remain different:

```text
Durable repository understanding
≠ current Canvas projection
≠ context supplied to one provider turn
```

Canvas may know more than it shows. It may show more than one agent needs.

The 12,000-character cap is a protection, not a context-selection strategy. Prompt budget must not expand to match stored context.

### Native work behavior

In the short term, Canvas may:

- Make one native Thread plan spatially legible.
- Turn a scoped outcome into a normal Thread assignment.
- Group existing Threads around an outcome.
- Relate native work, decisions, and returned evidence.
- Prepare a normal Thread request.
- Return to the exact Thread, file, diff, preview, plan, or Review.

Canvas may not claim to:

- Schedule dependent work.
- Own provider concurrency.
- Own running, waiting, retry, recovery, or completion state.
- Create a second Run identity.
- Hide a supervisory agent.
- Authorize outward actions.

## Full possibility space

The following are independent axes. A projection choice does not require a storage or workflow-runtime choice.

### Durable model

| Option                                     | Upside                                                     | Risk                                                             |
| ------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| One compact context file                   | Portable, inspectable, simple, Git-native                  | Aggregate validation, merge pressure, limited scale              |
| Typed sections in one file                 | Stronger Product and GTM validation                        | Universal schema hardens too early                               |
| Manifest plus bounded repository documents | Local failures, lower merge pressure, just-in-time loading | More files, migrations, and knowledge gardening                  |
| Typed proposal patch log                   | Semantic Review, origin, partial failure, conflict clarity | Can grow into a second event system                              |
| Derived project index plus founder canon   | Fresher implementation evidence, less maintenance          | Derived observations can appear more authoritative than they are |

### Visual projection

| Option                                         | Upside                           | Risk                                            |
| ---------------------------------------------- | -------------------------------- | ----------------------------------------------- |
| Faithful record view                           | Maximum trust and repairability  | Weak thinking experience                        |
| Small fixed set of familiar views              | Stable and learnable             | Accumulates modes and special cases             |
| Question-shaped adaptive view                  | Low ceremony, relevant structure | Opaque relevance and visual instability         |
| Generated diagram or mini-surface              | Flexible and fast to discover    | Security, schema failure, disposable UI slop    |
| Infinite canvas                                | Strong freeform exploration      | Manual gardening and a second workspace         |
| Contextual inspector plus Semantic Review only | Maximum product focus            | May underpower broad comparison and composition |

### Provider context

| Option                                           | Upside                                                                  | Risk                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------- |
| Broadcast all active context                     | Predictable and deterministic                                           | Today's bloat, truncation bias, stale assumptions |
| Founder-pinned context                           | Maximum control                                                         | Manual prompt assembly                            |
| Deterministic scope from focus and relationships | Inspectable and testable                                                | Semantic relevance exceeds graph proximity        |
| Model-ranked selection within a budget           | Flexible and compact                                                    | Invisible important omissions                     |
| Just-in-time context tools                       | Progressive disclosure, small initial brief                             | Slower and dependent on good agent retrieval      |
| Layered hybrid                                   | Balances invariants, Thread continuity, focus, relevance, and retrieval | Inclusion logic becomes a product surface         |

Any selective approach needs an inspectable receipt that explains scope without exposing raw Canvas bodies.

### Epistemic model

| Option                               | Upside                                     | Risk                                        |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------- |
| Authority status only                | Simple and already implemented             | Origin and evidence remain weak             |
| Explicit origin and provenance       | Better trust and lineage                   | Schema and migration cost                   |
| Semantic diff                        | Review changed meaning rather than records | Can imply false objectivity                 |
| Durable tensions and counterfactuals | Preserves non-convergent thinking          | Speculative theater or endless indecision   |
| Numeric confidence                   | Easy to render                             | False precision without calibrated measures |

Numeric confidence should remain rejected unless a real calibrated measure exists.

### GTM input

| Option                                           | Upside                                       | Risk                                                  |
| ------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------- |
| Explicit file and URL evidence                   | Portable and reviewable                      | Manual                                                |
| Native agent research returned as proposals      | Flexible and coding-native                   | Source quality and freshness vary                     |
| Repository-local interviews, tests, and research | Durable and inspectable                      | Sensitive or noisy material enters Git                |
| Bounded imports and attachments                  | Evidence without replacing the source system | Import and redaction complexity                       |
| Live external connectors                         | Current market and customer evidence         | Permissions, provenance, freshness, and context bloat |

External systems should remain their own systems of record.

### Agentic workflows

| Option                             | New power                                                          | Boundary                                                         |
| ---------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Native plan visualization          | See one Thread's plan                                              | Low coordination power                                           |
| One-time assignment                | Turn an outcome into one native Thread                             | Correct baseline for ordinary work                               |
| Thread constellation               | Group native Threads with founder-managed dependencies             | Canvas does not claim automation                                 |
| Promote history into a template    | Reuse a proven method without blank authoring                      | Strip stale project assumptions                                  |
| Project-local workflow definition  | Materialize fresh native Threads from versioned structure          | Definition, invocation, step, and Thread identities are required |
| Thin native coordinator            | Dispatch normal Thread and Turn commands and derive their state    | Scheduling and recovery are still real runtime responsibility    |
| Wait for upstream T3 orchestration | Compose stable native primitives later                             | Central founder need remains unsolved meanwhile                  |
| Canvas-owned workflow engine       | Triggers, waits, supervisors, retries, independent execution state | Violates the current product boundary                            |

There is a real unresolved fork:

- Defer executable workflows until T3 owns the primitives.
- Allow a thin Croki coordinator inside existing orchestration, provided every step remains a native Thread or Turn and no competing conversation, memory, Review, provider, worktree, or recovery system is created.

This must remain explicit rather than being hidden behind the phrase "ordinary Croki Runs."

## 0-to-1 capability thresholds

These are proofs, not a feature sequence.

### Product

Given one consequential question, Croki presents the smallest source-backed understanding needed to reason about it, preserves epistemic differences, and keeps new interpretation provisional until founder adoption.

If the founder must search several Threads and restate the product manually, Product has not crossed 0 to 1.

### GTM

One real outside-world signal can be connected to the audience assumption or product claim it supports or challenges, with a visible product or work consequence.

If GTM remains a detached note or causes an untraceable product change, GTM has not crossed 0 to 1.

### Agentic workflow

One small multi-agent effort can be understood as assignments over ordinary Croki work. Every executing unit remains independently inspectable, steerable, recoverable, and reviewable.

If Canvas invents another kind of Run or cannot reconcile its state with native Thread state, workflows have not crossed 0 to 1.

### Combined

The complete loop happens once:

```text
Product or GTM uncertainty
→ bounded native work
→ returned evidence
→ provisional change in understanding
→ explicit founder judgment
```

This loop matters more than broad coverage in any one domain.

## Long-term product powers

### Semantic Review

The founder reviews what the product now means, not just what code changed.

Requires:

- Typed provisional change
- Exact origin and evidence
- Visible effect on future agent context

### Living product mirror

Croki reconstructs a question-shaped account of product intent, actual behavior, decisions, evidence, and unresolved tension.

Requires:

- Adaptive projections
- Stable identities
- Direct return to exact sources

The founder judges a mirror. They do not maintain a complete model.

### Product and GTM integrity

Croki exposes where market narrative, founder belief, and implemented product no longer agree.

Requires:

- Claims
- Market evidence
- Product behavior
- Contradiction and consequence

Canvas remains limited to information that affects the product, repository, or reviewed outward output.

### Context compiler

Rich visible understanding becomes a small, justified brief for each native agent.

Requires:

- Bounded selection
- Provenance
- Inspectable receipts
- Just-in-time source access

Larger prompts are not the solution.

### Native work choreography

One founder question becomes the smallest useful arrangement of native work with responsibilities, dependencies, expected evidence, and exact inspection.

Requires:

- Stable assignment-to-Thread lineage
- Native state projection
- Explicit authority boundaries

Canvas never creates a competing Run or Review system.

### Delegation memory

Successful real work becomes a reusable method without requiring upfront workflow authoring.

Requires:

- Promotion from history
- Versioning
- Project-context stripping
- Drift inspection before reuse

### Founder lineage

The founder can see how product judgment evolved and what evidence changed it.

Requires:

- Explicit authority transitions linked to Git and originating work

Croki must leave unrecorded rationale unknown rather than inventing a coherent story.

### Exception governance

As delegated work grows, the founder sees consequential disagreement, failure, missing evidence, and required judgment rather than agent motion.

Requires:

- Hierarchical outcomes
- Bounded result contracts
- Contradiction-preserving synthesis
- Exact descent
- Trustworthy native orchestration

One hundred visible agents is a product failure, not a scale milestone.

## Compounding loops

### Coherence

```text
Better understanding
→ higher-signal agent context
→ more aligned work
→ clearer evidence
→ better understanding
```

### Product and GTM

```text
Product intent constrains credible claims
→ market response tests those claims
→ evidence changes product understanding
→ the product becomes more credible
```

### Understanding and workflows

```text
Visible uncertainty identifies useful work
→ coordinated native work creates evidence
→ evidence sharpens uncertainty
→ future delegation becomes more precise
```

### Founder leverage

```text
Founder judgment becomes durable
→ agents inherit more coherent premises
→ less supervision is required
→ the founder examines higher-order questions
→ stronger judgment becomes durable
```

The compounding asset is the quality of shared premises and the decreasing coordination required per consequential result.

## Scalability tests

| Scale                     | Product must feel like                                                      | Technical proof                                                                               |
| ------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| One agent                 | Canvas often stays closed; direct coding remains direct                     | One source scope, local failure, content-free receipts, explicit authority                    |
| Two to ten agents         | Outcomes, dependencies, contradictions, and decisions, not ten full Threads | Narrow context, deterministic lineage, concurrent proposal safety, isolated failure           |
| Ten to one hundred agents | Exception governance with exact descent                                     | Native concurrency, cancellation, retry, recovery, fan-in, idempotent resume, lazy projection |

At large context scale:

- Human-visible understanding may exceed provider context.
- Provider context may differ by task while preserving shared canon.
- The founder can inspect why a premise was included or omitted.
- Missing or invalid material degrades locally.
- More evidence sharpens fewer durable statements instead of creating unlimited nodes.
- Prompt cost grows with task relevance, not total project knowledge.

Until the native runtime passes the execution tests, one hundred agents is an exploration constraint rather than a promised Canvas capability.

## Scope gates

| Expansion                   | Gate                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| New Product or GTM schema   | Add a durable concept only after repeated real questions cannot be projected from the current substrate |
| Adaptive views              | Preserve authority, provenance, stable identity, correction, and exact return to source                 |
| Semantic retrieval          | Exhaust and evaluate deterministic selection first; retrieved inference never gains canon authority     |
| Executable workflows        | First prove one-time assignment, native plan visualization, and multi-Thread lineage                    |
| Thin coordinator            | Add no provider, conversation, worktree, memory, Review, or recovery system                             |
| GTM connectors              | Make permission, provenance, freshness, redaction, and repository persistence explicit                  |
| Portable templates          | Remove source-project context and expose assumptions before reuse                                       |
| Generated Canvas extensions | Solve sandboxing, capabilities, persistence, authority, validation, and partial failure                 |

## Important unresolved forks

1. Is Canvas primarily project cognition, founder authority, or work choreography?
2. Are Product, GTM, and workflows separate bounded models or projections over a shared substrate?
3. Does context remain one curated file or become a manifest over bounded repository documents?
4. Is the durable model founder-authored, agent-proposed, or partially derived?
5. Should future branch or worktree views remain derived projections, or can they propose changes back to project-root canon without creating competing truth?
6. How is provider context selected once canon exceeds useful prompt size?
7. Which repository-derived observations may refresh automatically?
8. How much GTM evidence belongs in Git?
9. Should Canvas use fixed views, adaptive projections, generated mini-apps, or a combination?
10. Does executable workflow composition wait for upstream T3, or can Croki own a thin native coordinator?
11. What is workflow completion: finished work, accepted Review, returned evidence, or adopted understanding?
12. When should Croki preserve competing interpretations, and how does it learn the founder's convergence signals?

## Research precedents

The research clarifies available patterns without determining Croki's design.

- [GitHub Copilot Canvas Extensions](https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions) demonstrate generated, bidirectional right-panel mini-apps with project-local capabilities and persisted artifacts. They validate Canvas as a shared work surface and show how quickly it can become an extension platform.
- [GitHub's Canvas examples](https://github.blog/ai-and-ml/github-copilot/how-to-build-interactive-experiences-with-canvases/) include project diagrams, worktree views, triage, and prompt analysis. Their breadth supports adaptive surfaces, not universal Canvas scope.
- [tldraw's AI patterns](https://tldraw.dev/docs/ai) separate Canvas as output, visual workflow programming, and agent-controlled Canvas. Croki should choose the user power before choosing an infinite-canvas implementation.
- [JSON Canvas](https://jsoncanvas.org/) demonstrates portable, readable spatial interchange. Interchange should not dictate Croki's semantic model.
- [VS Code subagents](https://code.visualstudio.com/docs/agents/subagents) isolate focused work and return condensed results while keeping detailed execution inspectable.
- [Anthropic's context-engineering guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) argues for the smallest high-signal context, just-in-time retrieval, compaction, and isolated subagents.
- [OpenAI's harness-engineering account](https://openai.com/index/harness-engineering/) reports that a giant instruction file crowds out the task and recommends a navigable map over an exhaustive manual.

## Strongest uniquely Croki upside

Most product tools are detached from code. Most coding-agent environments are detached from durable Product and GTM judgment. Most visual workflow products hide execution behind their own runtime.

Croki can connect:

```text
Founder intent
↔ Product and GTM understanding
↔ repository truth
↔ native provider work
↔ exact code and Review
↔ returned evidence
```

The durable advantage is not a prettier graph or a generic visual workflow builder.

> Croki can let a founder preserve product-market coherence while delegated product-building work grows beyond what they could manually coordinate.

That is substantially larger than today's Canvas while remaining narrower and more defensible than a company operating system.
