# STATE — Drover (Alpha)

**Stage: Alpha.** Logged 2026-07-03. This is the front-door snapshot of where the
product actually stands. When something material changes, update this file and re-date it.
For the product pitch read `README.md`; for how the system works read `AGENTS.md`; for the
current build direction read `docs/GTM-ENGINE-REBUILD.md`. Everything else in `docs/` is
history (see the doc map below).

---

## What Drover is

The go-to-market desk for a founder running more than one product. Point it at a product's
codebase and it reads what the product actually does. State a go-to-market goal in plain
words. A frontier model composes the agents and steps that goal needs, and runs them up to
a founder approval gate. Nothing sends, publishes, or charges until the founder approves.
Every gate decision trains taste for the next run.

It holds the rented model on a short leash for exactly three things and lets it run free on
everything else:

- **Truth.** A read-only scan cites what the product does to real evidence, or labels it
  inferred. The model cannot invent product facts.
- **The Wall.** Every step that reaches the outside world needs a founder gate upstream, on
  every path. The gate graduates by explicit founder promotion; it never disappears.
- **Taste.** Every approve, reject, and edit at the gate becomes durable memory that shapes
  the next run.

---

## What "Alpha" means here

The spine works and the code is green, but no real founder has driven a real go-to-market
win to the gate yet. Alpha is honest about that line: the machine runs, the outcome is
unproven. Read every "real" below as "built and tested," not "validated in the market."

**The alpha bet:** a first attributable win — a real founder states a goal, the composed
pipeline reaches the gate, they approve, something goes out, and the outcome joins back as a
measured result.

---

## Where it stands

| Area | State | Note |
|---|---|---|
| The three-rail harness | **Real** | Truth scan, founder gate, taste memory — the spine works. |
| Goal → composed pipeline → gate | **Real** | A goal composes a graph that runs to the wall; the wall is enforced on every path. |
| Node-flow canvas (primary surface) | **Real** | The wired-steps diagram is the default landing; card detail-on-zoom shipped. |
| Living GTM graph (ordered canvas) | **Building** | The reimagined surface: one map of the whole go-to-market picture, arranged left-to-right, the strongest path lit as the spine, drag / reorganize. Ordered layout landed on main 07-03; verified on one dogfood product, not a live founder. |
| GTM engine rebuild | **Landed, unexercised** | Evidence graph, market research, path portfolio, outcome ingest, promotion, run-compile — merged and tested, not yet run end-to-end on a live goal. Note: this is fuzzy work; by doctrine it belongs in rented agents behind open steps, not hosted modules — keep it thin and collapse toward agents, never grow it into a subsystem. |
| Dogfood loop | **Landed, unexercised** | Drover files and builds its own improvements to gated branches that wait for review. |
| The learning loop closes (machinery) | **Built & verified** | On branch `lean-rebuild`: outcome-door, compile→approve→run, outcome-proposed verdicts — a real outcome can now flow back and shape the next run. Audited alpha-loop-ready; not yet exercised by a real founder. |
| The two new surfaces | **Built & browser-verified** | The agent face (derived per-agent record, honest "no runs yet") and the market picture built layer by layer (co-construct picker) — both on `lean-rebuild`. |
| A first attributable win | **Unproven** | The alpha bet. The machinery is in place and verified; no real founder outcome has closed the loop yet. This is what earns "alpha". |

---

## How we build (the standing rule)

Less is more. The harness — truth, the gate, taste — is the only thing we host. Every fuzzy
capability (research, enrich, rank, ideate, draft) is a rented agent reached through an open
step, never a new hosted subsystem. A new feature is an agent plus a step, not new plumbing.
When something starts looking like an engine of modules, that's the smell — collapse it to
agents. This is the anti-cage rule in `AGENTS.md`, restated because it's easy to drift off.

## Build health (2026-07-03)

- **Tests:** full suite green. Branch `lean-rebuild`: 1170 backend pass / 0 fail, plus a new front-end unit-test harness (vitest + testing-library) at 12 pass / 0 fail, chained into `npm test`. `main` is at the 1091-pass state; the vision buildout lives on the branch, unpushed, awaiting review.
- **Backend:** 89 modules. New GTM-engine modules present and tested: evidence, gtm-store,
  market-research, path-portfolio, outcome-ingest, promote-motion, run-compile.
- **Interface:** 37 components, 9 canvas lenses, node-flow diagram as the default canvas.
- **Agent front door:** 40 tools over the MCP server (`npm run mcp`).
- **Run:** `npm start` (builds the interface, serves API + client on port 4317).
- **Version:** 0.3.1 (root), pre-1.0 by design.
- **On origin/main:** the ordered left-to-right living-graph canvas landed 07-03, on top of
  the GTM engine rebuild and two-surface canvas from 07-02.

---

## The standing bar for product & design

From here, product and design work is not done when it functions. It is judged against how
it lands in the market and whether it meets a beautiful-design standard.

- **Market-first.** The question is not "does it work," it is "does it matter, would a
  founder choose it, is it positioned clearly enough to decide on." A strong build with a
  weak position is unfinished.
- **Beautiful by default.** Reference-grade craft, held to a frontier-lab bar — not generic
  startup or template output. Work inside the product's real system (light ground,
  monochrome zinc, Geist, semantic color only, no decorative gradients).
- **Off the mean.** If a stranger could guess the design before the screen finishes loading,
  it is still the average. Ship the specific, not the default.

This is doctrine now — see the same bar in `AGENTS.md`.

---

## Doc map — current vs. history

**Current (read these):**
- `README.md` — the product, plainly.
- `docs/VISION.md` — the north star: what Drover is for and the shape it's built toward.
- `AGENTS.md` — how the system works and its guardrails.
- `docs/GTM-ENGINE-REBUILD.md` — the current build direction (Phases 0–6 have landed as code).
- `docs/STATE.md` — this file.

**History (kept for the record, superseded — do not treat as current):**
`PRODUCT-SPEC.md`, `BUILD-PLAN.md`, `CANVAS.md`, `DDD.md`, `EXPERIENCE.md`, `GOAL.md`,
`MODEL.md`, `PRODUCT-MODEL.md`, `CURSOR_GTM_UX_PLAN.md`, `EVALS.md`. These
describe the earlier "IDE for GTM" framing and, in several cases, two machinery layers that
were deliberately deleted — the outcome-program / policy / capability-foundry / portfolio
layer, and the opportunity accept-list. If any of these read as load-bearing, the doc is
stale, not the code.
