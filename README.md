# Drover

**Stage: Alpha** (v0.3.1) — the spine runs and the suite is green, but no real founder has
driven a real go-to-market win to the gate yet. See `docs/STATE.md` for the honest current
snapshot.

Drover (formerly GTM IDE) is the go-to-market desk for founders running more than one
product. It is local-first: point it at a product's codebase and it reads what the product
actually does; state a go-to-market goal in plain words and a frontier model composes the
pipeline of agents and steps that goal needs; every pipeline stops at a founder approval
gate — nothing sends, publishes, or charges until the founder says yes; and every gate
decision trains a durable taste memory that shapes the next run.

Three things are enforced by the host. Everything else is the model's to compose freshly:

1. **Truth.** A read-only scan produces product claims with `file:line` evidence. Claims
   about what the product already does are cited or labeled inferred — the model cannot
   invent product facts. (The citation rule binds the truth layer only; ideation and
   strategy run free.)
2. **The wall.** Every execute step must have a founder gate upstream on every path or the
   composition is rejected outright. The default execute connector stages locally and never
   sends. The wall graduates rather than disappears: a founder may explicitly promote a
   pipeline up the autonomy ladder (`draft → trusted → autonomous`), where the gate
   auto-applies a blessed pattern to clean items and still escalates exceptions. Only the
   founder can promote; composition and runs cannot.
3. **Taste.** Approvals, rejections, and edits at the gate become durable per-founder
   memory. Drafting agents are required to consult it before writing; skipping the consult
   is surfaced at the gate.

Intelligence is rented, not hosted: fuzzy work (research, enrichment, ideation, drafting)
runs as agents and skills on the founder's own Claude subscription, keyless. Code is the
deterministic spine only.

## The dogfood loop

Drover files and builds its own improvements. From any codebase, in any Claude session
connected to Drover's MCP server:

- `report_friction` — a complaint or wish, uttered mid-flow, lands as agent-readable
  markdown in `dogfood/queue/` with the current project/run/gate state attached.
- `request_feature` — spins up a headless builder agent in an isolated git worktree of this
  repo, one build at a time. The result is a `dogfood/*` branch that **waits for founder
  review**; nothing merges, pushes, or ships from the loop. Crash recovery at boot salvages
  interrupted work and marks its queue item honestly.
- `get_dogfood_queue` — what's open, queued, building, ready for review, declined, failed.

## Run

Requirements: Node.js, Git, and a Claude Code login (composition is rented on the
founder's subscription; with no connection the composer refuses rather than templating).

Install dependencies once (this also installs the `brain/` and `ui/` subprojects), then
start:

```sh
npm install
npm start
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). Register a product by pointing the
folder picker at its repo and naming the event that counts as a real win.

MCP front door (use Drover as tools from any Claude session):

```sh
npm run mcp
```

Direct repository scan:

```sh
node brain/src/mirror.mjs <repo> --win <event>
```

The acceptance case: scanning `~/Buffalo-Projects` with `project_created` reports a proven
attribution gap — the win event fires with no acquisition source attached — from cited
evidence.

## Desktop app (macOS)

The desktop shell (`electron/`) wraps the same brain and client — no terminal. It repairs
the Finder PATH (so the operator can find `claude` and `git`), boots the brain on a free
loopback port, waits for `/api/health`, then opens the window. State lives in `~/.gtm-ide`
and `~/.claude`, shared with the `npm start` dev server.

One-time setup (rebuilds and ad-hoc signs the native SQLite module against Electron's ABI —
without the signature, macOS Library Validation kills the engine on launch):

```sh
npm install
npm run app:rebuild
```

Run windowed: `npm run app` · Build the unsigned local `.dmg` (output in `release/`):
`npm run app:dist`. On first launch, right-click the app and choose **Open** to clear
Gatekeeper. With no `.env.local` present it runs fully local — no team sync, no onboarding
gate.

## Verify

```sh
npm test
```

Runs the brain test suite (scanner regressions, gate-wall and connector invariants, the
autonomy ladder, taste-consult enforcement, operator lifecycle, persistence, the anti-cage
doctrine tests, the dogfood spine), then frontend lint and the production build.

## Architecture

```text
brain/src/scan.mjs             read-only repository analysis with file:line citations
brain/src/workflow-composer.mjs model-owned composition; assertGateWall re-asserted by the host
brain/src/composition.mjs      injectable composer (live: Claude on the founder's subscription)
brain/src/graph.mjs            dependency-aware graph execution (tool/agent/skill/code/mcp steps)
brain/src/graph-operations.mjs validated typed graph patches; founder-owned gate config protected
brain/src/agent-bridge.mjs     rented intelligence: subagents + skills on the subscription
brain/src/operator-runtime.mjs the resident operator: goal → compose → run → pause at the gate
brain/src/project-store.mjs    products, pipelines, shared intelligence, the autonomy ladder
brain/src/memory.mjs           taste: gate decisions → durable memory → next composition
brain/src/board.mjs            belief/health derivations from real signals only, never seeded
brain/src/friction.mjs         dogfood queue (agent-readable markdown items)
brain/src/feature-builder.mjs  request_feature: isolated-worktree builder, branch waits for review
brain/src/mcp.mjs              the MCP front door (37 tools) bridging to the local brain
brain/src/server.mjs           local API + static client
ui/                            React, Tailwind, React Flow — the canvas and the gate
```

In code the pipeline unit is still identified as `channel` — a historical identifier, not a
concept; product language says "pipeline." See `AGENTS.md` for engineering doctrine and the
invariants a change must preserve.

## Safety boundary

- Scanning is read-only; a private repo never leaves the machine.
- General GTM execution stops at founder gates; the included execution connector stages
  approved actions locally.
- Real sends (e.g. Gmail) run only on per-item gate stamps that config cannot forge, with a
  rate cap and a provenance header tracing every message to its run and item.
- The gated microproduct deploy ships only under two explicit founder authorizations.
- The dogfood builder works in isolated worktrees on `dogfood/*` branches and never merges,
  pushes, or touches the founder's working tree.
