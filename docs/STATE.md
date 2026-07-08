# STATE — Drover (Alpha)

**Stage: Alpha.** Logged 2026-07-03, updated 2026-07-08. This is the front-door snapshot of
where the product actually stands. When something material changes, update this file and re-date it.
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
| Agent bench + crew view | **Built & browser-verified** | Added 2026-07-05. The bench is the whole roster as one lens over the run ledger — every specialist with a track record derived from real gate decisions, honest "no runs yet" when unrun; reached from the dock. The crew strip shows a focused pipeline's agents left-to-right, ending on the gate. Both are projections over data the host already keeps, not new stored objects. `get_bench` MCP tool mirrors `get_board`. |
| A first attributable win | **Unproven** | The alpha bet. The machinery is in place and verified; no real founder outcome has closed the loop yet. This is what earns "alpha". |

---

## Sprint-alpha (2026-07-07) — the three named blockers are closed

The 2026-07-06 full-codebase review found the alpha bet blocked by three concrete things: the
product never actually sent anything (the email transport was not wired to the send path), the
install broke for a stranger, and the founder gate could approve itself. This sprint closed all
three, then hardened the codebase. It shipped from the `sprint-alpha` branch and is now **merged
into `main`**: the real send path, the stranger-safe install, and the gate-self-approval fix are
all in the mainline (corrected 2026-07-08 — an earlier note here wrongly said it was unmerged).

**What now works that didn't:**

- **It actually sends.** Real Gmail transport is wired into the live send path, behind the founder
  gate. There is a durable bring-your-own-OAuth-client loopback sign-in that mints and refreshes
  its own token, so a founder can connect their own Gmail once and send for real. Before this, the
  send path staged locally and nothing ever left.
- **Install works for a stranger.** A root post-install step now installs the two subprojects (the
  brain and the interface) so a fresh clone comes up without hand-holding.
- **First run refuses to start half-broken.** If no signed-in Claude is available, first run stops
  with a clear message instead of failing mid-run.
- **The gate can't approve itself.** Closed the hole where an agent could release its own gate over
  the agent front door, and the raw-request bypass — the browser now mints a session token that the
  gate release path checks, so only a real founder action clears the wall.
- **One decision inbox.** A single pending-decision queue across every pipeline, with a live count on
  the dock and one notification when anything reaches the wall — instead of per-pipeline scatter.
- **Something to scan on first run.** A bundled sample product and a one-click sample scan, so a
  stranger with no repo of their own still has a real thing to point Drover at.
- **Manual outcome return.** A minimal way to mark what happened to a sent item, so a real outcome can
  close the loop by hand while the automatic path is still unproven.
- **Desktop branding.** The desktop build now reads as Drover, with an honest distribution doc.

**Hardening (behavior-preserving, no feature change):**

- Split the two oversized files the 07-06 review flagged as the real illegibility: the server split
  into per-domain route modules, and the operator runtime split into separate tools, run-core, prompt,
  and tool-execution modules. Tests stayed green across both splits.
- Removed confirmed-dead code, relocated stray root screenshots, pruned stale docs.
- Investigated collapsing the two parallel execution engines into one and wrote the plan
  (`docs/ENGINE-COLLAPSE-PLAN.md`); **deferred on purpose** — the legacy path is still the live one, so
  the collapse is a scoped follow-up, not something to rush mid-sprint.

**What this does not change:** the alpha bet is still unproven. The machine can now send for real under
the gate, install for a stranger, and can't wave itself through — but no real founder has driven a real
go-to-market win to the gate. The honest line holds: built and tested, not validated in the market.

## 2026-07-08 — the composer invert and the watchable run

The chat was the weak surface: a generic panel that took a goal, disappeared into an autonomous
model drive, and handed back a finished pipeline — while leaking raw engine errors (a founder
literally saw "Reached maximum number of turns"). A machinery audit found the cause: the operator
ran as a Claude Code subprocess *inside* the app, so the app's own turn budget and the model's
turn budget collided. This pass reshaped the whole chat experience around one idea — the founder
should watch a colleague work, not hand a machine a prompt.

**What now works that didn't:**

- **"Our chat" — the composer, rebuilt.** A warm, calm chat surface (the "Warm Calm" register:
  warm off-white ground, opaque cards, amber reserved for the gate, motion that settles and never
  springs). It opens with a briefing over the founder's real cross-pipeline state instead of a
  blank box; every reply comes from a named teammate with a real face, not a faceless "Claude";
  decisions and the gate live in the thread and settle into stamped receipts. The old machinery —
  a parts tray, a plan mirror, a verb-picker send button, a heavy voice waveform — was deleted.
- **A fast lane instead of a tower.** A plain-code router reads the founder's message: status and
  "what happened" questions are answered instantly from real state with no model drive; only a
  build or an explicit "run it" reaches the autonomous path. This ended the colliding-budget
  failure — the "max turns" leak is stripped at the source and can never reach a founder again.
- **Taste finally reaches composition.** The founder's gate decisions are distilled into short
  rules and pre-packed into the prompt that composes the pipeline — closing the long-standing gap
  where the taste memory existed but never shaped the work.
- **The run narrates itself, in each teammate's voice.** As a pipeline runs, each teammate speaks
  in the first person, in its own voice, with real stakes drawn from its soul (a stance, never a
  destructive auto-fire). Tool steps render as a live tracker that checks off. The prose ideation
  path was retired in favor of embodied pipeline shapes the founder picks from.
- **The gate opens in the chat.** The dead "Review & send" button is fixed the right way: the real
  review — the drafts, what a yes does, the crew's steps — opens inside the conversation and
  releases through the same authorized wall, instead of punting to a canvas that never bloomed.
- **Chats you can run and control.** Building a picked idea opens its own thread so the founder
  sees where it is heading; threads can be closed and stopped.

Built across several codex-first workflows with Opus review and adversarial verification; `npm test`
is green (see build health). Version moved to **0.3.2**, still alpha.

**What only a live run settles (the founder's eyes):** the *felt* quality — whether the teammate
voices read as distinct people, whether the calmer cards feel low-friction, whether the motion
feels beautiful — can only be judged by driving a real goal, not by a green suite. The warm register
is currently scoped to the composer; warming the canvas and rails to match is the next visual step.

**What this does not change:** the alpha bet is still unproven. No outside founder has driven a real
go-to-market win to the gate. Built and tested, not validated in the market.

## How we build (the standing rule)

Less is more. The harness — truth, the gate, taste — is the only thing we host. Every fuzzy
capability (research, enrich, rank, ideate, draft) is a rented agent reached through an open
step, never a new hosted subsystem. A new feature is an agent plus a step, not new plumbing.
When something starts looking like an engine of modules, that's the smell — collapse it to
agents. This is the anti-cage rule in `AGENTS.md`, restated because it's easy to drift off.

## Build health (2026-07-08)

- **Tests:** backend suite green — 1,289 pass / 0 fail (1 skipped), and the full `npm test`
  chain (backend tests → lint → build) is green as of 2026-07-08. The suite self-terminates (a
  pre-existing gate-test connection-handle leak was fixed this pass).
- **Backend:** the two god-files are gone — the server and the operator runtime were each split into
  focused modules this sprint (behavior-preserving). The GTM-engine modules present and tested:
  evidence, gtm-store, market-research, path-portfolio, outcome-ingest, promote-motion, run-compile.
- **Interface:** node-flow diagram as the default canvas. The IA was collapsed toward the
  vision's "one canvas + a composer" shape (see the note below) — the two hand-pick pickers are
  gone and the full-screen overlays dropped from four to three.
- **Agent front door:** 40 tools over the MCP server (`npm run mcp`).
- **Run:** `npm start` (builds the interface, serves API + client on port 4317).
- **Version:** 0.3.2 (root), pre-1.0 by design.
- **On `main`:** sprint-alpha (real send, stranger-safe install, gate-self-approval fix) is
  merged; the composer invert and the watchable run (2026-07-08) land on top of it.

## The IA collapse (2026-07-03)

The interface had drifted far from the vision's own shape — a founder faced dozens of surfaces
(views, overlays, lenses, pop-over cards, modals) to run a product whose whole idea rests on four
ideas: a pipeline, a gate, an agent, a run. This pass pulled it back toward "one canvas you work on,
plus one composer you talk to," mostly by deletion:

- **The two hand-pick pickers are gone.** The founder no longer opens a panel to hand-drop an agent,
  a lead, or a reference onto a pipeline. Claude composes what a pipeline needs and the founder
  approves at the gate; the objects live on the canvas. (One of the two pickers was already dead
  code — its only opener was a control the canvas never invoked.)
- **The "Ideate" button now lives in one place.** It was duplicated in the top control bar and the
  composer; the composer is the one place you talk to Claude, so the top-bar copy was removed.
- **One product read-out.** The onboarding scan preview and the "Product grounding" panel now render
  the same read-out component, so they can't drift into two different pictures of the product.
- **Full-screen overlays: four → three.** Connecting external tools was its own takeover overlay
  (and, after the pickers were deleted, unreachable); it folded into Settings › Tools.

Deferred by design, as its own later pass: folding the Product-view vs. GTM-view switch into a zoom
level of one canvas (the two project different object models and that is a real rebuild). Known
pre-existing polish issue observed during this pass: the Settings/grounding overlays let the canvas
path-header bleed through at the top — a z-index cleanup for a future design pass, not introduced here.

## Hardening pass (2026-07-03)

A production-focused subtraction pass on top of the IA collapse: reduce lines of code and organize
the codebase technically, without changing behavior. Net effect: about **5,300 lines removed**, the
full test suite still green, verified in the browser.

- **Dead code removed.** Six unreferenced files, four genuinely-unused dependencies (kept the ones a
  JS-only scanner can't see are used in CSS), one undeclared dependency (`zod`) properly declared.
- **Dead CSS purged.** `ui/src/index.css` went from 11,721 to 7,415 lines — more than half its
  selectors were debris from long-deleted features. Removed with a PostCSS pass that only drops
  selectors whose class never appears in any component, with runtime-injected library classes held
  back; browser-verified.
- **Unused exports removed.** ~600 lines across the frontend (a whole abandoned "workspace/revision"
  feature) and backend, driven by the `knip` dead-code scanner, each sweep gated by its test suite.
- **A standing dead-code check** (`knip.json` + `npx knip`) is now committed, so this debris can't
  silently re-accumulate.

Not done, flagged as follow-ups: the seven files over 1,000 lines (splitting them is real risk, needs
its own scoped pass); the one backend "cage" smell (`curation-engine`) that belongs in a rented
agent; and a couple of `.mjs` files with non-ASCII em-dash bytes worth normalizing.

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
- `docs/ENGINE-COLLAPSE-PLAN.md` — the plan to collapse the two parallel execution engines into one; deferred (legacy path is still live).
- `docs/DISTRIBUTION.md` — the honest distribution picture for the desktop build.
- `docs/STATE.md` — this file.

**History (kept for the record, superseded — do not treat as current):**
`PRODUCT-SPEC.md`, `docs/history/BUILD-PLAN.md`, `CANVAS.md`, `docs/history/DDD.md`, `EXPERIENCE.md`, `GOAL.md`,
`MODEL.md`, `PRODUCT-MODEL.md`, `docs/history/CURSOR_GTM_UX_PLAN.md`, `EVALS.md`. These
describe the earlier "IDE for GTM" framing and, in several cases, two machinery layers that
were deliberately deleted — the outcome-program / policy / capability-foundry / portfolio
layer, and the opportunity accept-list. If any of these read as load-bearing, the doc is
stale, not the code.
