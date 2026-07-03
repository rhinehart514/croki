# 01 — Object Graph (data model)

**Binding doctrine:** `00-DOCTRINE.md`. Siblings: `02-canvas-interaction` (projection/UI), `03-intelligence` (spray, edge inference, weakness detection, repair generation), `04-runs-and-wall` (compile, gate behavior, outcome ingestion), `05-migration` (what folds, what code carries over).

```
Cold open:    prefilled graph, strongest current testable path highlighted
              (exactly one lit in phase 1), weak links marked.
First spray:  broad and shallow across signals, market, product gaps, offers,
              channels, messages, proof, measurement gaps.
Run altitude: founder compiles a whole path; Drover decomposes it into tasks,
              assets, patches, gates, and measurement.
Gate:         visible inline checkpoint on outward/action edges, backed by
              action-level approval objects.
Scope:        write the north-star, mark the phase-1 slice — scan → spray →
              graph → highlighted path → inspect weakness → compile run →
              gate → staged execution → measurement contract.
```

This spec defines the **data model only**: node domains and types, the node schema, the twelve typed edges, cross-domain reference patterns, promotion transitions, and the evidence + weakness representation. It says nothing about how the graph is drawn (02), how it is populated or diagnosed (03), or how a path executes (04).

---

## 0. Where this sits relative to existing code

Two graphs coexist. Do not conflate them.

| Layer | What it is | Store | Status under this spec |
|---|---|---|---|
| **Object graph** (this spec) | GTM knowledge: market beliefs, strategy, audience, assets, paths, outcomes, learning — the canvas the founder sees | **new**: `object-graph-store.mjs` (persistence() spine, same pattern as `gtm-store.mjs`) | New |
| **Execution graph** | The runnable step DAG (`source/enrich/generate/gate/execute/measure`, kinds `tool/agent/skill/code/mcp/switch/...`) | existing `flow-store.mjs` + `graph-operations.mjs` | **Kept unchanged.** It becomes the compiled payload *behind* a Run node (`Run.payload.executionGraphId`). 04 owns compile; 05 owns the fold-in. |

Reused verbatim (extend, never reinvent):

- **`brain/src/evidence.mjs`** — `EvidenceRecord { claim, source, solidity, capturedAt, notes }`, the `SOLIDITY_LADDER` (`observed > researched > inferred > speculative`, open), `normalizeEvidenceList`, `hasSourcedEvidence`, structural demotion-to-speculative. This IS the evidence model on every object node. Nothing new is invented here.
- **`brain/src/gtm-store.mjs`** — the record spine (`base()` fields, `genId`, open-label normalization, `normalizeRefs`). `MarketObjectRecord`, `ProductTruthRecord`, `GtmPathRecord`, `MeasurementContractRecord` **migrate into object-graph nodes** (Market, Product, Runs.path, Runs.success_criteria + Measurement domains respectively — mapping in 05). Their open-`kind` discipline carries over as the open-`type` discipline below.
- **`brain/src/board.mjs`** — `signalConfidence()` and `beliefStatus()` are **private nine-layer board helpers, not a per-node API**. What carries into the weakness engine is their derivation *discipline* (never seeded; verdicts > approvals/runs > citations > floor); 03 specifies a **new** per-node weakness-engine module that reimplements that discipline as new API surface. This spec stores that engine's outputs as derived fields, never inputs.
- **`brain/src/person-store.mjs`** — `Person` stays the durable identity store; `Audience.contact` nodes **reference** People by `personId`, they do not copy them.
- **`ui/src/types.ts`** — `Citation`, `EvidenceRecord`, `Solidity`, `GTMGraph`/`GTMNode` (execution layer) are kept. New types in this spec (`ObjectNode`, `ObjectEdge`, `Weakness`, `SourceRef`) are added beside them; `GtmMapView` and its four record types are superseded by the object-graph read (05).

Replaced/retired at the read layer (per doctrine "what gets gutted", details in 05): the bets-map projection over `GtmMapView`, the board as a separate surface (its math survives as the weakness/confidence seed), the idea-review overlay's private idea list (ideas become loose nodes).

---

## 1. Node domains and types (the palette, ~64 types)

Eleven domains. Read top-to-bottom they are the GTM lifecycle as objects; Learning closes the loop back to Strategy. **Palette, not taxonomy** (doctrine guardrail): `domain` must be one of the eleven so tooling can group and lens, but `type` is an **open string** — the types below are the canonical vocabulary the sprayer, lenses, and card renderers know, never a closed enum. An unknown type validates and renders as a generic card of its domain. Guarded by `brain/test/anti-cage.test.mjs`.

**Phase-1 column:** `P1` = created/read in the phase-1 slice; `NS` = north-star, schema specced now, no producer wired yet. A `P1(schema)` type is written by phase-1 code paths but has no dedicated behavior.

### External — the world's raw signal entering the graph
| type | represents | phase |
|---|---|---|
| `signal` | one observed world event: a star, a reply, a post, a competitor launch, a founder-forwarded quote. Maps from today's `Input` (inputs-store). | P1 |
| `source` | a standing place signals come from: a repo, an inbox, a community, a CSV. | P1 |
| `connector` | a wired integration that can read or act (Gmail, GitHub, CRM). Read tools run free; write tools sit behind a gate (04). | P1 |

### Market — who is out there and what hurts
| type | represents | phase |
|---|---|---|
| `buyer` | a named buyer archetype (role × context), pre-ICP. | P1 |
| `icp` | a committed targetable definition of who we sell to. | P1 |
| `pain` | a specific costly problem, in the buyer's words. | P1 |
| `job` | the job-to-be-done the buyer is hiring for. | P1 |
| `trigger` | the why-now event that makes the pain urgent. | P1 |
| `workaround` | what the buyer does today instead (the real competitor). | P1 |
| `competitor` | a named alternative product/vendor. | P1 |
| `objection` | a recurring reason buyers say no. | NS (populated by outcome ingestion) |

### Product — what the product provably does (scan-grounded)
| type | represents | phase |
|---|---|---|
| `capability` | something the product does, cited to `file:line` (from `ProductTruthRecord` / scan). | P1 |
| `workflow` | a user-facing flow through the product (from the product model's workflows). | P1(schema) |
| `proof` | demonstrable product evidence usable in market claims (a real metric, a shipped feature, a screenshot-able flow). | P1 |
| `product_gap` | a capability a strategy claim needs that the product lacks. | P1 |
| `measurement_gap` | a missing attribution key / event between an action and its outcome (the scan's `TrackingGap`). | P1 |

### Strategy — the bets (the default altitude for a fresh card)
| type | represents | phase |
|---|---|---|
| `positioning` | category × audience × promise. | P1 |
| `wedge` | the narrow first fight we choose to win. | P1 |
| `value_prop` | a specific buyer-outcome claim the product supports. | P1 |
| `offer` | the deal: price / unit / terms / risk-reversal. | P1 |
| `channel` | a way to reach the audience (open: outbound, a community, SEO, a marketplace — never an enum). | P1 |
| `message` | what we say: angle + core claim for a channel × ICP. | P1 |
| `proof_point` | a market-facing citation of a Product `proof` (testimonial slot, number, demo link). | P1(schema) |
| `conversion_path` | the expected step chain from first touch to the win event. | P1 |

### Audience — the actual reachable people
| type | represents | phase |
|---|---|---|
| `account` | a target organization. | P1(schema) |
| `contact` | a reachable person; references a `Person` (`payload.personId`). | P1 |
| `segment` | a slice of an ICP with a shared trait/trigger. | P1 |
| `lead_score` | a scoring rule/result set over contacts. | NS |
| `list` | a concrete, sourceable set of contacts/accounts a run can consume. | P1 |

### Assets — the made things (open set; these are the known renderers)
| type | represents | phase |
|---|---|---|
| `email` | an outbound email draft/sequence step. | P1 |
| `page` | a landing page / microsite. | P1 |
| `post` | a social/community post. | P1 |
| `deck` | a sales/pitch deck. | NS |
| `audit` | a personalized audit/teardown artifact. | NS |
| `demo` | a demo build or recording (incl. gated microproduct). | NS |
| `report` | a data/insight artifact used as a lure. | NS |

### Runs — selected bets compiled into execution
| type | represents | phase |
|---|---|---|
| `path` | a selected route through the graph — the unit the founder compiles (from `GtmPathRecord`; keeps `bet`, `restsOn`, `rankingSignals` in payload). | P1 |
| `run` | one compiled execution of a path; `payload.executionGraphId` points at the existing flow-store graph, `payload.runIds` at its run ledger. | P1 |
| `gate` | a projection over the execution-graph gate node (doctrine locked decision 4; 04 owns gate/autonomy) — see §6.3. | P1 |
| `agent` | a named worker a run uses (`payload.ref` = the agent/skill ref; persona via agentPersona). | P1(schema) |
| `execution_plan` | the decomposition receipt: what the compile produced (lists, assets, patches, gates, measurement), as refs. | P1 |
| `success_criteria` | what "worked" means for this path (from `MeasurementContractRecord.successCriteria`), joined to Measurement nodes via `measured_by`. | P1 |

### Pipeline — commercial outcomes (truth, never authored)

**Founder-entered outcome ingestion is phase 1** (04 §6.4, reusing `outcome-ingest.mjs`): any Pipeline or Customer type may be written in P1 by `ingestOutcome` as an `outcome`-maturity node with a `produced` edge from its run. Connector/watcher ingestion is north-star. The phase column below reads: P1 for the founder-entered write path, NS for connector ingestion.

| type | represents | phase |
|---|---|---|
| `reply` | a real response from a contact. | P1 (founder-entered) / NS (connector) |
| `meeting` | a booked/held meeting. | P1 (founder-entered) / NS (connector) |
| `signup` | a product signup tied to a contact/account. | P1 (founder-entered) / NS (connector) |
| `lead` | a qualified in-motion prospect state. | P1 (founder-entered) / NS (connector) |
| `opportunity` | a deal in play. | P1 (founder-entered) / NS (connector) |
| `pilot` | a paid/structured trial. | P1 (founder-entered) / NS (connector) |
| `revenue` | money, attributed. | P1 (founder-entered) / NS (connector) |

### Customer — post-win truth
| type | represents | phase |
|---|---|---|
| `activation` | the customer reached first value. | P1 (founder-entered) / NS (connector) |
| `usage` | ongoing engagement signal. | P1 (founder-entered) / NS (connector) |
| `retention` | they stayed (period-based). | P1 (founder-entered) / NS (connector) |
| `expansion` | they grew. | P1 (founder-entered) / NS (connector) |
| `churn` | they left, with reason if known. | P1 (founder-entered) / NS (connector) |
| `testimonial` | words we may quote (feeds Strategy `proof_point`). | P1 (founder-entered) / NS (connector) |

### Measurement — how outcomes become observable
| type | represents | phase |
|---|---|---|
| `event` | an instrumented product/GTM event (scan-cited or contract-declared). | P1 |
| `attribution` | a join key linking an outward action to a win event. | P1 |
| `contract` | the bound measurement contract for a path/run (mirrors `MeasurementContractRecord`: outcomeKinds, sources, joinKey, successCriteria). The real target of `measured_by`. | P1 |
| `metric` | a named number derived from events. | P1(schema) |
| `result` | one measured reading for a run/path (count + window + source). | NS |
| `scorecard` | a rollup of results against `success_criteria`. | NS |

### Learning — the loop closing (writes back to Strategy/Market)
| type | represents | phase |
|---|---|---|
| `belief` | a durable updated belief ("dev-tool founders reply to teardown audits, not intros"), with the outcomes that earned it. | NS |
| `path_score` | the graded performance of a path across runs. | NS |
| `next_bet` | a proposed follow-on path derived from learning. | NS |
| `repeatable_motion` | a path proven enough to promote up the autonomy ladder (04). | NS |

Count: 3+8+5+8+5+7+6+7+6+6+4 = **65 canonical types**. Founder-entered outcome ingestion into Pipeline/Customer is phase 1 (00 Scope item 11, 04 §6.4); connector/watcher ingestion and the Learning domain's producers are deferred, with their schemas fixed now so later ingestion writes into a settled shape.

---

## 2. Node schema

One shape for every node. Per-type variance lives in `payload` only.

```ts
type Maturity = "loose" | "typed" | "execution" | "outcome";

type ObjectNode = {
  schemaVersion: 1;
  id: string;                    // "obj-<stamp>-<hex>" via gtm-store genId pattern
  projectId: string | null;
  domain: "external" | "market" | "product" | "strategy" | "audience"
        | "assets" | "runs" | "pipeline" | "customer" | "measurement" | "learning"
        | null;                  // null allowed ONLY at maturity "loose"
  type: string | null;           // OPEN string; §1 is the palette, not a validator.
                                 // null allowed ONLY at maturity "loose"
  maturity: Maturity;            // the card lifecycle altitude — see §5

  statement: string;             // the one-line card face. Plain words, ≤ ~140 chars.
                                 // Everything else is depth-on-click (doctrine: wide spray, shallow cards).

  // ── Evidence (see §6) — reuses evidence.mjs verbatim ──
  evidence: EvidenceRecord[];    // normalized by normalizeEvidenceList()
  solidity: string | null;       // DERIVED: effectiveSolidity(evidence). Never written directly.
  confidence: number | null;     // 0–100, DERIVED by the weakness engine (03) from real signal
                                 // (board.mjs signalConfidence seed). null = no signal (honest-blind).

  // ── Weakness (see §6) ──
  weaknesses: Weakness[];        // DERIVED by 03. Never authored. [] on a healthy or unexamined node.

  // ── Sources (the count/preview the shallow card shows) ──
  sources: SourceRef[];
  // sourceCount and sourcePreview are computed at read time (sources.length, sources[0].preview) —
  // not stored, so they can never drift from the truth.

  // ── Lineage & provenance ──
  origin: "scan" | "spray" | "founder" | "run" | "promotion" | "ingest";  // open-tolerant string
  originRef: string | null;      // scanId / sprayId / runId / promoting-node id — the receipt

  payload: Record<string, unknown>;  // per-type config (§2.1). Open object; typed keys below are
                                     // the known vocabulary, extra keys are tolerated.

  createdAt: string;
  updatedAt: string;
  revision: number;
};

type SourceRef = {
  kind: "scan" | "run" | "outcome" | "web" | "connector" | "founder" | (string & {});
  ref: string;                   // file:line citation string | runId | url | inputId | "founder"
  preview: string;               // one readable line ("mirror.mjs:214 — tracks win event", "reply from @dhh")
  at: string;                    // ISO timestamp
};
```

Notes:

- **Nullability rule, stated once:** at maturity `"loose"`, `domain` and `type` MAY be null (an unfiled card). At `"typed"` or higher, both are REQUIRED — the `promote_node` mutation (§5.1) supplies them, and validation rejects a typed/execution/outcome node missing either.
- **No layout fields.** Position, pinning, and highlight state are projection state owned by 02, which keeps a per-project layout sidecar keyed by node id (02 §3). The store carries knowledge, not geometry. (This breaks with the execution graph's `position` field on purpose — that graph keeps its own layout because it predates this split.)
- **`statement` is the only required prose.** A loose card is legally just `{ domain?, type?, statement }` — see §5 for how little a loose node needs.
- **Derived fields (`solidity`, `confidence`, `weaknesses`) are write-protected** at the mutation layer: the typed operations (§7) reject them in founder/model patches, the same pattern as `assertNoForgedAutonomy` in `graph-operations.mjs`. Only the evidence normalizer and the weakness engine (03) write them, always with receipts.
- **Model confidence never becomes node confidence.** Any model-declared confidence (a 0–1 value at the prompt boundary) is stored as `payload.modelConfidence`, display-only — it is never written to `confidence` (0–100, weakness-engine-derived) and never used in ranking.

### 2.1 Per-type payload vocabulary (known keys, open objects)

Only non-obvious payloads listed; a type not listed carries whatever the sprayer/founder gave it.

| type | payload keys |
|---|---|
| `external.signal` | `{ inputId?, kind, payload, provenance }` — mirrors `Input` |
| `external.connector` | `{ connectorId, configured, capabilities: {read[], write[]} }` — mirrors `ConnectorMeta`/`CapabilityServer` |
| `market.icp` | `{ label, query?, industry?, geography?, exclusions?[] }` — from `sharedContext.icp` |
| `product.capability` / `proof` | `{ citations: Citation[] }` — the `file:line` scan evidence, also mirrored into `evidence[]` as observed |
| `product.measurement_gap` | `{ gapId, severity, recommendation }` — from `TrackingGap` |
| `strategy.offer` | `{ price?, unit?, terms?, alternatives?[] }` |
| `strategy.message` | `{ angle, claim, tone? }` |
| `strategy.conversion_path` | `{ steps: string[] }` — expected chain, plain words |
| `audience.contact` | `{ personId }` — Person stays in person-store; never copied |
| `audience.list` | `{ mode: "provided"|"discovered"|"derived", items?, csv?, endpoint?, sourceNodeId? }` — the `source-entry.mjs` source modes, verbatim; `sourceStandsOnData()` logic applies here |
| `assets.*` | `{ body?, subject?, url?, fileRef?, variantOf? }` — the staged artifact content or a pointer to it |
| `runs.path` | `{ bet: Record<string,string>, restsOn: {type,id}[], rankingSignals: PathRankingSignals, risk? }` — carried over from `GtmPathRecord` |
| `runs.run` | `{ executionGraphId, runIds: string[], status }` — the bridge to flow-store; status is the run ledger's, never duplicated logic |
| `runs.gate` | `{ protects, requiredApproval, reviewPayload, autonomy? }` — §6.3; the WHOLE payload is projection-only, derived read-only from the execution-graph gate node and the channel's autonomy (04); never authored through this store |
| `runs.success_criteria` | `{ outcomeKinds: string[], joinKey, criteria }` — from `MeasurementContractRecord` |
| `measurement.contract` | `{ outcomeKinds, sources, joinKey, successCriteria }` — mirrors `MeasurementContractRecord` (04 §5); the node `measured_by` points at |
| `measurement.attribution` | `{ key, from, to }` — which key joins which action to which outcome |
| `measurement.result` | `{ value, window, sourceRunId }` |
| `learning.belief` | `{ prior?, posterior, earnedBy: {type,id}[] }` |

---

## 3. Typed edges

Twelve types. Unlike node `type`, the edge-type vocabulary is **closed** — edges are machine semantics (like `PREDICATE_OPS` in `graph-operations.mjs`: "a closed op set keeps routing deterministic and auditable"). The anti-cage rule protects GTM *concepts* from enums; edge types are graph mechanics, not GTM concepts. Adding a thirteenth type is a code change with a test.

### 3.1 Edge schema

```ts
type ObjectEdgeType =
  | "supports" | "weakens" | "belongs_to" | "leads_to" | "targets" | "uses"
  | "measured_by" | "produced" | "blocked_by" | "derived_from" | "promoted_to" | "updates";

type ObjectEdge = {
  schemaVersion: 1;
  id: string;
  projectId: string | null;
  source: string;                // ObjectNode id
  target: string;                // ObjectNode id
  type: ObjectEdgeType;          // CLOSED union (doctrine locked decision 6). Unknown
                                 // model-returned types route to the nearest known type
                                 // or "derived_from" at the prompt boundary (03).

  // Doctrine: causal edges are MACHINE-DRAWN ONLY. The founder never hand-wires them;
  // founder actions are confirm / swap / challenge, expressed as status changes below.
  // (A manual empty-graph mode, if built, is a separate, explicitly-labeled overlay —
  // its wires are not part of this causal graph and never enter path scoring.)
  status: "proposed" | "confirmed" | "swapped" | "challenged" | "suppressed" | "removed";
      // machine-drawn edges land "proposed"; founder confirm → "confirmed";
      // founder swap → "swapped" (stores the replacement target AND the original as provenance);
      // founder challenge → "challenged" (kept visible, excluded from path scoring);
      // "suppressed" = machine-parked past the judgmental fan-out cap (03 §2.2) — kept for
      // the inspector, excluded from default rendering, never silently deleted;
      // removal is a status, not a delete — lineage survives.
  basis: SourceRef[];            // WHY the machine drew it (03 writes this). Structural edges
                                 // carry the stored reference; judgmental edges carry SourceRefs
                                 // whose `preview` holds the model's plain-words clause — the
                                 // freeform clause goes in `preview`, never raw into `basis`.
                                 // A machine edge with EMPTY basis is INVALID and rejected at
                                 // the mutation layer — never floored, same rule as seeded weakness.
  confidence: number;            // 0–100 everywhere. 100 on structural edges; the inferrer's
                                 // grade on judgmental edges (converted from 0–1 at the
                                 // prompt boundary, 03 §2.2).

  label?: string;                // optional plain-words qualifier ("competes on price")
  createdAt: string;
  updatedAt: string;
};
```

Structural rules (validated on every mutation, `validateGraph`-style):

- `source !== target`; both must exist; edge ids unique.
- No cycle check on the object graph as a whole — knowledge legitimately loops (Learning `updates` Strategy). Cycles are banned only per-type where the semantics are hierarchical: `belongs_to`, `derived_from`, `promoted_to` must each be acyclic within their own type-subgraph.
- Duplicate `(source, target, type)` triples are rejected.

### 3.2 Edge semantics and legal domain pairs

Domain legality is enforced as **warnings, not rejections** (advisory, like contracts — the model composes free, the UI flags the odd wire). The one hard rule in the whole system is the wall, and that lives on `runs.gate` placement (04), not here.

| type | precise meaning | typical source domains → target domains | phase |
|---|---|---|---|
| **supports** | *Source being true raises confidence in target.* An evidence-bearing node backs a claim node. Feeds the target's `confidence` derivation (03). | External.signal, Product.proof/capability, Measurement.result, Pipeline.\*, Customer.testimonial → Market, Strategy, Learning.belief | P1 |
| **weakens** | *Source being true lowers confidence in target.* A contradicting signal or outcome. The negative twin of supports; same pairs. A node with only `weakens` inbound and no `supports` is a prime Evidence-weakness candidate. | same as supports | P1 |
| **belongs_to** | *Source is a member/part of target* — the decomposition tree. Drill-down (02) walks this edge type. Acyclic. | segment → icp · contact → account/segment/list · persona-level Market nodes → buyer · asset variant → message · account → segment | P1 |
| **leads_to** | *Source stage is expected (or observed) to produce target stage* — funnel causality. On Strategy it encodes the `conversion_path`; on Pipeline it encodes real progression (reply → meeting → opportunity). Expected vs observed is read off `basis` (a leads_to with outcome refs is observed). | Strategy.conversion_path steps · channel → pipeline.reply · pipeline.reply → pipeline.meeting → … → pipeline.revenue → customer.\* | P1 (expected) / NS (observed) |
| **targets** | *Source is aimed at target audience.* The aim of anything outward-facing. | Strategy.message/offer/channel, Assets.\*, Runs.path/run → Market.buyer/icp, Audience.segment/account/contact/list | P1 |
| **uses** | *Source consumes target as an ingredient.* Composition/dependency, no causality claim. | message uses proof_point · asset uses message/offer · path uses channel/offer/message · run uses list/asset/agent/connector | P1 |
| **measured_by** | *Source's success is observed through target.* The observability contract. A Strategy/Runs node with no `measured_by` path to a Measurement node is a Measurement-weakness candidate (03). | Strategy.value_prop/conversion_path, Runs.path/run/success_criteria → Measurement.contract/event/attribution/metric (a compiled run points at its `measurement.contract` node) | P1 |
| **produced** | *Source made target exist.* The factual output edge — never speculative; `basis` must carry the producing run/scan ref. | Runs.run → Assets.\*, Pipeline.\*, Measurement.result · External.connector → External.signal · scan (Product nodes carry origin:"scan" instead — produced is for runtime production) | P1 (staged assets + founder-entered outcomes) / NS (connector-ingested outcomes) |
| **blocked_by** | *Source cannot advance to execution/outcome because target is unresolved.* Target is a gap node or a node carrying an open weakness. Cleared by repair (§6.2), not deleted — status → "removed" with the repair receipt in `basis`. | Strategy.\*, Runs.path/run → Product.product_gap/measurement_gap, Audience.list (unsourceable), any node with open weakness | P1 |
| **derived_from** | *Source was generated from target* — provenance between peers. Both stay alive as distinct objects (a segment derived from an ICP; a message derived from a value prop; a next_bet derived from a belief). Acyclic. | any → any (provenance is universal) | P1 |
| **promoted_to** | *Source's maturity successor is target* — lifecycle lineage (§5). Source is the earlier-altitude object (kept, superseded for scoring), target the later. Acyclic, at most one outgoing `promoted_to` per node. | loose node → typed node · typed Strategy/Audience node → execution instantiation (list, asset, run) | P1 |
| **updates** | *Source (an outcome/learning) rewrites target (a belief/strategy).* The taste-loop writeback: the edge that makes Learning close the loop. `basis` carries the outcome refs; the target's statement/payload change is a normal revision with `originRef` = this edge. Mirrors `GtmExperiment.updates`. | Pipeline.\*, Customer.\*, Measurement.result, Learning.belief/path_score → Market.\*, Strategy.\*, Learning.belief | NS |

### 3.3 Cross-domain reference patterns (worked examples)

The lifecycle, written in edges:

```
signal ──supports──▶ pain ──belongs_to──▶ buyer
buyer ◀──targets── message ──uses──▶ proof_point ──derived_from──▶ product.proof
message ──belongs_to──▶ channel        channel ──uses──▶ connector
path ──uses──▶ {channel, offer, message}   path ──targets──▶ icp
path ──measured_by──▶ attribution ──uses──▶ event
path ──blocked_by──▶ measurement_gap          (weak until repaired)
path ──promoted_to? no: path COMPILES →  run ──derived_from──▶ path
run ──uses──▶ {list, asset, agent}     run ──produced──▶ email (staged)
run ─▶ [gate protects the outward edge] ─▶ (send)      ← 04's wall
run ──produced──▶ reply ──leads_to──▶ meeting ──leads_to──▶ pilot
reply ──supports──▶ message            reply ──updates──▶ belief
belief ──updates──▶ icp                belief ──derived_from──▶ path_score
next_bet ──derived_from──▶ belief      next_bet is a loose Strategy-altitude card again
```

That last line is the flywheel as data: Learning emits new loose cards at Strategy altitude, and the lifecycle starts over.

---

## 4. Maturity (altitude) as data

`maturity` is a per-node field, not a per-domain constant — a channel can exist as a loose hunch, an ICP as an execution-grade definition. Defaults at creation:

- `loose` — spray output the founder hasn't engaged, founder notes, raw signals. May lack `domain`/`type` (the §2 nullability rule; a loose node with no domain renders as an unfiled card).
- `typed` — the structured-GTM layer: domain + type + statement + evidence label + weakness labels. What the first spray mostly produces (doctrine: wide and shallow — typed but thin).
- `execution` — instantiated, runnable/consumable: lists, assets, runs, gates, plans, patches, measurement contracts.
- `outcome` — truth that happened: Pipeline, Customer, Measurement.result, Learning nodes. **Never authored, only produced/ingested** — an outcome node whose `origin` is not `run`/`ingest` is invalid.

---

## 5. Promotion transitions (state changes, precisely)

Doctrine lifecycle: *loose → typed → execution → outcome*. Three distinct mechanisms — only the first is in-place:

### 5.1 `loose → typed` — in-place upgrade
A typed store mutation `promote_node { nodeId, domain, type, payloadPatch? }`:
- sets `domain` + `type` (required), keeps `statement`, bumps `maturity` to `"typed"`, `revision++`;
- evidence normalization runs (`solidity` derived); the weakness engine (03) is *invited* to examine it — weakness appears only when signal exists;
- no new node, no `promoted_to` edge (same object, sharper).

Who calls it: founder (click "type this card") or the machine with founder confirm (03). The card keeps its id, so every edge already drawn to the loose card survives.

### 5.2 `typed → execution` — spawn with lineage
Instantiation **creates a new node** and links it back; the typed node stays alive as the belief:

- Compile (04) is the bulk case: `runs.path` → a `runs.run` + its `execution_plan`, `audience.list`(s), `assets.*`, `runs.gate`(s), `runs.success_criteria`, each new node `maturity:"execution"`, `origin:"promotion"` (or `"run"` for compile-produced), `originRef` = the source node, plus edges: new node `derived_from` its typed parent, source typed node `promoted_to` the primary instantiation.
- Single-card case: founder promotes one typed node ("make this message a real email") → one asset node, same edge pattern.

Why spawn, not mutate: the typed node is a *belief* that outlives any one instantiation (one `strategy.message` can be promoted into five email variants across three runs). Scoring/learning attaches to the belief; execution state attaches to the instance.

### 5.3 `execution → outcome` — production, never promotion
Outcomes are not a promotion of anything. A run **produces** them: 04's outcome ingestion writes `pipeline.*` / `customer.*` / `measurement.result` nodes with `maturity:"outcome"`, `origin:"run"|"ingest"`, and a `produced` edge from the `runs.run`. **The founder-entered ingestion path is phase 1** (04 §6.4); connector/watcher ingestion is north-star. Learning nodes are then derived (`derived_from` outcomes) and write back via `updates` edges (NS).

**Demotion does not exist.** A typed node that turns out wrong is weakened/challenged (evidence, `weakens` edges, weakness flags), never pushed back to loose — history is kept, confidence drops.

---

## 6. Evidence + weakness data model

### 6.1 Evidence

Reuses `evidence.mjs` unmodified. On every node:

- `evidence: EvidenceRecord[]` — `{ claim, source, solidity, capturedAt, notes }`, normalized at every write; a record without a `source` is demoted to `speculative` **in code** (`normalizeEvidence`).
- `solidity: string | null` — derived: strongest rung across sourced evidence (`effectiveSolidity`). This is the card's **evidence label**: `observed` / `researched` / `inferred` / `speculative` (open ladder; unknown labels rank below speculative, per `solidityRank`). `null` when there is no evidence at all — rendered as *unsupported*, distinct from *speculative* (a guess someone at least wrote down).
- Scan citations (`Citation { file, line, text }`) enter as `EvidenceRecord { source: "<file>:<line>", solidity: "observed" }`; the raw citation also lives in `payload.citations` for the Product-mode bridge.
- `sources: SourceRef[]` carry the *where-it-came-from* receipts the shallow card previews; `evidence[]` carries the *what-it-claims* support. They overlap but are not the same list (a node can have a source without it constituting evidence for the statement).

### 6.2 Weakness

```ts
type WeaknessKind = "evidence" | "specificity" | "product"
                  | "measurement" | "execution" | "performance" | (string & {});
                  // the six doctrine kinds are canonical; open-tolerant for future kinds

type Weakness = {
  id: string;
  kind: WeaknessKind;
  statement: string;             // plain words: "only founder input supports this ICP"
  detectedFrom: SourceRef[];     // NON-EMPTY, always. The real signals that derived it
                                 // (run ids, scan gap ids, outcome counts, edge audits).
                                 // Empty detectedFrom = invalid = seeded weakness, banned
                                 // (same rule as seeded health — doctrine hard part #1).
  detectedAt: string;
  signal: Record<string, unknown>;  // the actual numbers/records the detector read —
                                    // auditable, rendered by 02's inspector (03 writes)
  threshold: string;             // the rule that fired, in plain words (03 writes)
  severity: number | null;       // 0–100, DERIVED by 03 from signal strength;
                                 // null when the detector doesn't grade

  status: "open" | "repairing" | "repaired" | "dismissed";
  repair: RepairAction | null;   // the suggested fix, attached at detection time (03 generates)
  resolution: {                  // written when status leaves "open"
    at: string;
    by: "founder" | "repair-run";
    ref: string | null;          // the run/node/edge that repaired it, or the dismiss note
  } | null;
};

type RepairAction = {
  verb: "find_evidence" | "narrow" | "add_product_proof" | "patch_product"
      | "patch_measurement" | "alternate_channel" | "source_list"
      | "rewrite_message" | "change_offer" | (string & {});   // doctrine repair column; open
  statement: string;             // plain words: "narrow to founders with >1 live product"
  targetNodeId: string | null;   // the node the repair would create/modify, once known
  compilable: boolean;           // true when the repair can compile into a run step (04)
};
```

Kind → canonical detection signal → canonical repair verb (the doctrine table, as data):

| kind | derived from (examples of `detectedFrom`) | repair verb |
|---|---|---|
| `evidence` | evidence audit: `hasSourcedEvidence()` false / only founder-origin sources | `find_evidence` |
| `specificity` | statement breadth heuristics + zero `belongs_to` children (03 owns the detector) | `narrow` |
| `product` | a `supports` search from Product domain returns nothing; or an explicit `blocked_by → product_gap` | `add_product_proof` / `patch_product` |
| `measurement` | no `measured_by` path from this node to a Measurement node; scan `TrackingGap` | `patch_measurement` |
| `execution` | its `targets`/`uses` audience list fails `sourceStandsOnData()` — no sourceable list exists | `alternate_channel` / `source_list` |
| `performance` | run ledger: produced > 0, downstream `leads_to` outcomes = 0 (replies but no meetings) | `rewrite_message` / `change_offer` |

Relationship to `blocked_by`: a weakness is a *label on the node*; `blocked_by` is an *edge* drawn when the weakness has a concrete blocking counterpart node (a `product_gap`, an unsourceable `list`). Repairing the weakness resolves both: weakness `status → "repaired"` with the receipt, edge `status → "removed"` with the same receipt in `basis`.

**Read-side weakness report (computed, never stored).** So the UI can tell *clean* from *blind*, every node exposes a read-time `weaknessReport: { [kind]: "fired" | "clear" | "unmeasured" }` — computed by 03 on read (per detector: fired = an open Weakness of that kind exists; clear = the detector ran with signal and found nothing; unmeasured = no signal to read, or the detector is deferred). It is never persisted, so it can never drift. 02 renders it (02 §5.4).

How detection runs, what the heuristics are, and how repairs are generated is **03's spec**; this section only fixes the shapes they read and write. The weakness engine is a **new module** (03 §3) that adopts `board.mjs`'s derivation discipline — never seeded; verdicts > approvals/runs > citations > floor — as new per-node API surface, not a reuse of the board's private nine-layer helpers.

### 6.3 The gate object (projection only — the gate, autonomy, and run model are 04's)

The `runs.gate` node is a **projection over the execution-graph gate node**, never a standalone reasoning node and never an independently-authored record. Its **entire payload is derived, read-only** — computed from the execution gate node, its staged items, and the channel's autonomy level, the same way `protects` is derived from topology (04 §2.1):

```ts
payload: {                       // ALL DERIVED — no field here is ever authored
  protects: string;              // derived from the downstream execute node(s): "send_emails" | "publish_page" | "apply_patch" | "update_crm" | <open label>
  requiredApproval: "founder";   // constant, restating 04 invariant 5; team roles are 04's release guard
  reviewPayload: string;         // derived from staged-item shape: "copy" | "list" | "diff" | "action-summary" | <open>
  autonomy?: "draft" | "trusted" | "autonomous";   // READ from the channel; autonomy lives on the
                                                   // channel and is written ONLY by promoteChannel
                                                   // under the forge-guard (04 §7) — never through
                                                   // this store, never by composition, never by a run
}
```

The wall invariant itself (every outward action edge passes a gate; `assertGateWall`), the autonomy ladder, and `blessedPattern` mechanics are all defined and enforced in 04. This store's only rule: any typed mutation attempting to write `runs.gate` payload fields is rejected — the projection is recomputed from 04's state, exactly like `protects` and `action-summary`.

---

## 7. Store and mutation surface

- **`object-graph-store.mjs`** (new): `persistence()` over `(collection: "object-graph", key: projectId)`, one document per project holding `{ nodes: ObjectNode[], edges: ObjectEdge[], revision }` — atomic write-behind via the store-fs seam (the Convex mirror seam is preserved for free).
- **`object-graph-operations.mjs`** (new, modeled on `graph-operations.mjs`): typed operations `add_node · promote_node · update_node · retire_node · add_edge · set_edge_status · update_edge`, each validated, each returning a plain-words change line; batch-capped; `revision++` per batch; whole-graph validation after every batch (§3.1 rules + derived-field write protection + non-empty `detectedFrom`/`basis` invariants + outcome-origin invariant + the §6.3 gate-payload rejection). `add_edge` on the causal graph is reachable only from the machine paths (03 inference, compile/ingest lookups) — the founder's edge surface is `set_edge_status` (confirm / swap / challenge), per doctrine.
- **Delete is retirement.** `retire_node` sets a `retiredAt` stamp rather than removing — outcomes, lineage edges, and learning must never dangle. Hard delete exists only for loose nodes with no edges.
- Read endpoints, projections, and lenses over this store are 02's spec; the migration of `gtm-store`, `Input`s, `sharedContext.icp/offer/claims`, and `Person` appearances into it is 05's.

---

## 8. Phase-1 slice summary (matches 00 §Scope — the single source)

**In (create + read + mutate):** all External/Market/Product/Strategy types marked P1; Audience `contact/segment/list`; Assets `email/page/post`; Runs `path/run/gate/execution_plan/success_criteria`; Measurement `event/attribution/contract`; Pipeline/Customer via **founder-entered outcome ingestion** (04 §6.4). Edges: `supports, weakens, belongs_to, leads_to (expected), targets, uses, measured_by, produced (staged assets + founder-entered outcomes), blocked_by, derived_from, promoted_to`. Weakness: all six **shapes** specced; phase-1 **detectors** are `evidence`, `product` (scan-derived), `measurement` (scan-derived), `execution` (list-sourceability) — `specificity` and `performance` are deferred and report honest `unmeasured` blanks via the `weaknessReport` (§6.2). Maturity transitions §5.1, §5.2, and the founder-entered half of §5.3.

**Deferred (schema fixed, no producer):** Learning domain; connector/watcher ingestion into Pipeline/Customer; `objection`, `lead_score`, `deck/audit/demo/report`, `metric` behavior, `result`, `scorecard`; the `updates` edge; observed `leads_to`; `specificity` (needs drill-down) and `performance` (needs outcome volume) detectors.
