# 04 — Runs and the Wall

**Spec 4 of 5** · cites `00-DOCTRINE.md` (which wins on conflict) · siblings: `01-object-graph` (node/edge schema), `02-canvas-interaction` (how any of this renders), `03-intelligence` (generation, weakness detection, scoring math), `05-migration` (what folds/cuts).

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

This spec owns the right half of the interaction loop: **compile path into a run → inline gate → staged execution → outcome → learning updates the graph**. It does not design the graph schema (01) or the generation/inference logic (03). It defines the run model, the decomposition contract, the gate as an action-level approval object over the existing gate primitive, the autonomy ladder, staged execution, the measurement contract, and outcome ingestion.

**Phase-1 slice (marked § by §, matching 00 §Scope):** compile → inline gate → staged actions → measurement contract (flagged-repairable when unbindable, §1.4) → founder-entered outcome ingestion (§6.4) → repair runs (§3.1). **Deferred to north-star:** outcome ingestion through connectors, promotion scheduling, automated execution through every connector.

---

## 0. Standing invariants (restated, binding)

These are not new; they are the existing harness this spec builds on. Every section below must hold them.

1. **The founder gate is the ONLY contract checkpoint.** No pre-gate node blocks a run on item count or field names. At run time, `relaxPreGateContracts` (`brain/src/source-entry.mjs`) zeroes `accepts`/`emits`/`minItems` on every pre-gate node, and `relaxGateContracts` keeps the gate and post-gate execute from re-litigating field names after a human approved. Contracts stay advisory (UI hints), never a dead-end. This rule carries into the graph world unchanged — **with no exceptions**: nothing in the new run model may add a blocking pre-gate check, and compile does not block either. A missing or unbindable measurement contract is a **repairable Measurement weakness** flagged on the path (§1.4, §5) — the run still compiles and stages, and the flag is repairable before or at the gate. (This changes today's `run-compile.mjs` refusal behavior; see §1.4.)
2. **Every outward action is gated.** `assertGateWall` (`brain/src/workflow-composer.mjs`) proves every `execute` node has a founder gate upstream on **every** path (all-paths semantics — one ungated branch fails the wall). It runs at compose time, again on persistence, and again when a promoted motion re-stages (`promote-motion.mjs` → `runMotionOnce`). It is the single wall predicate. **Do not write a second one.**
3. **Nothing sends, publishes, patches, or charges without explicit founder approval.** The default execute connector stages locally (`connectors/execute/local.mjs`). Runs stage with `status: "staged"` and a pending gate.
4. **Scanning and build stay read-only up to the gate.** Build may create a local branch/worktree but stops before commit, push, deploy, or PR. The one exception is the gated microproduct deploy, which requires **two** founder authorizations (gate approval **plus** an explicit deploy confirmation — a normal approval does not ship it; `operator-runtime.mjs` ~L1146).
5. **Autonomy is set ONLY by explicit founder promotion.** The typed graph path rejects forging `autonomy`/`blessedPattern` onto a gate node (`assertNoForgedAutonomy`, `graph-operations.mjs`).
6. **Anti-cage.** `protects` labels, outcome kinds, outcome sources, and review-payload kinds defined below are **canonical spellings, not closed enums** — the same pattern as `OUTCOME_SOURCES` in `outcome-ingest.mjs`. Ingestion and staging accept any label; nothing branches on a closed set. (Guarded by `brain/test/anti-cage.test.mjs`.)

---

## 1. Compile-a-path: path → run **(phase 1)**

### 1.1 The trigger

The founder selects a highlighted path on the graph (a lit route through Strategy → Audience → Assets nodes, per 02) and hits **Compile run**. That is the entire founder input. *Founder chooses the bet; Drover decomposes the work.* No goal launcher, no compose wizard — the path IS the goal statement, because the path's nodes already carry the buyer, channel, offer, message, and proof (01's node types).

### 1.2 The spine is `compileRunFromPath` — extended, not replaced (and the extension is real work)

`brain/src/run-compile.mjs` implements the correct **spine**: resolve path → check the measurement contract → ground on the ProductTruths and MarketObjects the bet rests on (`buildCompileGrounding`) → reuse `composeGraphForChannel` to design the executable topology (asserting the wall) → re-assert the wall → persist a Run with `status: "staged"` and a pending gate. Keep all of it.

Two honest deltas against today's code:

1. **Decomposition is NEW, not reused.** Today `stageItemsForRun` stages exactly ONE `planned-action` item (the bet's own fields). There is no existing decomposition engine to reuse — this spec specifies **extending** compile into the seven-section `RunPlan` (§1.3), with the decomposition *judgment* made by 03's compile-decomposition model call (03 §8) on the richer input the graph provides (the actual node chain, not a bet summary).
2. **The contract refusal becomes a weakness flag.** Today `compileRunFromPath` refuses to stage without a bindable contract. Under this spec, that check no longer aborts: it flags a repairable Measurement weakness instead (§1.4), preserving invariant 1 — the gate is the only checkpoint.

### 1.3 The decomposition contract

Compiling a path produces a `RunPlan` with up to seven sections. Which sections a given path produces is decided by the composer per path — that judgment is 03's compile-decomposition model call (03 §8, `COMPILE_DECOMPOSE_PROMPT`), including the one-gate-per-action-kind instruction; the **shapes** are fixed here so the gate, the graph projection, and measurement can rely on them. Every section is optional except `gates` (required when any execute step exists) — a content-only path has no product patch; a patch-only path has no audience. `measurement` is required *for a clean compile*: when it is missing or unbindable the run still compiles and stages, carrying a repairable Measurement weakness (§1.4, §5).

```
RunPlan {
  pathId                        // the compiled path (01's path node id)
  audience:   AudienceSection?  // WHO: resolved accounts/contacts/segments — a concrete, reviewable list
  assets:     AssetSection[]    // WHAT: emails, pages, posts, decks — real drafts, not placeholders
  tasks:      TaskStep[]        // HOW: the executable topology (agents/skills/code steps), = compiled nodes+edges
  patch:      PatchSection?     // product/measurement patch — a diff, built locally, never committed
  measurement: MeasurementContract?  // §5 — bound at compile when bindable; when missing/unbindable
                                     // the run still stages, flagged with a repairable Measurement
                                     // weakness (§1.4). Never a compile block.
  gates:      GateBinding[]     // REQUIRED when any execute step exists — §2; ≥1 per outward action batch
  execution:  ExecutionStep[]   // the outward steps, each naming its action label and connector
}
```

Mapping to what exists:

- `tasks` **is** the `{ nodes, edges }` that `composeGraphForChannel` returns — the open step kinds (`agent`/`skill`/`code`/`mcp`) plus category nodes. No new step taxonomy.
- `audience` and `assets` are the run's **staged items**, partitioned by shape. Today's single `planned-action` item generalizes: an audience section stages items whose reviewable content is a list; an asset section stages items whose reviewable content is copy. Every staged item still gets a durable `joinKey` minted by `runStore` (`gtm-store.mjs` — `genId("join")` when none supplied). **The joinKey rule is load-bearing:** it is the attribution key (§5).
- `patch` is a locally-built diff (branch/worktree allowed, commit forbidden — invariant 4). Its staged item's reviewable content is the diff itself.
- `execution` steps are `execute`-category nodes; each carries an **action label** (§2.2) derived from its connector + config.
- `gates` are gate-category nodes placed by the composer and enforced by `assertGateWall`; §2 defines their approval-object projection.

### 1.4 Compile-time checks (loud, in code, before staging)

1. **No path, no run** — compile needs a `pathId` or an injected path. (Unchanged from `run-compile.mjs`.)
2. **No bindable measurement contract → compile WITH a flagged, repairable Measurement weakness — never a refusal.** `isBindableContract` (at least one of: an outcome kind to watch, a source, a joinKey scheme, a success criterion) still runs, but a failing check no longer blocks staging — that would make compile a second checkpoint and break invariant 1. Instead the run compiles, stages, and carries an open *Measurement* weakness on the path (03's kind, with the `patch_measurement` repair attached), stated in founder register ("This path has no measurement plan yet…"), visible on the run and at the gate, repairable before or at the gate. Compile never invents a contract silently.
3. **A topology that could send ungated never compiles** — `assertGateWall` throws inside `composeGraphForChannel` and is re-asserted on the compiled result. (Unchanged; this is the wall, not a contract.)

### 1.5 What compile does NOT do

- It does not re-ideate or second-guess the path. The bet was chosen; grounding is the path's own `restsOn` refs resolved to stored truth records, with fallback to the project's full truth picture (existing `buildCompileGrounding`).
- It does not execute anything. Output is a staged Run at a pending gate. Compile is the last model-driven step before human judgment.
- It does not write strategy nodes onto the graph. It writes Run-domain objects only (§4).

---

## 2. The inline gate **(phase 1)**

### 2.1 One primitive, two faces

There is exactly **one** gate primitive in the system: the gate node, executed by `connectors/gate/default.mjs`, walled by `assertGateWall`, reviewed via `gateReviewForRun`. The graph redesign adds a **projection** over it — the action-level approval object — not a second mechanism. Structurally:

```
Gate {
  protects:         send_emails | publish_page | apply_patch | update_crm | <any open label>
  requiredApproval: founder            // always; never another value
  reviewPayload:    copy | list | diff | action-summary
}
```

- `protects` is **derived, never authored**: it is the action label of the execute node(s) immediately downstream of the gate node, computed from their connector + config (`gmail` → `send_emails`, `deploy`/`http`+page → `publish_page`, a patch executor → `apply_patch`, a CRM-shaped `mcp`/`http` step → `update_crm`; anything else keeps its own honest open label). Deriving it from the topology means the label can never lie about what the gate is holding back — the same shape-is-truth rule as `sourceMode()`.
- `requiredApproval: founder` is a constant restating invariant 5. (Team roles: releasing a gate additionally requires an owner/approver team role — the existing release guard in `operator-runtime.mjs` ~L559–584. That guard answers *who may click approve*; it never substitutes for the founder-level approval itself.)
- `reviewPayload` is derived from the staged items' shape: asset items → `copy`, audience items → `list`, patch items → `diff`, everything else → `action-summary`. Open set; the gate renders whatever was staged (the §2.2-open-shapes rule `gateReviewForRun` already proves — it carries `item` through untouched and adds only a stable `actionId` + pending status).

### 2.2 Scoped to the action, never a reasoning node

The gate is an approval object on the **action or action batch**. Visually (02 renders this) it sits inline on the edge where internal reasoning becomes external action:

```
Path → Run → [Gate] → Send / Publish / Patch / CRM update
```

Rules:

- **One gate per outward action batch.** A run whose plan both sends emails and applies a patch carries (at least) two gate bindings — one protecting `send_emails` over the copy payload, one protecting `apply_patch` over the diff payload. The founder can approve the sends and reject the patch independently. `assertGateWall` already permits multiple gates; the composer is instructed to place one per action kind rather than one monolith — that instruction lives in 03's compile-decomposition prompt (03 §8).
- **Never a standalone reasoning node.** A gate with no execute descendant is a composition error; the normalizer must not emit one and 05 migrates any existing free-floating gate review surface into this inline form. The gate does not appear in the reasoning graph's causal structure (no `supports`/`weakens` edges touch it) — it exists only on Run → action edges.
- **The monolith gate-review screen dies** (doctrine, "what gets gutted"). Review happens on the gate object in place; 02 owns the rendering, this spec owns the payload (`gateReviewForRun`'s output, extended with `protects` and `reviewPayload`).

### 2.3 Decisions and receipts

Per-item decisions are unchanged from the gate connector: `approve` / `reject` / `edit` (edited text written back onto the item's own source field via `itemReviewField`, so downstream executors send the founder's words). Decisions persist:

- onto items (`approvalStatus`, `editedFrom`),
- into the run ledger (the taste signal `memory.mjs` reads back),
- and — new — as a **receipt on the graph**: an approved gate keeps an "Approved · date" stamp visible on its edge (02 renders; the data is the run's `gateState` plus per-item decisions, already stored). A decision is never silently erased by a re-run.

### 2.4 Batch review

Pattern approval already exists (`applyPatternApproval` via `node.runtime.pattern`): the founder reads a sample, blesses this run's batch, and only exceptions (low confidence, flagged, no body) hold for individual review. This is the per-run form of the ladder in §6 and ships as-is.

---

## 3. Staged execution — never auto-sent **(phase 1)**

A run past compile is `status: "staged"`, `gateState: { status: "pending" }`. Execution semantics:

- **Pre-gate steps run freely** (research, enrich, draft, build) under the relaxation rules (invariant 1). They produce; they never touch the outside world. Build steps stop at the read-only line (invariant 4).
- **The gate pauses the run.** The runner returns `pendingGates`; the run sits at `waiting_for_gate`. Nothing downstream executes.
- **Post-approval, execute steps run — and the default is still staging.** `connectors/execute/local.mjs` stages the approved artifacts locally. Real outward connectors (`gmail`, `http`, `deploy`) fire only for approved items, and only where the founder wired that connector. Phase 1 ships with **staged-only execution as the default for every action kind**: approve at the gate → the send/publish/patch is staged as a ready-to-fire artifact the founder releases through the connector. Automated execution through every connector is deferred (north-star); wiring a live connector per pipeline is a founder configuration act, not a compile decision.
- **The microproduct deploy keeps its double lock**: gate approval + explicit deploy confirmation, and there is no deploy/approve tool on the agent surface (`operator-runtime.mjs` ~L1058). Composition and runs cannot reach it.
- **Partial approval executes partially.** Approved items flow, rejected items stop, pending items hold the gate open. No all-or-nothing batch semantics.

### 3.1 Repair runs **(phase 1, for the shipped repair kinds)**

A repair whose `RepairAction.compilable` is true (01 §6.2) executes as a **run like any other** — compiled through the same spine, staged, and held at the same wall; there is no repair side-channel around the gate. A repair run that never touches the outside world (a scoped research task settling an Evidence weakness) still stages its findings for visibility; one that does (a measurement patch to the repo) carries its gate binding like any outward action. When a repair run completes and the detector re-reads clean signal, the flag clears **with a receipt**: the weakness `status` moves to `repaired` and 01's `resolution` is written (`by: "repair-run"`, `ref` = the repairing run/node). Founder-dismissed flags write the same `resolution` shape with `by: "founder"`. Repair *suggestion* generation and routing are 03 §4; this section owns only that execution and receipts flow through the standard run machinery.

---

## 4. The run model on the graph **(phase 1 for projection; node/edge schema is 01's)**

A Run is a **Runs-domain object** (doctrine's palette: path, run, gates, agents, execution plan, success criteria). Storage stays `runStore` (`gtm-store.mjs`): `{ id, projectId, pathId, steps, edges, gateState, measurementContract, measurementContractId, items[joinKey], status }`. The graph does not get a second run record — the graph **projects** the stored run (the canvas-is-a-projection rule).

How a run maps back onto the graph, using 01's edge vocabulary (`derived_from · targets · uses · measured_by · produced · promoted_to · updates`):

| Graph element | Backing state | Edge |
|---|---|---|
| Run node | `runStore` record | `run —derived_from→ path` |
| Audience linkage | the run's list-shaped staged items | `run —targets→ segment/accounts` |
| Asset linkage | the run's copy-shaped staged items | `run —uses→ asset` (assets are also first-class Asset nodes per 01) |
| Gate checkpoint | gate node + `gateState` + decisions | rendered **on** the run→action edge (§2.2), not as a causal node |
| Measurement | the bound contract | `run —measured_by→ measurement-contract` |
| Outcomes | Results joined on `joinKey` | `run —produced→ outcome` (§6) |
| Promotion | RepeatableMotion | `run —promoted_to→ motion` (§7, deferred) |

Run status is honest, visible metadata (staged / running / waiting_for_gate / executed / measured), derived from `gateState` and the results ledger — never seeded. The run's internal `steps`/`edges` (the compiled topology) are the run node's **drill-down decomposition** (02's drill interaction), not top-level graph nodes: at graph altitude a run is one node; opened, it shows its task topology. This keeps the reasoning graph clean of execution plumbing while losing nothing.

Edges in this table are machine-drawn at compile/ingest time from stored refs (`pathId`, `joinKey`, `measurementContractId`) — deterministic lookups, not model inference, so they need none of 03's machinery and can never disagree with the stores.

---

## 5. The measurement contract **(phase 1)**

The attribution key that joins a run to its outcomes. Shape (existing, `gtm-store.mjs` `measurementContractStore`):

```
MeasurementContract {
  outcomeKinds:    string[]   // open — reply, meeting, signup, pilot, revenue, <anything>
  sources:         string[]   // open — connected-account, product-event, founder-entered, <anything>
  joinKey:         string     // the durable key scheme; every staged item carries a minted joinKey
  successCriteria: string     // free text; NEVER machine-evaluated into a success verdict
}
```

Binding rules:

1. **Bound at compile when bindable; flagged when not** (§1.4). A run with a bindable contract binds it before anything could execute. A run without one still stages — carrying an open, repairable *Measurement* weakness ("no attribution key to the outcome") visible on the run and at the gate, so the founder approves knowing the run is unmeasured or repairs it first. The gate stays the only checkpoint (invariant 1); the weakness flag, not a compile block, is how unmeasurability is made loud. The acceptance case (`~/Buffalo-Projects` + `project_created` → a *proven, reported* attribution gap) stays honest either way. It projects onto the graph as a `measurement.contract` node (01), the target of the run's `measured_by` edge.
2. **Visible at the gate.** `gateReviewForRun` already carries `measurementContract` in the review payload — the founder sees how the run will be measured at the moment they approve it. Keep this; 02 renders it on the gate card.
3. **One key.** Every staged item's `joinKey` is minted by the run store if not supplied; a Result must carry a joinKey (`normalizeResult` throws without one). The join is a lookup (`joinToRun`), never a model call.
4. **Re-runs mint fresh keys.** `templateFromRun` strips joinKeys so a promoted re-run's results never collide with the source run's. Preserve this in any refactor.
5. **`successCriteria` stays free text for the founder to judge.** The outcome report never converts it into a pass/fail verdict (the honest-measurement guard). Path *scoring* from observed outcomes is 03's math.

---

## 6. Outcome ingestion and the learning loop **(phase 1: founder-entered only; full ingestion deferred)**

### 6.1 The flow (all machinery exists in `outcome-ingest.mjs`)

```
outcome (joinKey, kind, value, source)
  → joinToRun (lookup on joinKey)
  → Result record (ties run/path/asset/message/channel/buyer/offer)
  → Learning record (structural half ‖ identifying half, split at write time)
  → graph: Outcome node + run —produced→ outcome edge
  → path score / belief update  (03's math; §6.3)
```

Rules that carry over unchanged:

- **Ingest never acts.** Recording what already happened sends/publishes/charges nothing (invariant: the wall is untouched by ingestion).
- **Open labels.** Any source label, any outcome kind ingests (`OUTCOME_SOURCES` are spellings, not a gate).
- **Honest misses.** An outcome whose key matches nothing staged is captured with `joined: false`, reported apart (`unjoinedResults`) — never silently attributed, never dropped.
- **Unmeasured is unmeasured.** `outcomeReport` counts staged-but-unmeasured items as a real number; no invented conversion rates. "Which path worked" is ordered by observed outcomes.

### 6.2 Outcome nodes on the graph

Each Result projects as an **Outcome node** (Pipeline/Customer domain per its kind — reply, meeting, signup, pilot, revenue, activation, churn) with a `produced` edge from its run and, transitively, evidence weight on the path it came from. The doctrine's card lifecycle bottoms out here: **Outcome (truth)** — the only altitude where cards are facts rather than bets. Unjoined results project as loose Outcome cards with no `produced` edge (visibly orphaned, repairable by the founder attaching a joinKey — a graph mutation through the typed path, 01).

### 6.3 What updates beliefs and path scores

This spec defines the **data flow**; 03 defines the math. Two channels:

1. **Automatic, structural:** every Result writes a Learning (`writeLearningForResult`) whose structural half (channel, outcome kind + value, joined?) feeds path scoring and the *Performance* weakness signal ("replies but no meetings" is computable directly from a path's outcome-kind tallies). Weakness derived from these real signals, never asserted (doctrine).
2. **Founder-adjudicated, semantic:** belief write-back stays a founder act — `applyExperimentVerdict` (`belief-writeback.mjs`) is the only hand that crystallizes a hypothesis into a Claim, strictly post-gate, with the one-way provenance valve (evidence-free derived beliefs self-demote to speculative). Outcomes inform the verdict; they never auto-write beliefs. **Do not automate this in phase 1 or after** — the founder deciding what a result *means* is the taste loop, not a bottleneck.

### 6.4 Phase-1 boundary

Phase 1 ships: the measurement contract bound at compile, joinKeys on every staged item, **founder-entered outcome ingestion** (`ingestOutcome`/`ingestBatch` behind the existing server route), the honest `outcomeReport`, and Outcome nodes projected onto the graph. **Deferred:** connected-account ingestion (inbox/CRM watchers), product-event ingestion at scale, and any automatic re-scoring cadence. The deferred part is connectors and scheduling, not model — the join and the ledger are done.

---

## 7. The autonomy ladder **(phase 1: exists and surfaces on the gate; promotion *scheduling* deferred)**

### 7.1 The ladder

`draft → trusted → autonomous`, per pipeline (code: channel), stored on the gate node's config as `autonomy` + `blessedPattern`.

- **draft** (default): every item holds for individual founder review.
- **trusted / autonomous**: the founder has blessed a pattern once; the gate connector auto-applies it — clean items auto-clear, **exceptions still escalate** (low confidence, flagged, missing body — `applyPatternApproval`'s existing exception predicate) and hold for individual review. The wall graduates; it never disappears.

The distinction between trusted and autonomous is *what else* may re-stage work (a trusted pipeline's re-runs still require the founder to trigger them; an autonomous one may be re-staged by the scheduler, §7.3) — never *whether* exceptions escalate. Exceptions escalate at every rung.

### 7.2 Promotion is a founder-only, revocable, forgery-proof act

- Only `promoteChannel` (`project-store.mjs`, exposed as the founder-only promote route in `server.mjs` ~L1121) writes `autonomy`/`blessedPattern`. Revocation drops back to `draft` in one call.
- `assertNoForgedAutonomy` rejects these keys on every typed graph mutation (`add_node`/`update_node`) — a composed graph, a run, or a model call can never mint autonomy. Composition never sets it; a run never sets it. **This guard is the ladder's floor; 05 must not migrate it away.**
- On the graph, a pipeline's autonomy level is honest metadata on its gate object (02 renders the rung and the blessed pattern's summary on the gate card). The Approvals panel's ladder controls migrate onto this gate surface **before** that panel is deleted (the known blocked migration — never blind-rip).

### 7.3 Repeatable motions **(deferred: promotion scheduling)**

`promote-motion.mjs` is built and stays the design: `promoteRun` wraps a proven run in a RepeatableMotion (source run, open-string cadence, scorekeeping ledger, next-run template copied — not re-composed — from the run); `runDueMotions` on the host heartbeat re-stages due motions as fresh Runs that **stop at the gate every time** (`runMotionOnce` re-asserts `assertGateWall`, mints fresh joinKeys, stages `status: "staged"` with a pending gate). A re-run never auto-approves; only the pipeline's own ladder rung (§7.1) decides how much of the re-staged batch auto-clears. Graph projection: `run —promoted_to→ motion`, with the motion's scorekeeping as its node body. Phase 1 does not surface promotion; the plumbing ships dark.

---

## 8. Phase-1 / deferred ledger

| Capability | Phase 1 | Deferred (north-star) |
|---|---|---|
| Compile selected path → decomposed staged Run | ✔ (§1) | richer multi-section decomposition breadth as 03's composer matures |
| Inline action-level gate, `protects`/`reviewPayload` projection | ✔ (§2) | — |
| Per-item decisions, edits, receipts, batch pattern approval | ✔ (§2.3–2.4) | — |
| Staged execution (nothing auto-sends) | ✔ (§3) | automated execution through every connector |
| Gated microproduct deploy (double lock) | ✔ (exists) | live ship runner end-to-end |
| Measurement contract bound at compile when bindable; missing → repairable Measurement weakness flagged, visible at gate | ✔ (§5) | — |
| Repair runs (compilable repairs stage through the same wall; receipts write `resolution`) | ✔ (§3.1, for the shipped repair kinds) | one-tap repairs with drafted content (03) |
| Outcome ingestion | founder-entered only (§6.4) | connected-account + product-event watchers |
| Outcome nodes + `produced` edges on the graph | ✔ (§6.2) | — |
| Path-score / weakness updates from outcomes | data flow ✔; math is 03's | automatic re-scoring cadence |
| Autonomy ladder | exists; surfaces on the gate card (§7) | — |
| Promotion / repeatable motions / scheduler | plumbing ships dark (§7.3) | promotion scheduling surfaced |

## 9. Code bones reused (for 05's migration map)

| Spec concept | Existing code (keep) |
|---|---|
| Compile spine (spine ONLY — the seven-section decomposition is NEW work per §1.2/03 §8; today it stages one `planned-action` item) | `run-compile.mjs` — `compileRunFromPath`, `isBindableContract` (repurposed from refusal to the Measurement-weakness flag, §1.4), `buildCompileGrounding`, `gateReviewForRun` |
| Wall | `workflow-composer.mjs` — `assertGateWall` (the only wall predicate) |
| Gate execution + decisions | `connectors/gate/default.mjs`, `gate-pattern.mjs` — `applyPatternApproval` |
| Contract relaxation (gate = only checkpoint) | `source-entry.mjs` — `relaxPreGateContracts`, `relaxGateContracts`, `relaxDiscoveryChainContracts` (applied in `graph.mjs`) |
| Run/result/contract/learning stores, joinKey minting | `gtm-store.mjs` |
| Outcome join + honest report | `outcome-ingest.mjs` — `joinToRun`, `ingestOutcome`, `ingestBatch`, `outcomeReport` |
| Belief write-back (founder-only) | `belief-writeback.mjs` — `applyExperimentVerdict` |
| Autonomy | `project-store.mjs` — `promoteChannel`; `graph-operations.mjs` — `assertNoForgedAutonomy`; promote route + revoke in `server.mjs` |
| Promotion | `promote-motion.mjs` — `promoteRun`, `runMotionOnce`, `runDueMotions`, `scoreForRun` |
| Run driving / pause-at-gate / release guard | `operator-runtime.mjs` |

What this spec **deletes** is 05's to sequence: the monolith gate-review screen (→ inline gate objects), the goal-launcher-to-run front door (→ compile-a-path), and the opaque long-compose drive state as the primary path (composition becomes per-path, on compile).
