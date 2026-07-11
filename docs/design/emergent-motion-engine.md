> **SUPERSEDED AS PRODUCT DIRECTION.** Its open-vocabulary and anti-cage lessons remain
> useful history. The current product contract is **docs/OPEN-CANVAS-SPEC.md**, where
> product development and go-to-market share one canvas.

# Emergent motion — the engine grades any go-to-market, not just outbound

Status: engine BUILT + live-proven (2026-06-27). UI surfaces are the next slices (below).
Founder decision: **emergent + named by shape** — no fixed motion enum, ever.

## The problem
The product read as a cold-outbound tool even though its domain objects (OutcomeProgram,
AgentInstance, GTMGraph) are general. The tell was structural, not cosmetic: the engine that
grades every node and powers the Problems rail had ONE hardcoded worldview — a fixed outbound
pipeline `research → context → source → enrich → filter → generate → gate → execute → measure →
learn` (`PIPELINE_LABELS`, `engine.mjs`). Every motion was forced into it. A content / PLG /
community / partnerships / paid / referral motion has no "enrich" or "filter" stage, so the engine
graded those stages at health 0 — reading as *broken outbound*, not as *a different motion*. The
cage AGENTS.md claimed was removed was alive in two lines: the fixed subsystem array and the label
dictionary.

## The decision (founder, 2026-06-27)
**The loop has no canonical stages. It has the stages this motion actually has.** Four stages are
universal to ANY go-to-market and frame every motion:

> **Ground** (what's true about the product/audience) → *…the motion's own middle…* →
> **Gate** (the wall) → **Measure** (did the outcome move) → **Learn** (taste compounds)

Everything between Ground and Gate is the motion, composed — never a fixed spine. Outbound fills it
with source/enrich/filter/draft; content with research/draft/publish; PLG with
instrument/segment/trigger. The frame is constant; the body is emergent. This demotes outbound from
"the shape of GTM" to "one shape GTM can take."

Rejected: a first-class **named-motion enum** (Outbound/Content/PLG/…) — it communicates breadth
loudest but replaces one fixed taxonomy with a bigger one (a new cage). Rejected: neutral/minimal
(only stops *saying* outbound; never actively says "all GTM").

## What shipped (engine — `brain/src/engine.mjs`)
- `PIPELINE_LABELS` → `STAGE_LABELS`, now **display hints, not a taxonomy**. An unknown stage
  category is title-cased (`webinar` → "Webinar"), never forced into outbound vocabulary.
- `getEngineState` emergent path: when a graph is supplied, the middle stages are the **distinct
  categories the graph actually contains**, in flow order (by node x), partitioned around the gate
  so a post-gate send reads after the wall. An absent stage is simply **not built** — never a
  0-health phantom that reads broken.
- `deriveFlowStage` learns `connectorBacked`: agent/skill/code/mcp stages have no connector to
  configure, so a missing connector is never their problem; health comes purely from the run.
- `deriveMotionName(stages)` names the motion by its **shape** ("Content loop", "Outbound loop",
  "Webinar loop") with no hardcoded enum. Exposed as `engine.motion = { name, stages }`.
- Legacy (no-graph) path unchanged — a project-wide engine read still derives the full registry
  pipeline. Coverage: 4 new emergent tests in `engine.test.mjs`; full brain suite green (313).
- Live-proven: the RodentRadar flagship channel went from 10 rows (with enrich/filter/generate/
  research at 0) to its 6 real stages — `Ground 42 · Source 58 · [Gate 100] · Execute 88 ·
  Measure 18 · Learn 80`.

## The UI adjustments — what shipped this session, what's left
Live-verified in the running app (Chrome freed, `motion-chip.png`).

1. **Motion identity surfaced — DONE.** `engine.motion` is typed (`types.ts`), threaded through
   `App.tsx` → `FloatingDock`, and rendered as a quiet `.fdock-motion` chip in the breadcrumb
   ("Outbound loop" / "Content loop") — what KIND of go-to-market the focused workflow is. Hidden on
   the all-workflows overview and the empty canvas. Verified live on the RodentRadar flagship.
2. **Personas generalized — DONE.** `agentPersona.ts` now spans every motion: Content Strategist,
   Distribution Planner, Lifecycle Engineer, Growth Instrumenter, Community Lead, Partnerships Lead,
   Paid Acquisition, Referral Designer — tested FIRST so a content/PLG/community agent never falls
   into an SDR role. Three new function families (content=teal, community=pink, growth=indigo),
   hues chosen clear of the two reserved semantics (amber=gate, red=danger).
3. **Empty-state prompts — already multi-motion.** The front door's chips already offer "content
   that ranks" and "ecosystem partners" alongside outbound. Verified; no change needed.
4. **The lens bar (Ideate / GTM / Product)** — the motion chip now carries the "what kind" signal
   next to it, which softens the "one GTM" read. A deeper lens rework is optional.
5. **Measure-by-motion — DONE.** `deriveMeasure` now takes the graph. A non-outbound motion (no
   `source` stage) is graded by `deriveObservationMeasure` — it observes its own outcome through its
   measure stage and is never forced to be "blind" on a missing product-code win event. An outbound
   motion keeps the full conversion-attribution logic, including the Buffalo blind-attribution
   honesty (verified live: the RodentRadar flagship's Measure stays 18/blind, correctly). Covered by
   3 tests in `engine.test.mjs`.
6. **Foundry mints the agents a graph reaches for — DONE.** `ensureGraphAgents`
   (`program-compiler.mjs`) mints a real personalized teammate — creation policy + instance + on-disk
   definition — for every agent node the composed graph references that wasn't already a
   declared channel agent spec. Wired into the live compose path (`workflow-composer.mjs`, right after
   `annotateGraphWithProgram`), so a Content Strategist or Lifecycle Engineer the model reaches for
   becomes a contract-bound teammate that learns at the gate, not a generic step. Idempotent; covered
   in `capability-foundry.test.mjs`. This is the open node model's other half: the library is no
   longer a fixed bin you can only pick from — the graph can reach for a teammate and the foundry
   builds it.

## Follow-ups / known weakness
- `deriveMotionName` is a first-pass heuristic. A sparse outbound graph (only source+execute) names
  as "Source loop", not "Outbound loop" — honest but weak. Refine the signatures as real
  non-outbound motions get built and we learn the stage vocabulary. Long-term, the foundry could
  persist a model-given motion name, with this heuristic as the fallback (mirrors the agent-name
  plan in `agent-profile.md`).
- The foundry "mint a missing-stage agent" capability is decided but not yet built — it is the
  other half of "build the things it can reach for."
