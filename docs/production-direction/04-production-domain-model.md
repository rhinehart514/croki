# Production Domain Model

## Design rule

The domain model should be small, product-scoped, and open. It should connect records without forcing the
founder through a prescribed GTM journey.

## Core records

### Product / Project

Existing project root. Owns the repository, product context, crew, and all product-scoped GTM records.

### GTM Crew

The persistent product-level roster. Reuses `crew-roster-store.mjs`, `teammate-soul-store.mjs`, and memory.

Minimum durable facts:

- teammate reference and origin;
- product association;
- founder name/role override;
- soul/stance/voice;
- track record;
- learned founder guidance;
- questions and actions contributed to.

### GTM Question

A thin durable context record, not a program and not a required pre-run object.

```text
GtmQuestion {
  id
  projectId
  question                 // open plain-language question
  summary                  // current model-generated readout; never authoritative truth
  status                   // minimal record lifecycle; not a GTM stage skeleton
  participantRefs[]
  evidenceRefs[]
  decisionRefs[]
  actionRefs[]
  outcomeRefs[]
  productRefs[]            // model/product elements or code references
  unknowns[]
  createdAt
  updatedAt
}
```

Use this as a linkable context layer. A question may be created by a founder, agent, signal, or action. It
may be absent when a founder directly requests a run.

### Evidence

Use the existing evidence contract for:

- repository truth;
- researched market facts;
- founder-stated information;
- observed outcomes;
- inferred interpretations;
- speculative hypotheses.

Evidence is the source of trust, not a score engine.

### Agent Contribution

Use a thin record or append-only contribution projection:

```text
AgentContribution {
  id
  projectId
  questionId?
  agentRef
  statement
  evidenceRefs[]
  confidence?
  unknowns[]
  recommendation?
  actionRefs[]
  createdAt
}
```

The host stores attribution and provenance. The model writes the judgment.

### Founder Decision

Use the existing gate/feedback/taste machinery and extend its projection to question and product context.

```text
FounderDecision {
  id
  projectId
  questionId?
  agentRef?
  actionRef?
  decision              // open founder language plus normalized audit kind
  editedFields[]
  reason?
  createdAt
}
```

### Action

An open product/GTM move. Existing GTM paths, graphs, and operator sessions project here.

Examples: research, product change, instrumentation, outreach, content, partner motion, microproduct,
activation change, proof artifact, or code task.

### Run / Outcome / Learning

Keep `Run`, `Result`, `RepeatableMotion`, and `Learning` from `gtm-store.mjs` where useful. Add links to
question, product elements, teammates, and founder decisions. Do not create a second result system.

## Persistence rule

Do not convert the entire repository to event sourcing. Use existing atomic stores and domain events where
lineage or auditability is already required. A new question/contribution layer may begin as a thin store or
projection over existing records. Add event types only when rebuildability is genuinely load-bearing.

## No cross-record lie

Never infer that an action worked because a gate was approved. A market outcome must be observed and joined.
Never infer that a product change caused a market response without an explicit attribution path.

## Implementation prompt

```text
Design the smallest durable record/projection needed for this product behavior.

Start from existing project-store, gtm-store, feedback-ledger, product-model, operator-session, and soul
records. Show the read/write owner for every field. Keep question/context records advisory and optional. Do
not introduce OutcomeProgram, AgentCreationPolicy, PersonalizationProfile, AgentInstance, CapabilityFoundry,
or a fixed GTM stage machine. Preserve open kinds and provenance. Add round-trip tests, project isolation
tests, and a no-fabrication test for every new read model.
```

