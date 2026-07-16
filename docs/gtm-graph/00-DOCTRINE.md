> **SUPERSEDED.** This entire pipeline-centered GTM graph package is design history.
> [`FIRM-SPEC.md`](../FIRM-SPEC.md) is the only product and build contract; nothing in this package
> supplies current nouns, graph structure, acceptance criteria, or implementation tasks.

# Drover — GTM Graph Doctrine (historical)

**Historical status:** formerly locked direction, pre-spec · **Date:** 2026-07-02

Former source of truth for the GTM-graph redesign. The sibling specs cite this document only within
that historical package. Written in engineering register; do not translate its ontology into the
current product.

---

## North star

One living GTM graph. All GTM work is one node graph; a pipeline is a highlighted route through it; a weak area is a node or edge with low evidence or performance; a run is a selected route compiled into execution. Drover highlights the best current path, flags weakness, helps repair the weak node, runs the path to a gate, and folds the outcome back into the graph.

> The canvas is not a workflow builder. The canvas is the GTM graph. Drover highlights the path, flags weakness, and helps repair the weak node.

## Why this is not a pivot

The graph is Drover's existing harness made visible. The three things the host constrains map one-to-one:

- **Truth** → evidence status + weakness flags on every node (cited or inferred, never seeded).
- **The Wall** → the single gated edge where an asset becomes an outward action.
- **Taste** → the learning loop; outcomes update beliefs, which reshape the next spray.

Build on the bones. Do not restart.

---

## The object model (node domains)

Nodes are typed and grouped by domain. This is a **palette** — kinds of cards and how they behave — never a required order or a closed list.

```
External:     signals, sources, connectors
Market:       buyer, ICP, pain, job, trigger, workaround, competitor, objection
Product:      capability, workflow, proof, product gap, measurement gap
Strategy:     positioning, wedge, value prop, offer, channel, message, proof, conversion path
Audience:     accounts, contacts, segments, lead scores, lists
Assets:       emails, pages, posts, decks, audits, demos, reports
Runs:         path, run, gates, agents, execution plan, success criteria
Pipeline:     reply, meeting, signup, lead, opportunity, pilot, revenue
Customer:     activation, usage, retention, expansion, churn, testimonial
Measurement:  events, attribution, metrics, results, scorecards
Learning:     belief updates, path scores, next bets, repeatable motions
```

Read top-to-bottom this is the GTM lifecycle as objects: understand the world and market → form strategy → pick the audience → make the assets → fire the runs → get pipeline and customers → measure → learn. **Learning closes the loop back to Strategy.** That flywheel is why a GTM desk beats a one-off builder.

## Card lifecycle (altitude = maturity)

```
Loose cards become typed nodes.
Typed nodes connect into pipelines.
Pipelines compile into runs.
Runs produce outcomes.
Outcomes update the graph.
```

- **Raw / loose** (cheap): signal, hunch, quote, competitor move, founder note.
- **Structured GTM** (semi-real): ICP, persona, pain, job, trigger, offer, channel, message, proof, conversion path, metric — each carries an evidence label and a weakness label.
- **Execution** (real): audience list, asset, run, gate, connector action, product patch, measurement contract.
- **Outcome** (truth): reply, meeting, signup, pilot, revenue, activation, churn, learning.

A fresh card lives at the **Strategy** altitude (a wedge × buyer bet). Breaking it open or compiling it walks it *down* through Audience → Assets → Pipeline. The object layers are the zoom levels.

## Edge types (typed causality)

Edges carry meaning, not generic wires:

```
supports · weakens · belongs_to · leads_to · targets · uses ·
measured_by · produced · blocked_by · derived_from · promoted_to · updates
```

Edges are **machine-drawn** and typed by Claude from grounding. The founder confirms, swaps, or challenges — the founder never hand-wires the causal graph. (Hand-wiring is exactly the n8n tedium this design escapes.)

These twelve edge types are a **closed union** (locked decision 6). Edges are graph mechanics, like the typed-operation set — the anti-cage rule governs node *domains and types* only, never edge types. An unknown edge type a model returns is routed to the nearest known type or `derived_from` (03); adding a thirteenth type is a code change with a test.

## Weakness & evidence model

Every typed node carries an evidence label and can be flagged weak. Each weakness kind pairs with a suggested repair:

| Weakness | Meaning | Repair |
|---|---|---|
| Evidence | only founder input supports it | find evidence |
| Specificity | too broad | narrow / drill down |
| Product | claim not yet supported by product | add product proof / patch |
| Measurement | no attribution key to the outcome | patch measurement |
| Execution | no sourceable audience list exists | alternate channel / source list |
| Performance | replies but no meetings | rewrite message / change offer |

> Weakness is **derived from real signals** (scan, runs, outcomes), never asserted. Seeded weakness is banned, same rule as seeded health.

**Phase-1 detectors:** evidence, product (scan-derived product-gap), measurement (scan-derived measurement-gap), and execution (list-sourceability). Specificity and performance are north-star — they need drill-down and outcome volume respectively; until they ship, those kinds report an honest `unmeasured` blank per kind, never a flag and never a pass.

## Views & lenses (one graph, many emphases)

- **Global graph** — the whole GTM brain.
- **Pipeline highlight** — one route lit through the graph (1–3 at a time, never all equally).
- **Drill-down** — expand a node into its decomposition tree (ICP → segment → persona → title → trigger state → exclusion).
- **Swap mode** — replace a weak piece (swap message / channel / trigger, narrow ICP, strengthen proof, add measurement).
- **Lens mode** — same graph, different emphasis: evidence · execution · revenue · product-gap · weakness · learning.

> Everything can live on one graph. Not everything should be equally visible at once.

## The interaction loop

```
scan → spray → graph → highlight strongest path → inspect weakness →
drill / swap to repair → compile path into a run → inline gate →
staged execution → outcome → learning updates the graph
```

(This is the north-star loop. In phase 1 the repair step is suggestion cards plus compilable repair runs — drill-down and swap are deferred, per Scope.)

---

## Locked decisions

1. **Cold open — prefilled graph, strongest path highlighted, weak nodes marked.** Not empty, not weakness-first. First impression: *"Drover already did work. Here's the best current path. Here's where it's soft."* Weakness lens is one click away; an empty graph is manual mode only. Phase 1 lights **exactly one** strongest path; ties break to lighting both only when multi-path chips ship (north-star). The deliverable is named honestly: the **strongest current testable path** — with only product and market sprayed it is a strategy-level bet worth testing, never a guaranteed path to revenue.

2. **First spray — wide and shallow.** Phase 1 sprays Product cards (from the scan) and Market cards (from research), plus model-proposed Strategy cards grounded on them and labeled as inference. Audience, Assets, Pipeline, Customer, and Learning are never sprayed up front — Audience and Assets appear on compile; Pipeline, Customer, and Learning only from real outcomes. Each card lands light: one-line statement, type, evidence label, weakness label, source count / preview (the last two computed at read time, never stored). Depth only on click or compile. Broad, not complete. *Wide spray, shallow cards.*

3. **Run altitude — compile a whole path.** The founder selects a highlighted path and hits **Compile run**; Drover decomposes it into audience, assets, agents/tasks, product patch, measurement contract, gates, and execution steps. *Founder chooses the bet; Drover decomposes the work.*

4. **Gate — inline checkpoint on outward edges, backed by an action-level approval object.** Visually it sits on the edge where internal reasoning becomes external action:

   ```
   Path → Run → [Gate] → Send / Publish / Patch / CRM update
   ```

   Structurally it belongs to the action or action batch, and it is a **projection over the execution-graph gate node** (04 owns the gate, autonomy, and run model) — never a standalone reasoning node:

   ```
   Gate {
     protects:         send_emails | publish_page | apply_patch | update_crm
     requiredApproval: founder
     reviewPayload:    copy | list | diff | action-summary
   }
   ```

   `protects` and the `action-summary` review payload are **derived from the compiled topology and staged items, never authored**. Visible because trust matters; scoped to the action so it never pollutes the reasoning graph. Autonomy ladder: autonomy lives on the pipeline (code: channel) via `promoteChannel` with the forge-guard — bless a pattern once and clean items auto-clear while exceptions still escalate.

5. **Scope — spec the north-star, mark the phase-1 slice.** Not phase-1 only (understates the product); not north-star only (too large to build).

6. **Edges are a closed union.** The twelve edge types are closed graph mechanics. The anti-cage rule protects node domains and types from enums; it never applies to edge types. Unknown model-returned edge types route to the nearest known type or `derived_from` (03); adding a thirteenth type is a code change with a test.

## Scope

**North-star:** one living GTM graph with paths, runs, outcomes, learning.

**Phase 1 (ships to the first stranger) — the single source of truth; every spec's P1/NS marks must match this list exactly:**
```
1.  Product scan
2.  First spray: Product cards (scan) + Market cards (research), plus
    model-proposed Strategy cards grounded on them. Audience / Assets /
    Pipeline / Customer / Learning are NOT sprayed up front — Audience and
    Assets appear on compile; the rest only from real outcomes.
3.  One visible graph
4.  Strongest current TESTABLE path highlighted — exactly ONE lit
5.  Weakness labels — detectors: evidence, product-gap (scan-derived),
    measurement-gap (scan-derived), execution list-sourceability.
    Specificity + performance deferred; those kinds report honest
    `unmeasured` blanks.
6.  Click-to-inspect cards
7.  Compile highlighted path into a run
8.  Inline approval gate
9.  Staged assets / actions
10. Measurement contract — bound at compile when bindable; when missing or
    unbindable the run STILL compiles, carrying a repairable Measurement
    weakness flagged before or at the gate (the gate stays the only checkpoint)
11. Founder-entered outcome ingestion (reuses outcome-ingest.mjs): Outcome
    nodes + `produced` edges for the founder-entered path
```

**Not in phase 1:** drill-down, variants, and swap mode (and with them the specificity repair verb) · multi-path chips / full interactive path editing · specificity + performance weakness detectors · lenses beyond default + weakness · automated execution through every connector · connector outcome ingestion (founder-entered ships in phase 1) · promotion scheduling · cross-company learning · advanced agent-orchestration UI.

## What gets gutted (be aggressive)

**Dies or folds:**
- The one-shot "state a goal → compose the whole monolith" operator flow, and the ~3-minute opaque "building your loop" drive-state as the primary path. Composition becomes per-node, on compile.
- The separate 15-idea review overlay — ideas are loose cards on the graph.
- The bets-map / map-lens leaderboard — becomes the graph plus path highlight.
- Separate board / engine lens surfaces — collapse into lens modes on the one graph.
- The monolith gate-review screen — becomes the inline edge checkpoint.
- The duplicated center + rail narration — the graph is the narration.
- The cold-start goal launcher as the front door — replaced by scan → prefilled graph.
- The composer as primary driver — demoted to a command / lens driver over the graph.

**Keep and reuse (bones):**
- The belief / evidence derivation discipline that currently powers node health (never seeded; verdicts > approvals/runs > citations) → adopted by the new weakness engine (its functions are private board helpers; the engine is new API surface — 03).
- The object bones (ICP, claims, experiments as first-class).
- Find-references → causality across objects.
- The node/edge graph, runs, source modes, the founder-gate primitive.
- Product-mode canvas stays as its own object-model projection.

## Three make-or-break hard parts

1. **Weakness detection must be real** — derived from signals, never vibes. If it's hand-wavy the whole graph is decoration.
2. **Edges must be machine-drawn** — or the founder rebuilds n8n's tedium across 60 object types.
3. **Cold start must return a real strongest-path in minute one** — an empty GTM graph is unimpressive.

## Guardrail (anti-cage)

The domains are a **palette, not a taxonomy**. No closed channel enum, no fixed stage skeleton, no required order. The only hard sequence rule in the whole system: the gate sits before anything that reaches outside. Everything else composes free. (Guarded by the existing anti-cage test.) This rule governs **node domains and types only** — the twelve edge types are deliberately a closed union of graph mechanics (locked decision 6), and that is not a cage.

---

## The spec set (spawned from this doctrine)

1. **`01-object-graph`** — node types, typed edges, evidence/weakness model, how objects relate.
2. **`02-canvas-interaction`** — global graph, pipeline highlight, drill-down, swap, lenses, loose-card spray, chunk break-down, per-card run.
3. **`03-intelligence`** — spray from scan + market, edge inference, weakness detection (real signals only), repair suggestions, the compile-decomposition model call, utterance routing; drill-down and variant generation (north-star).
4. **`04-runs-and-wall`** — compile a path into a run, the inline gate on outward edges, the autonomy ladder, outcome ingestion.
5. **`05-migration`** — what folds or cuts, which code bones get reused.

**Short version for the top of every spec:**

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
