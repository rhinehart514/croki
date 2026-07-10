# Production Domain Model

## Design rule

The domain model stays small, product-scoped, open, and subordinate to the existing canvas/pipeline grammar.
Add links and projections before records. A canvas object does not earn a new store merely because it is
visible.

## Authority model

### Durable authorities

- **Product / Project** — existing project root and repository identity.
- **Product truth** — existing read-only scan and cited truth records.
- **Product interpretation** — existing founder-editable product model.
- **Crew identity and taste** — existing product roster, teammate souls, run history, and founder learning.
- **Pipeline / graph** — existing open action definition and execution plan.
- **Run / Result / Learning** — existing execution, observed outcome, and durable learning records.
- **Founder gate decisions** — existing gate, feedback, and taste history. Do not create a second general
  decision authority.
- **Founder-owned geometry** — only explicit positions, collapsed groups, pins, and viewport choices that must
  survive reload.

Founder-owned geometry extends the current `objectGraphLayoutStore` into a namespaced project canvas layout:
stable object positions, collapsed groups, pinned crew, and viewport preferences. Keep the existing
object-graph layout API as a backward-compatible namespace/alias; do not create competing layout stores.

### Projections

- teammate presence, activity, and track record;
- open questions not explicitly pinned by the founder;
- relevant crew pods;
- disagreement branches;
- problems and health;
- product implications before a founder accepts, edits, dismisses, or defers them;
- canvas relationships derived from truth, runs, feedback, and outcomes.

Every projected field must name the authoritative record or runtime signal that produced it.

## Canvas anchors and references

The canvas may address product truth, product elements, teammates, pinned questions, pipelines, graph nodes,
gate decisions, artifacts, outcomes, and accepted implications through stable references. References point to
authoritative bodies; they never copy evidence, run output, or outcome content into a parallel canvas store.

Persist a relationship only when it carries founder intent or durable lineage that cannot be recovered from
existing records. Relationship kinds remain open strings. Derived proximity, visual grouping, status, and
focus are not durable domain state.

## Questions

Questions are optional anchors, not a required lifecycle or top-level program.

- Internal or transient questions may remain operator/run artifacts.
- A teammate- or model-opened question remains an attributable operator/run artifact until the founder pins
  it. Pinning is the founder act that creates or promotes the clarity record.
- A founder-pinned question reuses the existing clarity record and stable id, extended additively with
  `status`, `updatedAt`, `participantRefs`, `evidenceRefs`, and `productRefs`.
- Once another durable record references a pinned question, closing or unpinning it archives the clarity
  record instead of deleting its stable id. Existing unreferenced pins may retain the current remove behavior.
- Pipeline/run metadata owns optional `questionId`, `participantRefs`, and `productRefs`. Results inherit
  optional `questionId`, `productRefs`, and a typed reference to the existing feedback/gate decision from the
  joined run. The question does not
  mirror pipeline, result, or decision backlink arrays; the canvas projection reverse-joins them.
- A direct pipeline may exist and run without a question.
- Question completeness, status, or evidence never blocks pre-gate work.

The canvas presentation may show teammate claims, evidence, uncertainty, recommendations, and falsifiers
around a question. That presentation contract does not require an `AgentContribution` store. Prefer
attributable operator events, feedback records, artifacts, and run outputs until a concrete cross-session use
case proves a missing durable owner.

## Founder decisions

Founder calls remain stamped where they occur: a branch choice, feedback edit, accepted proposal, gate
decision, blessed teammate lesson, or accepted implication. Existing feedback/gate/taste records are the
authority. Corrections append; they do not erase the earlier receipt.

Within that existing feedback authority, durable founder calls use an append-only `decisions` partition that
is not subject to the observational `signals` cap. Each receipt carries `id`, `projectId`, `kind`, exact
founder wording or selected value, `contextRefs`, `createdAt`, and optional `supersedesId`. The source gate,
feedback item, implication, branch, or lesson remains the authoritative body; the receipt is its stable audit
and correction index, not a second generic `FounderDecision` store. Compatibility reads may synthesize
receipts from legacy gate results, shared judgments, and qualifying feedback signals by stable source id;
materialization is additive and idempotent, and never deletes the legacy source.

Answering a question is never equivalent to approving execution. Taste may learn from a decision but cannot
invent future authorization.

## Actions

An action is the founder-facing meaning of an existing pipeline, graph, operator drive, or product-shaped
build. It is not a new generic record. Research, product changes, instrumentation, outreach, content,
partnerships, proof artifacts, activation work, and microproducts remain open graph shapes.

## Evidence

Use the existing evidence and citation contracts. Product facts, researched market facts, founder statements,
observed outcomes, inferences, and speculation stay visibly distinct. Store references to evidence rather
than copied evidence bodies.

## Outcomes and implications

Keep the existing Result and Learning system. A joined outcome references the run/item/path that produced it;
an unjoined signal remains explicitly unattributed. Approval or release is never reported as market success.

A product implication begins as a model-owned projection over evidence and outcomes. Persist only the
founder's acceptance, edit, dismissal, or deferral using existing feedback/decision machinery. An accepted
implication may compose a dashed product-change pipeline; it does not mutate code or product truth directly.

The accepted/edited implication body and disposition live as a stable append-only founder-decision receipt
inside the feedback authority, carrying
`sourceOutcomeId`, `productRefs`, `questionId?`, `disposition`, and exact founder wording. Accepted decisions
must not disappear behind the feedback ledger's rolling observational-signal cap.

## Persistence rule

Do not convert the repository to event sourcing or introduce a generic link/knowledge platform. For any new
field or record, state:

- authoritative owner;
- product scope and stable id;
- creation and mutation path;
- provenance and idempotency;
- archival and historical-reference behavior;
- why existing truth, run, feedback, clarity, layout, or result records cannot own it.

Empty new state must be valid. Existing products, pipelines, runs, gates, and teammate history must load
without migration. Historical references survive archival.

## No cross-record lie

Never infer that an action worked because a gate was approved, that a teammate is active without a real
signal, or that a product change caused a response without an attribution path.

## Implementation prompt

```text
Design the smallest record, reference, or projection needed for the canvas behavior.

Start from project-store, flow/run state, gtm-store, feedback-ledger, clarity-store, product-model, operator
events, crew/soul, layout, and outcome records. Prefer projections and references. Do not add GtmQuestion,
AgentContribution, FounderDecision, generic Action, link-platform, program, policy, profile, instance,
foundry, or fixed-stage records without first proving a concrete use case that existing authorities cannot
support. Preserve open kinds, provenance, question optionality, historical reads, and the founder wall.
```
