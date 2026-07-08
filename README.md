# Drover

**Alpha · v0.3.2** — the product runs end to end and the test suite is green, but no outside
founder has driven a real go-to-market win through it yet. `docs/STATE.md` has the honest,
dated snapshot.

**Drover turns frontier models into your go-to-market team — and gets better every time the
models do.** Point it at your product, tell it what you want in plain English, and it builds
and runs the pipelines to get there — outreach, content, campaigns — while you stay the one
making the calls.

Everyone running AI agents hits the same wall: the agents can do the work, but *you* become
the bottleneck — reviewing every output, re-feeding context, babysitting loops that don't
share what they know. Drover is the structure that fixes that. You run many agent pipelines
at once and stay the **taste executor**: the person deciding what's good enough, what needs
to change, and where to point the system next.

## Why it grows with the models

Drover rents the intelligence and owns the harness. The agents run on frontier Claude, on
your own subscription — so every model release makes them smarter with no change on your
side. What Drover holds is the part that *doesn't* get obsoleted:

- **It reads your actual product.** A read-only scan of your codebase produces claims about
  what your product really does, cited to `file:line`. The model can't invent facts about
  your product, so the work it produces is true to what you built, not generic.
- **Nothing sends without you.** Every step that touches the outside world sits behind your
  approval. Drafts stage locally; nothing sends, publishes, or charges until you say go. As
  you come to trust a pipeline, you can let it handle the routine cases on its own and only
  pull you in on the exceptions.
- **It learns your taste.** Every approval, rejection, and edit becomes durable memory that
  shapes the next run — so the tenth draft sounds like you without re-explaining.

Rent the intelligence, own the harness. The models get better; everything you run inside
Drover gets better with them. The judgment stays yours — the volume stops being your problem.

Intelligence is rented, not hosted: research, enrichment, ideation, and drafting run as
agents and skills on your Claude subscription, keyless. Code is the deterministic spine —
the truth, the wall, and the taste memory — and nothing more.

## The dogfood loop

Drover files and builds its own improvements. From any codebase, in any Claude session
connected to Drover's MCP server:

- `report_friction` — a complaint or wish, said mid-flow, lands as agent-readable markdown
  in `dogfood/queue/` with the current project, run, and gate state attached.
- `request_feature` — spins up a headless builder agent in an isolated git worktree, one
  build at a time. The result is a `dogfood/*` branch that **waits for founder review** —
  nothing merges, pushes, or ships from the loop. Crash recovery at boot salvages interrupted
  work and marks its queue item honestly.
- `get_dogfood_queue` — what's open, queued, building, ready for review, declined, failed.

## Run

Requirements: Node.js, Git, and a Claude Code login (the intelligence runs on your
subscription; with no connection Drover refuses rather than templating).

Install once (this also installs the `brain/` and `ui/` subprojects), then start:

```sh
npm install
npm start
```

First run needs a signed-in Claude: Drover runs every act of intelligence on your own Claude
subscription through the local Claude Code harness. If no Claude is signed in, Drover shows a
blocking "Connect Claude" screen and does no AI work until it connects — install Claude Code
and run `claude` to sign in, or set `CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY`.

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). Register a product by pointing the
folder picker at its repo and naming the event that counts as a real win.

Use Drover as tools from any Claude session (the MCP front door):

```sh
npm run mcp
```

Scan a repository directly:

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
brain/src/mcp.mjs              the MCP front door bridging to the local brain
brain/src/server.mjs           local API + static client
ui/                            React, Tailwind, React Flow — the canvas and the gate
```

In code the pipeline unit is still identified as `channel`, and package names / storage
paths keep the old `gtm-ide` identifier — historical, not a concept. Product language says
"pipeline." See `AGENTS.md` for engineering doctrine and the invariants a change must
preserve.

## Safety boundary

- Scanning is read-only; a private repo never leaves the machine.
- GTM execution stops at founder gates; the included execution connector stages approved
  actions locally.
- Real sends (e.g. Gmail) run only on per-item gate stamps that config cannot forge, with a
  rate cap and a provenance header tracing every message to its run and item.
- The gated microproduct deploy ships only under two explicit founder authorizations.
- The dogfood builder works in isolated worktrees on `dogfood/*` branches and never merges,
  pushes, or touches the founder's working tree.
