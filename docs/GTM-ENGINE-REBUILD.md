# Drover — GTM Engine Rebuild (plan of record)

Status: PARTIALLY BUILT. Authored 2026-07-01; updated 2026-07-02. Phases 0–6 have landed as
code — evidence graph, gtm-store, market-research, path-portfolio, outcome-ingest,
run-compile, and promote-motion all exist with tests and are on origin/main. Not yet
exercised end-to-end on a live founder goal; the alpha bet (a first attributable win)
remains open. For the honest current snapshot see docs/STATE.md.
This supersedes the pre-redefinition framing in VISION.md, GOAL.md, BUILD-PLAN.md,
PRODUCT-SPEC.md, CANVAS.md, and MODEL.md where they conflict (those describe the
IDE-metaphor product; see "Supersedes" at the end).

Engineering register — this is the build plan. Anything surfaced to the founder is
translated to plain language first (per AGENTS.md).

---

## 0. Definition (the north star)

> **Drover turns product truth + market objects into executable, measurable GTM
> programs — then learns which GTM paths work across companies.**

Higher-upside form the founder confirmed:

> **Drover is an interactive GTM map and compiler. It reads product truth,
> researches market truth, generates a PORTFOLIO of GTM paths, lets the founder
> inspect and edit the reasoning on a canvas, compiles selected paths into gated
> runs, measures outcomes, and promotes what works into repeatable motions.**

## 1. The reframe (why we are rebuilding)

The product was over-architected around the "IDE for GTM" metaphor — a canvas of
boxes-and-wires, a belief spine, a nine-layer board, lenses — before it nailed the
job of a GTM engineer. That visual apparatus is where cages and machinery-register
kept regrowing. The definition above contains no canvas: it describes an engine.

Role split, applied to the product itself:
- **Claude does all the WORK of a GTM engineer, fast.** It makes the calls the
  founder's taste already settles, and surfaces only genuinely NEW judgment.
- **The founder decides anything new.** Nothing strategic is auto-decided; nothing
  outward-facing sends without the founder gate.

Audit verdict (2026-07-01, 7-agent, against this definition):
- Product truth: **solid** (cited, read-only, refuse-to-fabricate scan).
- Market objects: **thin** (only buyer/positioning/offer exist; all typed-in
  guesses with no evidence — the "don't invent customers" rule violated by shape).
- Executable programs: **partial** (clean compose-to-gate, but one-shot on guesses).
- Measurable: **thin** (counts gate clicks; never captures a real reply/meeting/
  signup joined to what was sent).
- Cross-company learning: **missing** (correctly waits on the single-company loop).

## 2. Invariants (hold across every phase)

1. **The wall is untouched.** Every execute path keeps a founder gate upstream;
   nothing sends/publishes/charges without explicit founder approval. Autonomy only
   graduates by explicit founder promotion.
2. **Open shapes, never a closed taxonomy.** Market-object kind, path bet fields,
   and outcome kinds are OPEN strings/labels — never an enum that rejects a value,
   never a fixed GTM stage skeleton. Guarded by the anti-cage tests.
3. **Evidence discipline.** Every product OR market claim carries evidence or is
   structurally demoted to speculative. A claim with no source cannot present as
   grounded. One shared Evidence/provenance contract across both truth sides.
4. **Deterministic code for everything but judgment.** Stores, joins, ranking math,
   scheduling, routing = plain code. The model is used only for genuinely fuzzy work
   (research, ideation, drafting, grading). No model call where a function will do.
5. **Keep the proven engine.** The product scan and the compose-to-gate engine are
   reused as-is; this rebuild adds the two missing pillars and repurposes the canvas,
   it does not rewrite the working spine.
6. **No re-growing the program cage.** "Repeatable" is a LIGHT wrapper (schedule +
   scorekeeping + next-run template), never a heavy first-class program object with
   its own composition authority.
7. **Founder register on every surface.** No engine vocabulary, raw scores, internal
   IDs, or machinery prose on anything the founder reads.
8. **Cross-company: capture now, recommend later.** Single-company learning is
   recorded in a future-compatible, anonymization-friendly schema from day one; no
   cross-company aggregation or recommendation is built until the single loop proves.

## 3. The object model (Phase 0 spine)

All records project-scoped, persisted via the existing atomic-write store pattern
(reuse project-store's conventions — read before adding). Kinds/labels are OPEN.

- **Evidence** — one cited piece of evidence. Fields: `claim`, `source` (url/origin),
  `solidity` (open ladder: observed / researched / inferred / speculative — a label,
  not a gate), `capturedAt`, `notes`. Shared by product truth and market objects.
- **ProductTruth** — a cited product fact from the scan, wrapped into the Evidence
  contract (`statement` + evidence + solidity). Do NOT rebuild the scan; adapt its
  output into this record so paths can reference it.
- **MarketObject** — open buyer-side record. Fields: `kind` (open string: buyer,
  pain, job, trigger, workaround, valueProp, offer, channel, message, proof,
  conversionPath, or anything), `statement`, `evidence` (Evidence[]), `solidity`,
  `confidence`, `source`, `openQuestions`.
- **GTMPath** — the strategic bet (many per project = the portfolio). Fields:
  `summary`, `restsOn` (refs to MarketObjects + ProductTruths), the bet as OPEN
  fields (buyer → pain → trigger → offer → channel → message → proof →
  conversionPath), `risk`, `confidence`, `rankingSignals` (evidence strength, speed
  to test, product readiness, channel reachability, measurement readiness, upside,
  founder fit — stored as data, computed by code), `measurementContract` (ref),
  `status` (open: proposed/selected/running/…).
- **MeasurementContract** — set BEFORE a run. Fields: `outcomeKinds` (open list:
  reply/meeting/signup/activation/purchase/retention/manual), `sources` (connected
  account / product event / founder-entered — open), `joinKey`, `successCriteria`,
  `notes`.
- **Run** — one execution of a path. Fields: `pathId`, compiled-steps snapshot,
  gate/approval state, carried `measurementContract`, staged items each with a
  durable `joinKey`, `startedAt`, `status`.
- **Result** — an outcome joined back. Fields: `runId`, `pathId`, `assetId`/
  `messageId`, `channel`, refs to buyer/offer, `outcomeKind`, `value`, `observedAt`,
  `source`, `joinKey`.
- **RepeatableMotion** — a promoted run (LIGHT wrapper). Fields: `sourceRunId`,
  `cadence`, `scorekeeping` (rolling results), `nextRunTemplate`. No composition
  authority of its own.
- **Learning** — future-compatible normalized capture, written on each run/result/
  promotion. Fields: `productShape`, `marketObjectRefs`, `pathId`, `runType`,
  `channel`, `offer`, `message`, `result`, `promotionDecision`, `capturedAt`.
  Structural signal kept separate from identifying text so later cross-company
  pooling can strip PII at the write boundary. Stored locally; no aggregation yet.

## 4. Phases

Each phase: **Goal / Builds / Done when / Depends on / Out of scope / Guard.**

### Phase 0 — Clean spine
- Goal: the record model above exists and persists, so nothing downstream is a pile
  of loose text.
- Builds: the records + their stores + the shared Evidence/provenance contract + the
  Learning capture schema + tests.
- Done when: every record can be created, persisted, read back, and referenced;
  evidence-less claims are structurally demoted; anti-cage tests cover the new open
  shapes; brain tests green.
- Depends on: nothing.
- Out of scope: research, path generation, canvas, runs, measurement capture.
- Guard: open shapes only; deterministic code; reuse existing store patterns; keep
  the wall and the scan/compose engine untouched.

### Phase 1 — Strelva buyer picture (market research pillar)
- Goal: turn the buyer side into real, cited MarketObjects for the full set.
- Builds: a market-research capability reached through an open step (a research
  agent/skill, NOT a new hardwired connector), producing buyer, pain, job, trigger,
  workaround, value prop, offer, channel, message, proof, conversion path — each with
  statement/evidence/solidity/confidence/source/open-questions. Runs as a **ritual
  the founder invokes** (like scanning the repo). Founder-typed inputs become an
  override layer; researched evidence is primary.
- Done when: invoking research on Strelva yields the full object set, each labeled by
  how solid, with real sources — no invented behavior.
- Depends on: Phase 0.
- Out of scope: path generation, canvas.
- Guard: evidence discipline is the whole point — an unsourced object is speculative,
  never presented as fact. Hybrid grounding (research + founder input + connected data
  later), labeled by solidity.

### Phase 2 — GTM path portfolio
- Goal: a FOCUSED, DECIDABLE portfolio of GTM paths — a set a founder could act on in a
  day (a soft default of ~6–10 STRONG, DISTINCT bets), not one path and not a dump of
  twenty look-alikes. The bets are deliberately SPREAD across different go-to-market
  angles (audience, offer, pricing, channel, message, partnership, content, motion —
  an OPEN palette drawn from, never a closed enum) so the set opens the real option
  field instead of clustering on one shape.
- Builds: path generation from ProductTruth + MarketObjects; each path carries its
  bet fields, its angle (an open free-text label), risk, confidence, and its own
  MeasurementContract; a code-computed ranking over the seven signals.
- Done when: a Strelva run produces a focused set in the ~6–10 band, spread across
  several distinct GTM angles, each grounded in named evidence, each with a measurement
  contract attached — and it returns in well under a minute.
- Depends on: Phase 1 (and Phase 0).
- Out of scope: executing a path, the canvas.
- Guard: paths are open bets, not a fixed skeleton; the angle palette and the count are
  soft hints, never a hard cage that rejects a value; ranking is code over stored data,
  not a model guessing a number; generation is a LEAN prompt (one generate call + one
  SEPARATE batched grade call, no tools, low turn budget), not a sequential fleet of
  tool agents grading path-by-path.

### Phase 3 — Read-only reasoning canvas
- Goal: the founder can SEE the reasoning before it is interactive.
- Builds: the GTM MAP as a projection with three zoom levels — Portfolio (all paths,
  strongest/blocked/ready/worked), Path (buyer→…→metric with weak links flagged), Run
  (later). Read-only. Engine always pre-fills it; never a blank canvas.
- Done when: the founder opens Strelva and sees the ranked portfolio and can drill
  into any path's reasoning and weak links — no editing yet.
- Depends on: Phase 2.
- Out of scope: editing, lenses beyond the read views, workflow wiring.
- Guard: this replaces the build-a-workflow canvas incrementally (phased); founder
  register only; no nine-layer framing shown.

### Phase 4 — Honest run to gate
- Goal: a selected path compiles into a run grounded on BOTH truths, with its
  measurement contract attached before execution, and reaches the founder gate.
- Builds: path → compiled run (assets, any product/measurement patch, approval
  points, execution actions); the MeasurementContract is bound at compile time; the
  gate renders whatever was staged (any shape).
- Done when: selecting a Strelva path stages a real, reviewable run at the gate with
  its measurement contract set; nothing sends.
- Depends on: Phase 2.
- Out of scope: capturing outcomes, promotion.
- Guard: the wall is untouched; measurement contract MUST exist before the run is
  runnable (amendment 2).

### Phase 5 — Outcome store + join
- Goal: capture what actually happened and join it back to what was sent.
- Builds: an outcome store; ingestion from all three sources (connected accounts,
  product usage events, founder-entered) joined on one key; results tie to
  run/path/asset/message/channel/buyer/offer.
- Done when: a real outcome (reply → meeting → signup → purchase → retention, or a
  manual note) attaches to the exact run and path that produced it, and the founder
  can read which path worked in plain language.
- Depends on: Phase 4.
- Out of scope: cross-company aggregation.
- Guard: honest — unmeasured is shown as unmeasured, never a fake number; every
  Result also writes a Learning record.

### Phase 6 — Promote (light)
- Goal: a proven path becomes a repeatable motion with one light touch.
- Builds: RepeatableMotion = source run + cadence + scorekeeping + next-run template;
  a scheduler that actually invokes the re-run; carry-forward of what worked.
- Done when: promoting a Strelva run creates a motion that re-runs on cadence, keeps
  score, and still stops at the gate (until explicitly graduated up the ladder).
- Depends on: Phase 5.
- Out of scope: heavy program object; cross-company.
- Guard: light wrapper only; the ambient-tick/scheduler seam is wired to a real
  caller; promotion never bypasses the wall.

### Phase 7 — Interactive reasoning canvas
- Goal: the canvas becomes the decision surface.
- Builds: swap a belief, edit a path, compare paths, ask Claude why a path ranks,
  ask for variants, ask it to challenge an assumption, approve from the canvas.
- Done when: the founder can interrogate and edit the GTM map and approve runs from
  it, across the three zoom levels.
- Depends on: Phase 3 (and the loop 4–6 proven).
- Out of scope: cross-company.
- Guard: still engine-pre-filled and reasoning-first, never a generic workflow
  builder; founder register only.

## 5. Disposition summary

- **Keep:** product scan/truth; compose-to-gate engine + the wall; belief confidence
  math (as plain signal only).
- **Change:** unit → run-then-promote; canvas → phased into a reasoning surface;
  belief signal → drop the nine-layer frame; market grounding → researched-primary,
  founder-input as override, labeled by solidity.
- **Build:** the market-research pillar; the GTM path portfolio; measurement contract
  + outcome store + join; promote-light; the reasoning canvas.
- **Cut:** the build-your-own-workflow canvas + blank-canvas start; the product-
  specific outreach recipe as a template; dead cage residue on research agents; the
  nine-layer framing as anything shown.
- **Defer:** cross-company recommendations (capture the schema now).

## 6. Cross-cutting (not phase-bound)

- Operator model moved off the stale default to Opus (done in operator-store).
- Ideation is fundamentally a prompt: a generate call + a SEPARATE grade call + a
  local repetition check — not the sequential fleet of tool-using agents it is today.
  Rework it lean; keep the SDK (= Claude Code on the founder's subscription = free
  inference) only as the hands for steps that genuinely research/use tools.
- Stale docs cleanup: reconcile or retire VISION/GOAL/BUILD-PLAN/PRODUCT-SPEC/CANVAS/
  MODEL against this spec once the rebuild lands.

## 7. Supersedes

Where they conflict with this spec, treat as historical: docs/VISION.md, docs/GOAL.md,
docs/BUILD-PLAN.md, docs/PRODUCT-SPEC.md, docs/PRODUCT-MODEL.md, docs/CANVAS.md,
docs/MODEL.md, docs/CURSOR_GTM_UX_PLAN.md. Memory: [[drover-redefinition-2026-07-01]]
is the durable summary; [[agnostic-within-gtm]] is the anti-cage doctrine this obeys.
