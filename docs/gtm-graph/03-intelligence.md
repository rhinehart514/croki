# 03 — Intelligence: how the machine populates and reasons over the graph

> **SUPERSEDED PACKAGE FILE.** This intelligence model belongs to the historical GTM graph package
> and cannot direct current work. Use [FIRM-SPEC.md](../FIRM-SPEC.md).

**Status:** spec, from `00-DOCTRINE.md` (binding) · **Date:** 2026-07-02
**Siblings:** `01-object-graph` (node/edge schema this spec writes into) · `02-canvas-interaction` (how any of this renders) · `04-runs-and-wall` (compile, gate, outcome ingestion) · `05-migration` (what folds into this).

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

This spec owns the machine's reasoning: the first spray, edge inference, weakness detection, repair suggestions, drill-down, variant generation, and the strongest-path recommendation. It does not design UI (02) and does not execute runs or gates (04).

---

## 0. The governing split: code answers wherever it can

Every capability below is explicitly labeled **CODE** (deterministic spine — scoring, dedup, routing, thresholds, joins, validation) or **MODEL** (rented call — genuinely fuzzy generation and inference). The dividing rule, same as the rest of the brain: *a model call where a function would do is a bug you pay for on every run.*

| Capability | CODE (spine) | MODEL (rented) |
|---|---|---|
| Product truth | `scan.mjs` scan, `productTruthsFromScan` adaptation, citation stamping | — (the scan is pure code by design) |
| Market spray | normalize, persist, solidity demotion (`gtm-store.mjs` + `evidence.mjs`) | one `gtm-research-market` agent run |
| Strategy spray | grounding pack, normalize, dedup, persist | one lean generate call (no tools) |
| Structural edges | drawn entirely by code from stored references | — |
| Judgmental edges | endpoint/type validation, dedup, confidence storage, dirty-set routing | one lean inference call per dirty batch |
| Weakness detection | **all of it** — every kind is a threshold over stored signals | — (never) |
| Repair routing | the kind→repair table, candidate queries, contract-gap naming | drafting repair *content* only |
| Drill-down | child normalization, evidence status, all four selectors | one decomposition call per node |
| Variants | dedup (`defaultDistinct`), taste injection, persistence | generate + separate critic (`composeIdeas` shape) |
| Strongest path | **all of it** — enumeration, the seven signals, composite, outcome reweighting | — (never; a model guessing a rank number is banned) |

Evidence discipline is enforced in code at the normalize boundary, exactly as today: `effectiveSolidity` in `brain/src/evidence.mjs` structurally demotes any claim with no sourced evidence to `speculative`. Nothing in this spec can present a model's assertion as grounded — the model can only *attach* sources; code decides what they're worth.

**Anti-seed rule (hard):** weakness flags, evidence labels, path scores, and performance numbers are all pure reads over stored records (scan citations, market evidence, the run ledger, gate decisions, joined outcomes). A node with no signal reports *no signal* — never a fake number, never a decorative flag. This is the same discipline `board.mjs` already holds (`belief=null, confidence=0, status="blind"`); the weakness engine (§3) is a **new module** that reimplements that discipline per node — `board.mjs`'s functions themselves are private layer helpers, not a reusable per-node API (05 maps the fold).

**Anti-cage rule (hard — node vocabulary only):** every node kind/type list in this spec is a **hint vocabulary**, never a closed enum. Stores accept any node kind string; `anti-cage.test.mjs` extends to cover the new modules. **Edge types are the explicit exception** (doctrine locked decision 6): the twelve edge types are a closed union of graph mechanics, owned by 01. The inference prompt may still return an edge type nobody named — code routes it to the nearest known type, falling back to `derived_from`, at the prompt boundary (§2.2); it is never stored as a new type.

---

## 1. First spray — wide and shallow across the sprayed layers (PHASE 1)

The spray populates the graph from two truth sides plus founder-stated inputs. Doctrine locked decision 2: *one-line statement, type, evidence label, weakness label, source count / preview* per card. Depth only on click or compile.

### 1.1 Inputs

1. **Product scan** — `scanRepo` (`brain/src/scan.mjs`), read-only, every conclusion cited to `file:line`. Yields: win event status, attribution capture/carry, analytics stack, blind spots (`attribution-not-carried`, `attribution-not-captured`, win-event-not-proven), headline.
2. **Interpretive product model** — `product-model-generator.mjs` (already rented): core objects, relations, jobs, states. Labeled inferred, never presented as scan fact.
3. **Market research** — the `gtm-research-market` agent (`~/.claude/agents/gtm-research-market.md`, invoked via `market-research.mjs`). Returns candidate `MarketObject` records across the buyer-side kinds (`MARKET_OBJECT_KIND_HINTS`: buyer, pain, job, trigger, workaround, valueProp, offer, channel, message, proof, conversionPath — hints, open list). Host normalizes into `marketObjectStore`; solidity recomputed in code.
4. **Founder-stated inputs** — `sharedContext` (icp, positioning, offer, claims). Persisted as market objects with `source: "founder-stated"`, evidence = whatever the founder cited (usually none → honestly `speculative` on the evidence axis, but still visible and labeled *founder-stated*, which is its own provenance, not a defect).
5. **Existing stores** — anything already in `productTruthStore` / `marketObjectStore` / `gtmPathStore` from prior sessions merges rather than duplicates (§1.4).

### 1.2 What the spray populates, per doctrine domain

| Domain (01 palette) | Populated by | Register |
|---|---|---|
| External (signals, sources, connectors) | CODE: connector registry, signal library (`gtm-signal-github` outputs), inbound `person-store` entrants | real records only |
| Market (buyer, ICP, pain, job, trigger, workaround, competitor, objection) | MODEL: market research agent → CODE normalize | sprayed |
| Product (capability, workflow, proof, product gap, measurement gap) | CODE: `productTruthsFromScan` + scan `blindSpots` (each blind spot mints a **gap card** carrying its citations); MODEL: product model for interpretive shape | sprayed |
| Strategy (positioning, wedge, value prop, offer, channel, message, proof, conversion path) | MODEL: strategy spray call (§1.3) → CODE normalize | sprayed |
| Audience / Assets | **not sprayed** — born from drill-down, compile (04), or real imports. Spraying fake audiences is seeding. |
| Runs / Pipeline / Customer / Measurement / Learning | **never sprayed** — these domains hold only real events (runs, gate decisions, joined outcomes). An empty Pipeline column is the honest truth on day one. |

The spray is *wide and shallow*: soft target ~3–7 cards per sprayed kind (a hint in the prompt, never a quota or cap), one sentence each, no drafting depth anywhere.

### 1.3 The strategy spray call (MODEL, lean)

New prompt `SPRAY_STRATEGY_PROMPT` in a new module `brain/src/graph-intelligence/spray.mjs`, built in the `path-portfolio.mjs` lean shape: **no tools, low turn budget, grounding packed in as data** (`buildPathGrounding` generalizes to `buildSprayGrounding(productTruths, marketObjects, founderInputs)` — each record carried with its `id`, `statement`, `solidity` so the model can cite what a card rests on).

The model returns candidate strategy cards:

```json
[
  {
    "type": "wedge | positioning | value_prop | offer | channel | message | proof_point | conversion_path | <any real type>",
    "statement": "one plain sentence",
    "restsOn": ["truth_x", "mkt_y"],
    "evidence": [ { "claim": "...", "source": "...", "solidity": "..." } ],
    "confidence": 0.0
  }
]
```

CODE then: drops candidates missing type+statement (same `toCandidates` discipline as `market-research.mjs`), resolves `restsOn` ids against the stores (unresolvable refs are stripped, and a card left with zero resolvable grounding is persisted `speculative`), recomputes solidity, dedups (§1.4), persists, and mints graph nodes per 01's schema. The model's `confidence` (0–1) is stored as `payload.modelConfidence`, display-only (01 §2) — it never becomes the node's derived 0–100 `confidence` and never enters ranking.

The spray generator does not grade itself and does not rank — weakness (§3) and path scoring (§7) are code passes that run after.

### 1.4 Dedup and merge (CODE)

- **Identity merge:** re-spray never duplicates. A candidate whose normalized statement is a near-match of an existing record of the same kind (lowercase, whitespace-collapsed, token-set Jaccard ≥ 0.8 — a plain function, tune the constant in tests) merges: union evidence, keep the stronger solidity, keep the earlier id. Model-based semantic dedup is explicitly not used here — a function answers.
- **Batch distinctiveness:** the sprayed set per kind runs through `defaultDistinct` (`ideation.mjs`) exactly as ideation does; a HUDDLED verdict triggers one regen pass with the huddle named in the prompt (max 1 regen, same as `composeIdeas`).

### 1.5 The card node (what every sprayed card must carry — 01's schema, 01's names)

Per 01 §2, minted by CODE at persist time. This section conforms to 01 verbatim; it introduces no field names of its own:

```
ObjectNode {
  id, domain, type,                    // 01 owns the shapes; type is 01's open string
  maturity,                            // spray output lands "typed" (thin) or "loose"
  statement,                           // one line, the model's sentence
  evidence: [ ...EvidenceRecord ],     // normalized; solidity derived from it
  solidity,                            // DERIVED: effectiveSolidity(evidence) — the evidence label
                                       // (observed | researched | inferred | speculative | <open>; null = unsupported)
  confidence,                          // 0–100, DERIVED by the weakness engine from real signal; null = no signal
  weaknesses: [ ...Weakness ],         // §3 — 01 §6.2's shape, re-derived on every signal change, NEVER stored as opinion
  sources: [ ...SourceRef ],           // where-it-came-from receipts
                                       // (sourceCount / sourcePreview are COMPUTED at read time from
                                       //  sources — never stored, per 01 §2)
  origin,                              // 01's value set: scan | spray | founder | run | promotion | ingest
  originRef,                           // the receipt (scanId / sprayId / runId / ...)
  payload: {
    restsOn,                           // grounding refs — what §2 and §7 resolve
    modelConfidence,                   // the model's declared 0–1, display-only; NEVER used in ranking
    ...per-type keys                   // 01 §2.1
  }
}
```

`solidity`, `confidence`, and `weaknesses` are **derived, write-protected fields** (01 §2) — recomputed from evidence and signals on read or on signal-change events, never trusted from a stored copy that could go stale (same recompute-at-normalize pattern `gtm-store.mjs` uses for solidity).

### 1.6 Cold-open ordering (doctrine hard part 3: strongest path in minute one)

The spray is staged so a real graph renders before the long pole finishes:

1. **T+seconds (CODE only):** scan runs → product cards + gap cards + founder-stated cards mint → structural edges (§2.1) draw → a *provisional* strongest path scores over code-only signals (§7 works with whatever records exist). The canvas has a real, cited, highlighted graph while research runs.
2. **T+~1–3 min (MODEL):** market research streams in; each persisted batch triggers incremental edge inference (§2.3) and a re-score. The highlight visibly updates rather than appearing all at once (02 renders the stream; this spec only guarantees the event order: `spray:product` → `spray:strategy-provisional` → `spray:market:batch*` → `spray:complete`, each followed by `graph:rescored`).
3. If the market agent fails or the runtime is blank (`blankGenerate`), the graph stays at step 1 honestly — provisional path from product + founder inputs, with the Market domain visibly thin. Never a fabricated market layer.

---

## 2. Edge inference — machine-drawn, typed, confidence-carried (PHASE 1)

Doctrine: edges are machine-drawn and typed from grounding; the founder confirms, swaps, or challenges — never hand-wires. Edge type vocabulary (**closed union**, owned by 01; doctrine locked decision 6): `supports · weakens · belongs_to · leads_to · targets · uses · measured_by · produced · blocked_by · derived_from · promoted_to · updates`.

### 2.1 Structural edges (CODE — the majority of all edges)

Wherever an edge is a stored reference, code draws it. No model call, full confidence (`100` on 01's 0–100 scale, basis = the reference itself):

| Stored fact | Edge drawn |
|---|---|
| card `restsOn` → record | record —`supports`→ card |
| scan citation on a truth/gap card | repo fact —`derived_from`— (carried as evidence, not a node, unless 01 promotes citations) |
| drill-down child (§5) | child —`belongs_to`→ parent, parent —`derived_from`→ child's evidence |
| variant (§6) | variant —`derived_from`→ parent |
| MeasurementContract attached to path/run | run —`measured_by`→ contract node |
| run staged from a path (04) | path —`produced`→ run; run —`produced`→ assets |
| outcome joined via `joinKey` (04 ingests; `outcome-ingest.mjs`) | run/item —`produced`→ outcome node; outcome —`updates`→ the cards its Learning record names |
| gap card blocking a claim (§3 product/measurement kinds) | gap —`blocked_by`⇐ the flagged card |
| promotion (04 autonomy ladder) | pattern —`promoted_to`→ gate policy |

Rule of thumb enforced in review: **if the edge can be computed from a stored field, it is code.** The model never re-derives what a lookup answers.

### 2.2 Judgmental edges (MODEL, lean)

What genuinely needs judgment: causal/strategic links between sprayed cards — *this pain* `leads_to` *this trigger*, *this message* `targets` *this ICP*, *this competitor move* `weakens` *this positioning*. New prompt `INFER_EDGES_PROMPT` in `brain/src/graph-intelligence/edge-inference.mjs`, lean shape (no tools, grounding as data — node ids, kinds, statements, solidity):

```json
[
  {
    "source": "node_a", "target": "node_b",
    "type": "leads_to | supports | weakens | targets | uses | belongs_to",
    "confidence": 0.0,
    "cites": ["node or evidence ids the clause leans on"],
    "clause": "one plain clause naming why"
  }
]
```

CODE validation on the way in, conforming to 01 §3.1:

- Both endpoints must exist; self-edges dropped; duplicate (source, target, type) merged keeping max confidence.
- **Type routing (closed union):** a returned `type` outside the twelve is routed to the nearest known type, falling back to `derived_from` — never stored as a new type, never rejected for novelty alone.
- **Basis is `SourceRef[]`, built by code:** each cited id resolves to a `SourceRef` whose `preview` carries the model's plain-words `clause` — the freeform clause goes in `preview`, never raw into `basis`. An edge whose citations resolve to nothing (empty basis) is **INVALID and rejected** — never floored to a token confidence (01's rule: same as seeded weakness).
- **Confidence converts at the prompt boundary:** the model's 0–1 becomes 01's 0–100 on write.
- Per-node judgmental fan-out capped (soft cap 8 in + 8 out — beyond that keep the highest-confidence, park the rest with status `suppressed` (01 §3.1) for the inspector, never silently deleted).

### 2.3 Edge lifecycle (CODE)

Edge status: `proposed` (machine-drawn, default) → `confirmed` | `swapped` | `challenged` (founder actions surfaced by 02, persisted by 01's typed mutations). A `swapped` edge stores the founder's replacement target *and* the original as provenance. Founder confirm/challenge events are taste signals: they append to the same decision memory the gate feeds (`memory.mjs` decisions), so future inference prompts carry "the founder rejected pain→trigger links argued only from competitor copy" style guidance via the standing `get_taste` consult.

**Incremental re-inference:** code computes the dirty set — nodes new or evidence-changed since the last inference pass — and calls the model only on `dirty × (dirty ∪ neighbors-of-dirty)` candidate space, not the whole graph. Confirmed edges are never re-proposed; challenged edges are never re-drawn with the same basis (the challenge is passed into the prompt as a ban).

---

## 3. Weakness detection — thresholds over real signals, per kind (PHASE 1: evidence, product, measurement, execution · NORTH-STAR: specificity, performance)

**All CODE.** New module `brain/src/graph-intelligence/weakness.mjs` — a **new API surface**, not a reuse of `board.mjs`: `signalConfidence()`/`beliefStatus()` there are private nine-layer board helpers, and what carries over is their derivation *discipline* (never seeded; verdicts > gate approvals/run counts > citations > floor), reimplemented per node against `evidence.mjs`'s ladder (05 maps the fold; `board.test.mjs`'s never-seeded cases port over as the regression floor). A weakness fires only from stored signals; the doctrine table (kind → meaning → repair) is implemented as six detectors, each defining *the exact signal it reads* and *the threshold that flags it*. A node whose signals can't be read reports `unmeasured` for that kind — an honest blank, never a flag and never a pass.

**Phase-1 slice (00 §Scope):** the `evidence`, `product` (scan-derived product-gap), `measurement` (scan-derived measurement-gap), and `execution` (list-sourceability) detectors ship in phase 1. `specificity` (§3.2, needs drill-down) and `performance` (§3.6, needs outcome volume) are north-star; until they ship, those two kinds report `unmeasured` on every node.

The record written is **01 §6.2's `Weakness` shape, verbatim** — `{ id, kind, statement, detectedFrom: SourceRef[], detectedAt, signal, threshold, severity, status, repair: RepairAction, resolution }`. This spec's contribution is the two audit keys inside it: `signal` (the actual numbers/records read — auditable, rendered by 02's inspector) and `threshold` (the rule that fired, in plain words). `severity` is **derived by this engine from signal strength** (how far past the threshold the signal sits, normalized 0–100); `null` when a detector doesn't grade. `detectedFrom` is always non-empty (01's seeded-weakness ban).

This engine also computes the read-side `weaknessReport { [kind]: "fired" | "clear" | "unmeasured" }` (01 §6.2) on the same triggers as §3.8 — computed on read, never stored — so 02 can tell a clean node from a blind one.

### 3.1 `evidence` — only founder input supports it

- **Signal:** the node's normalized evidence list + each piece's `source` and the record's `provenance` / `source` label. Read: `hasSourcedEvidence(evidence)` and the set of source origins.
- **Threshold:** fires when `effectiveSolidity === "speculative"` (zero sourced evidence — the structural demotion already computes this), **or** every sourced piece traces only to founder assertion (`source === "founder-stated"` provenance with repo-internal citations that restate the founder's own claim rather than external or observed fact).
- Note: a founder-stated card with real external evidence attached later clears automatically — the flag is recomputed, never sticky.

### 3.2 `specificity` — too broad **(NORTH-STAR — needs drill-down; reports `unmeasured` in phase 1)**

Broadness must be *provable*, not vibed. Two detectors, either fires:

- **Sub-split detector:** at spray/drill time the model may propose candidate sub-splits (§5). The flag fires only when **≥2 proposed children each independently carry sourced evidence** (each child's `effectiveSolidity !== speculative`). That is a derived fact: the parent demonstrably conflates populations that separate sources distinguish. Model proposals with unsourced children never fire the flag.
- **Entrant-spread detector (post-run):** for audience-bearing kinds (buyer/ICP/segment — matched by domain, open list), read the real entrants (`person-store` appearances attributed to paths targeting this node). Threshold: ≥ 8 entrants spanning ≥ 4 distinct org-type/title clusters (clustering = plain string-normalization buckets over stored fields, not a model call) with no single cluster holding ≥ 50% — the audience the card names is measurably not one audience.

### 3.3 `product` — claim not yet supported by product

- **Signal:** the node's `supports` edges resolved against `productTruthStore` (solidity `observed`, i.e. scan-cited), plus the scan's `blindSpots`.
- **Threshold:** fires on any Strategy-domain card whose statement asserts product behavior (operationally: any card with ≥1 `restsOn` ref *intended* at a product truth that resolves to nothing `observed`, or a card the spray marked `claimsProduct: true`) **with zero supporting observed ProductTruth**. Additionally, a scan blind spot of kind `win-event-not-proven` fires `product` on the win-event card itself, carrying the scan's own summary and citations as the signal.

### 3.4 `measurement` — no attribution key to the outcome

- **Signal:** two reads. (a) `contractCompleteness(contract)` from `path-portfolio.mjs` — the four quarters: outcomeKinds, sources, joinKey, successCriteria. (b) the scan's attribution result (`report.attribution.captured`, `report.winEvent.attributionProperties`, blind spots `attribution-not-carried` / `attribution-not-captured`).
- **Threshold:** on a path or run node — fires when no MeasurementContract is attached, or `contractCompleteness < 1` with the missing quarters named in `signal.missing[]`; the joinKey quarter missing always fires (nothing can join back without it). On the win-event / metric card — fires when the scan proves attribution is captured but not carried (the acceptance case: `~/Buffalo-Projects` + `project_created` must produce exactly this flag from the scan alone).

### 3.5 `execution` — no sourceable audience list exists

- **Signal:** for a channel/audience card on a candidate or compiled path: the connector registry (does any wired connector or source node produce entrants for this channel), stored list assets referencing it, and — post-run — the source step's item count from the run ledger (`loadFlow` runs, the same read `board.mjs` does).
- **Threshold:** *pre-run* — fires when no wired source exists: zero connectors, zero list assets, zero prior entrants for the channel. *Post-run* — fires when the path ran and its source step yielded 0 items on the latest run (the run proved the list isn't sourceable). Advisory only, per the invariant: this flag never blocks composition or a run — the gate remains the only checkpoint.

### 3.6 `performance` — replies but no meetings (the funnel stalls) **(NORTH-STAR — needs outcome volume; reports `unmeasured` in phase 1, even though founder-entered ingestion exists)**

- **Signal:** the run ledger + joined outcomes. Reads: per-path staged/approved/rejected tallies (the `tallyChannelRuns` read, generalized to path runs) and the joined `resultStore` outcomes grouped by outcomeKind, ordered by the path's own conversion sequence (whatever stages its conversionPath card names — open, never a fixed funnel enum).
- **Threshold, with a hard volume floor:** fires when stage *k* has ≥ 5 real outcomes, stage *k+1* has 0, and ≥ 7 days have passed since the fifth stage-*k* outcome. Below the floor the kind reports `unmeasured` — a path with 2 sends and no reply is *unmeasured*, not *failing*. No conversion rate is ever invented on thin volume (same honesty rule `outcome-ingest.mjs` already enforces).
- Gate-only variant: ≥ 10 staged items with an approval rate < 20% across ≥ 2 runs fires `performance` on the drafting node — the founder's own gate is rejecting what this node produces (signal = `extractDecisions` counts, already computed in `memory.mjs` / read by `board.mjs`).

### 3.7 Multiple flags, one label

All fired kinds are stored on the node; the **primary label** (the one the shallow card shows per doctrine decision 2) is chosen by fixed precedence — most-lifecycle-downstream first, because later-stage weakness is the more actionable fact: `performance > execution > measurement > product > specificity > evidence`. 02 renders the rest in the inspector.

### 3.8 Recompute triggers

Weakness derivation is a pure read; it re-runs on: spray batch persisted, evidence attached, edge confirmed/challenged, run completed, outcome ingested, contract attached. Cheap enough (plain functions over stores) to recompute the affected nodes synchronously on each event — no cache invalidation cleverness in phase 1.

---

## 4. Repair suggestion generation (PHASE 1: routing + evidence/measurement repairs; specificity repair deferred with drill-down; full drafting north-star)

Repair **routing is CODE** — a fixed table from weakness kind to repair shape, exactly the doctrine's pairing. Repair **content** is MODEL only where drafting is genuinely fuzzy. A repair is always a *suggestion object* — 01 §6.2's `RepairAction`, attached to the `Weakness` record (02 renders it; accepting it may enqueue work). A repair with `compilable: true` executes as a **repair run** (04 §3.1): staged like any run, through the same wall, and its flag-clear receipt writes 01's `resolution`. Nothing a repair produces reaches outside without 04's gate, and no repair auto-executes. The `narrow` (specificity) repair verb is **deferred** with drill-down (§5 is north-star, per 00 §Scope).

| Kind | Repair (routing = CODE) | Content generation |
|---|---|---|
| evidence | **find evidence** — a scoped research task | MODEL: re-invoke `gtm-research-market` scoped to one record via a new `RESEARCH_NODE_PROMPT` ("settle these openQuestions for this one statement; return evidence or report none found"). Host merges returned evidence; solidity recomputes; flag clears or stands. |
| specificity **(NS)** | **narrow / drill down** — surface §5's decomposition with the sub-split children pre-loaded | already generated (§3.2 used them); zero new model calls. Deferred with drill-down and the detector itself |
| product | **add product proof / patch** — mint a product-gap card, edge `blocked_by` from the flagged claim | MODEL drafts the patch spec (what the product must do for the claim to be true), reusing the `feature-builder.mjs` / microproduct path; building/applying is 04's gated territory |
| measurement | **patch measurement** — name the missing contract quarters (CODE, from `signal.missing[]`); propose the concrete wiring from the scan's own attribution citations (CODE — the scan already knows where source is captured and where the win event is emitted) | MODEL only for the patch diff text if the founder asks for one; the *recommendation* is deterministic (the scan's existing `recommendation` string is the seed) |
| execution | **alternate channel / source the list** — CODE first: query `marketObjectStore` for other channel records with solidity ≥ `researched`, rank by `solidityRank` + existing connector coverage, present top 3 as swap candidates | MODEL only when code finds none: a lean `gtm-ideate-channels`-style call proposing channels, each returned with evidence refs that then pass the normal demotion |
| performance **(NS)** | **rewrite message / change offer** — route to §6 variant generation on the node feeding the stalled stage (identified by CODE: the last generate/agent node upstream of the stalled outcome kind, the same `draftStep` walk `board.mjs` does) | MODEL: the variants themselves (§6). Deferred with variants and the detector itself |

---

## 5. Drill-down decomposition (NORTH-STAR — deferred entirely, per 00 §Scope; specced here so the schema settles)

Doctrine view: expand a node into its decomposition tree (ICP → segment → persona → title → trigger state → exclusion).

- **MODEL:** `DRILL_DOWN_PROMPT` (`brain/src/graph-intelligence/drill-down.mjs`), lean shape. Input: the node, its evidence, and the store grounding pack. Output: 3–7 children, each `{ kind, statement, restsOn, evidence[], differentiator }` — the differentiator is one clause naming what splits this child from its siblings. The prompt requires each child to either cite existing record ids or attach new sourced evidence; it is told plainly that unsourced children will be labeled speculative by the host and cannot fire specificity repairs.
- **CODE:** normalize children through the store (demotion applies), mint nodes, draw `belongs_to` edges to the parent (structural, §2.1), derive each child's `solidity` (01's evidence label), run §3 on each child, dedup against existing children on re-drill (§1.4 identity merge).

### 5.1 The four selectors (all CODE — pure functions over child signals)

Rendered by 02 as one-tap sorts; each is a deterministic score, reusing the `computeRankingSignals` machinery per child (a child's `restsOn` resolves exactly like a path's):

- **strongest-evidence** — max mean solidity strength over the child's resolved records (the `evidenceStrength` signal); ties broken by the read-time source count.
- **fastest-to-test** — the existing `speedToTest` derivation: `(channelReachability + productReadiness)/2 × (1 − 0.4 × complexity)` computed over the child's records.
- **highest-upside** — the existing `upside` derivation: mean stored confidence over the child's prize-facet records (buyer/offer/valueProp), evidence strength as fallback.
- **weirdest** — max distinctiveness from siblings: run the sibling set through the `defaultDistinct` scorer pairwise and pick the child with the lowest mean similarity to the others; when the scorer binary is unavailable (`available: false`), fall back to token-set Jaccard distance over statements (plain function). Never a model self-report of "novelty".

Every selector's inputs are stored signals, so an all-speculative decomposition honestly sorts everything near zero rather than inventing a spread.

---

## 6. Variant generation (NORTH-STAR — deferred entirely, per 00 §Scope; rides the performance repair, which is also north-star)

Message/offer variants land as **child nodes** (`derived_from` + `belongs_to` the parent), never as silent replacements — swapping a variant into a path is a founder action (02), and a swapped-in variant on a compiled path goes through 04 as a new run.

Reuse the `composeIdeas` loop (`ideation.mjs`) wholesale — it already has the required shape:

- **MODEL, generate:** `GENERATE_VARIANTS_PROMPT` — the parent's statement, its evidence, the target ICP/trigger records it `targets`, and *the performance signal that triggered this* ("5 replies, 0 meetings in 9 days") packed as data. Angles proposed per the existing angle-derivation doctrine so variants differ in kind, not wording.
- **MODEL, separate critic:** the bar function is a distinct call (the generator never grades its own work — `composeIdeas` enforces `generate !== bar` structurally).
- **CODE:** `defaultDistinct` dedup with the one-regen HUDDLED rule; normalization; evidence inheritance (a variant inherits only the parent's `restsOn` refs it still genuinely rests on — the prompt must re-declare them, code resolves them); §3 runs on each variant (a variant claiming new product behavior gets a `product` flag immediately).
- **Taste (harness rule 3, mandatory):** the generate call consults `get_taste` — gate decisions, edge confirms/challenges, prior variant picks from `memory.mjs` — injected as data. A visual variant (page, deck) must also consult `get_design`. This is the standing harness contract, not optional.

---

## 7. Strongest-path recommendation (PHASE 1)

Answers "show me our **strongest current testable path**" — named honestly: with only product and market sprayed, the recommendation is a strategy-level bet worth testing, never a guaranteed path to revenue (00 locked decision 1). **Entirely CODE** — doctrine hard part 1 and the existing §2.4 guard both ban a model guessing a rank. The model's only contribution happened upstream: the cards and edges. New module `brain/src/graph-intelligence/path-ranking.mjs`, extending `path-portfolio.mjs` (not replacing it — 05 maps the fold).

### 7.1 Candidate enumeration (CODE)

Two sources, merged:

1. **Stored bets** — `gtmPathStore` paths (the portfolio generator's output) mapped onto graph routes via their `restsOn` refs. These exist whenever the portfolio has run and are the richest candidates.
2. **Graph walks** — routes from any Strategy-domain node (wedge/offer/positioning) forward along `leads_to` / `targets` / `uses` / `produced` edges toward any Pipeline/Customer-domain node or revenue-kind outcome. Bounded beam search: depth cap 8 hops, beam width 8 kept by partial score, judgmental edges below confidence 0.4 not traversed (they still render; they just don't carry a recommendation). This keeps enumeration linear-ish in graph size and cannot blow up on a dense sprayed graph.

Dedup: two candidates sharing ≥ 80% of node ids collapse to the higher-scoring one.

### 7.2 Scoring (CODE — the seven signals, reused verbatim)

Per candidate, `computeRankingSignals` runs with the path's node set as the `restsOn` resolution (each node contributes its own records): `evidenceStrength · productReadiness · channelReachability · measurementReadiness · speedToTest · upside · founderFit`, combined by `compositeRank` under `SIGNAL_WEIGHTS`. Then two graph-native adjustments:

- **Weakness penalty:** `adjusted = composite × Π(1 − penalty(kind))` over the path's fired flags — `performance 0.30 · execution 0.20 · measurement 0.15 · product 0.15 · specificity 0.10 · evidence 0.10` (constants in code, tuned in tests). Multiplicative, so a stack of flags compounds and a flagless path is untouched.
- **Outcome reweighting (the Learning loop):** once real outcomes exist, evidence yields to results:

  ```
  score = prior × w + outcomeScore × (1 − w),   w = k / (k + n),  k = 5
  ```

  `n` = joined outcomes attributed to this path (via `joinKey`, `outcome-ingest.mjs` — ingestion itself is 04's spec; this spec only consumes the joined records). `outcomeScore` = stage-depth-weighted attainment over the path's own conversionPath stages (deeper real outcomes count more; weights normalized over the stages the path actually names — no fixed funnel enum). Gate decisions feed in as the early, cheap outcome: approval rate on the path's staged items enters `outcomeScore` at the shallowest stage weight. Fresh path: `w = 1`, pure prior. Well-run path: outcomes dominate. Nothing is ever seeded.

### 7.3 Output contract (what 02 renders)

```
{
  rankedPaths: [ { pathId, nodeIds, edgeIds, score, signals, weakestLink } ],  // top K
  highlighted: [top 1],             // PHASE 1: exactly one lit (00 locked decision 1).
                                    // North-star: top 1..3 once multi-path chips ship —
                                    // never all paths equally (doctrine lens rule)
}
```

`weakestLink` is the path's minimum-signal node with its primary weakness label — the "here's where it's soft" the cold open leads with. **Honesty at the bottom:** with nothing scoreable (no records at all), the recommendation returns an empty ranking and a plain-words reason (`"scan found no product truths and research returned nothing"`) — the cold-open guarantee (§1.6) makes this near-unreachable, but when reached it is stated, never faked. **Ties:** in phase 1 a tie at the top still renders top-1 (deterministic tiebreak in code — stable order over score, then evidence strength, then id); ties break to highlighting *both* only when multi-path chips ship (north-star, the `withArmSignals` leader rule).

Path *compilation* — the run model, staging, the gate — is 04 (`run-compile.mjs` is its spine). The **model call** that decomposes a path at compile time is this spec's: §8.

---

## 8. Compile decomposition (MODEL) — PHASE 1

04 owns the run model, the `RunPlan` shape, staging, and the wall; this section owns the **judgment call inside compile** — which sections a path produces and their content (04 §1.3 and §2.2 cite this). Note the honest baseline: `run-compile.mjs` today stages ONE `planned-action` item; the seven-section decomposition is **new model work on its existing spine**, not a reuse of an existing decomposition engine.

- **Prompt:** `COMPILE_DECOMPOSE_PROMPT` (`brain/src/graph-intelligence/compile-decompose.mjs`), lean shape where possible; invoked by 04's `compileRunFromPath` through the injectable composer seam.
- **Grounding, packed as data:** the path's actual node chain (statements, types, solidity), its `restsOn` refs resolved to stored ProductTruth/MarketObject records (`buildCompileGrounding`, generalized to a node chain), the connector registry (what can actually read/act), and the mandatory `get_taste` consult (gate decisions, edge confirms/challenges); a visual asset section additionally consults `get_design` (harness rule 3).
- **Output:** the `RunPlan` sections per 04 §1.3 — audience, assets, tasks, patch, measurement, gates, execution — each section optional per 04's rules; the model proposes, code normalizes and binds.
- **One-gate-per-action-kind instruction:** the prompt instructs the composer to place **one gate per outward action kind** (send / publish / patch / CRM), never one monolith gate over everything (04 §2.2) — the founder must be able to approve the sends and reject the patch independently.
- **CODE after the call:** section normalization, staged-item minting with joinKeys (04), `assertGateWall` re-assertion, model confidences (0–1) to `payload.modelConfidence` only. A missing/unbindable measurement contract does **not** abort here — it stages with a Measurement weakness flagged (04 §1.4, the gate stays the only checkpoint).

---

## 9. Utterance routing — the command bar's brain (PHASE 1 for the P1 utterance classes)

02 §11 owns what the bar looks like and that its output is always a graph act; this section owns how an utterance is interpreted. The governing split applies:

- **CODE first — nav and lens verbs.** A small deterministic matcher (the existing `isCanvasCommand` discipline) catches camera/focus verbs ("show me the weakest part", "zoom out"), lens names ("weakness", "evidence"), and the compile verb on a lit path. These never spend a model call — a routing table answers.
- **MODEL — one lean call for everything else.** Questions ("why is this the strongest path") and edit/repair requests (NS) go through one lean no-tool call (`ROUTE_UTTERANCE_PROMPT`, `brain/src/graph-intelligence/utterance-router.mjs`): grounding is the current graph slice (lit path, selected node, lens) packed as data; output is a typed act — `{ act: focus | lens | explain | propose | compile, target ids, one short plain-words note }` — never freeform prose routed to a chat wall. Explanations must cite node/edge ids the UI can light; proposals return proposal-ghost patches through 01's typed mutations (edit class is NS, per 02).
- Unknown/unroutable utterances answer honestly with the one-line "here's what I can do" card — never a guessed mutation.

---

## 10. Module & prompt map (spec-level names)

```
brain/src/graph-intelligence/
  spray.mjs            SPRAY_STRATEGY_PROMPT, buildSprayGrounding, sprayGraph()      [new]
  edge-inference.mjs   INFER_EDGES_PROMPT, inferEdges(), validateEdges(), dirtySet() [new]
  weakness.mjs         detectWeakness(node, signals), weaknessReport() — detectors + precedence
                                                                                     [NEW module + NEW API surface; adopts
                                                                                      board.mjs's derivation discipline,
                                                                                      not its functions]
  compile-decompose.mjs COMPILE_DECOMPOSE_PROMPT (§8), invoked by 04's compileRunFromPath [new]
  utterance-router.mjs ROUTE_UTTERANCE_PROMPT + the CODE verb table (§9)             [new]
  drill-down.mjs       DRILL_DOWN_PROMPT, drillDown(), selectors{}                   [new, NS]
  variants.mjs         GENERATE_VARIANTS_PROMPT (+ critic), via composeIdeas          [new, NS, thin over ideation.mjs]
  path-ranking.mjs     enumerateCandidates(), scorePath(), recommend()               [new, extends path-portfolio.mjs]

reused as-is:  scan.mjs · evidence.mjs (ladder + demotion) · gtm-store.mjs (stores + normalize)
               market-research.mjs + ~/.claude/agents/gtm-research-market.md
               ideation.mjs (composeIdeas, defaultDistinct) · memory.mjs (decisions → taste)
               path-portfolio.mjs (computeRankingSignals, SIGNAL_WEIGHTS, contractCompleteness)
               outcome-ingest.mjs (joinToRun — consumed, owned by 04)
folds (05):    board.mjs derivation DISCIPLINE → weakness.mjs (new API; board.test.mjs's
               never-seeded cases port as the regression floor); the bets-map ranking → path-ranking.mjs
```

All rented calls go through `agent-bridge.mjs` (`runClaudeQuery` for lean no-tool calls; `createClaudeAgentInvoker` for the tool-using research agent). Every prompt lives as an exported constant or an editable `~/.claude/agents/*.md` artifact — never inlined host logic.

## 11. Phase 1 vs north-star (marks match 00 §Scope — the single source)

| Capability | Phase 1 (ships to the first stranger) | North-star |
|---|---|---|
| First spray | §1 — staged cold open; Product (scan) + Market (research) + model-proposed Strategy cards; Audience/Assets/Pipeline/Customer/Learning never sprayed | continuous re-spray on repo change / market events |
| Edge inference | full (§2) — structural + one judgmental pass + incremental dirty-set | challenge-aware re-argumentation, cross-project edge priors |
| Weakness | four detectors: evidence, product, measurement, execution (§3); specificity + performance report honest `unmeasured` | specificity + performance detectors; tunable thresholds learned from founder challenge history |
| Repairs | routing table + evidence & measurement repairs end-to-end; others surface as suggestion cards; compilable repairs run per 04 §3.1 | every repair one-tap enqueueable with drafted content |
| Compile decomposition | §8 — the RunPlan model call with one gate per action kind | richer section breadth as the composer matures |
| Utterance routing | §9 — CODE nav/lens verbs + lean MODEL call for questions | edit/repair utterances (proposal ghosts) |
| Drill-down | — (deferred, §5) | any node, recursive trees, selector pinning |
| Variants | — (deferred, §6) | on-demand on any generative node, taste-pretuned |
| Strongest path | full (§7), top-1 highlight only; outcome reweighting hooks live off founder-entered ingestion | multi-path chips (top 1–3), portfolio-level budget allocation, cross-company learning priors |

## 12. Verification

- Weakness detectors → new `brain/test/weakness.test.mjs`: each phase-1 kind gets a fires / doesn't-fire / honest-`unmeasured` triple from fixture stores; the deferred kinds (specificity, performance) must report `unmeasured`, never fire; the anti-seed case (empty stores → zero flags, zero scores, no fakes) is mandatory.
- Path ranking → extend `brain/test/engine.test.mjs` shape: score monotonicity (adding sourced evidence never lowers a path; a fired flag never raises one), tie → deterministic top-1 in phase 1, empty → honest reason string.
- Spray/edges → normalize-boundary tests: unsourced model output lands speculative; unresolvable `restsOn` stripped; dedup merges; anti-cage extension covers the new node kind/type vocabularies (no closed node enum anywhere); the edge union stays closed — an unknown edge type routes to nearest-known/`derived_from` and is never stored as new; an edge with empty basis is rejected.
- Acceptance case (repo standard): scanning `~/Buffalo-Projects` with `project_created` must yield the `measurement` flag on the win-event card via §3.4, sourced from the scan's own blind spot — proving the flagship weakness derives from the scan alone, model absent.
