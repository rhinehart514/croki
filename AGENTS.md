## Picking the right models for workflows and subagents

Rankings, higher = better. Cost reflects what I actually pay (OpenAI has really generous limits), not list price. Intelligence is how hard a problem you can hand the model unsupervised. Taste covers UI/UX, code quality, API design, and copy.

| model    | cost | intelligence   | taste |
|----------|------|----------------|-------|
| gpt-5.5  | 9    | 8              | 5     |
| sonnet-5 | 5    | 5              | 7     |
| opus-4.8 | 4    | 7              | 8     |
| fable-5  | 2    | 9              | 9     |

How to apply:
- **Fable-5 is opt-in only — never a default.** Use fable-5 ONLY when I explicitly call for it (I name fable). Do not reach for it on your own — not for spec-writing, not for reviews, not for anything. When a task would otherwise point to fable, use opus-4.8 instead.
- These are defaults, not limits. You have standing permission to override them: if a cheaper model's output doesn't meet the bar, rerun or redo the work with a smarter model without asking. Judge the output, not the price tag. Escalating costs less than shipping mediocre work.
- Cost is a tie-breaker only; when axes conflict for anything that ships, intelligence > taste > cost.
- Bulk/mechanical work (clear-spec implementation, data analysis, migrations): gpt-5.5 — it's effectively free.
- Anything user-facing (UI, copy, API design) needs taste ≥ 7.
- Reviews of plans/implementations: opus-4.8 (fable-5 only if I explicitly call for it), optionally gpt-5.5 as an extra independent perspective.
- Never use Haiku.
- Mechanics: gpt-5.5 is only reachable through the Codex CLI — `codex exec` / `codex review` (my ~/.codex/config.toml defaults to gpt-5.5). Use the codex-implementation, codex-review, and codex-computer-use skills; for work they don't cover (investigation, data analysis), run `codex exec -s read-only` directly with a self-contained prompt.
- Claude models (sonnet-5, opus-4.8, fable-5) run via the Agent/Workflow model parameter.

Using gpt-5.5 inside workflows and subagents (the model parameter only takes Claude models, so use a wrapper):
- Spawn a thin Claude wrapper agent with `model: 'sonnet', effort: 'low'` whose prompt instructs it to write a self-contained codex prompt, run `codex exec` via Bash, and return

# AGENTS.md — Drover (code identifiers: gtm-ide)

## Register boundary

Everything below is engineering register — file names, identifiers, data-flow shorthand. That is for changing this system, not for talking to Jacob. Anything surfaced to him — a decision, an option set, a status, a summary — gets translated to plain language per DOCTRINE's Writing rules first. This file teaches how the system works, not how to talk to him.

## Product purpose

The product's name is **Drover** — the visual product-development and go-to-market desk for founders running more than one product (renamed 2026-07-01; display strings say Drover, while package names, the MCP server key `gtm-ide`, storage paths like `~/.gtm-ide`, and provenance markers deliberately keep the old identifier — do not "fix" them). Point Drover at a product's codebase and it gives Claude and Codex one living canvas where dozens of independent and related product/GTM goals can be understood, created, changed, run safely, and learned from. Model work becomes editable canvas material; only work that needs execution or repeatability expands into a pipeline. Nothing sends, publishes, deploys, merges, or charges until the founder approves. Every decision and edit trains taste for later work. There is no required mission, primary goal, program, policy, template, or pipeline before useful work begins. `docs/OPEN-CANVAS-SPEC.md` is the target product contract; `docs/STATE.md` separates that target from what is currently built.

## Stage: Alpha

STAGE: alpha

Drover is in **alpha** (v0.3.1). Alpha describes its market maturity, not permission to lower the build standard. No real founder has yet driven a real go-to-market win to the gate, so that first attributable win remains the alpha bet. Every slice called built must be production-ready for its declared scope: reliable, coherent, tested, and safe for a real founder. Keep "production-ready" separate from "market-validated." The honest, dated snapshot lives in `docs/STATE.md`; keep it current when something material changes.

Per-stage behavior rules live in the global DOCTRINE.md ("Stages"). At alpha, narrow the bet and move quickly: rewrite freely, cut speculative breadth and unnecessary operational machinery, but do not cut correctness, trust, or craft. The weekly question is what smallest production-ready slice gets Drover in front of a stranger sooner. Exit test: feature-complete and a stranger Jacob didn't recruit survives it.

## The bar for product & design work

Every surface, feature, and copy change is held to two standards on top of the harness rules — a build is not done when it merely functions:

1. **Market-first.** The test is not "does it work," it is "does it matter, would a founder choose it, is it positioned clearly enough to decide on." A strong build with a weak position is unfinished work — make it understandable and well-positioned before calling it done.
2. **Beautiful by default.** Reference-grade craft held to a frontier-lab bar, not generic startup or template output. Design inside the product's real system (light ground, monochrome zinc, Geist, semantic color only, no decorative gradients). Apply the substitutability test: if a stranger could guess the design before the screen finishes loading, it is still the mean — ship the specific instead. Route non-trivial UI through the `/design` craft layer and audit it against that bar before it ships.

## Canonical commands

- Run: `npm start` (builds UI, then serves API + client from `brain/src/server.mjs`)
- Full verification: `npm test` (brain tests → lint → build)
- Brain tests only: `npm --prefix brain test`; one file: `node --test test/<name>.test.mjs` from `brain/`; one test: add `--test-name-pattern '<regex>'`
- Lint: `npm run lint` · Build: `npm run build` (both target `ui/`)
- Live smoke (skips unless a founder is signed in): `npm --prefix brain run test:live`
- MCP server (agent front door): `npm run mcp`
- Direct scan: `node brain/src/mirror.mjs <repo> --win <event>`

## The harness — the only three things the host constrains

The design holds the rented model on a short leash for exactly three things and lets it run free on everything else. Do not re-grow a fourth constraint.

1. **Truth.** A read-only scan with `file:line` evidence. Claims about what the product *already does* come from the scan or are labeled inferred; the model cannot invent product facts. The citation rule binds the truth layer ONLY — ideation, strategy, and composition run free and are never forced to cite a line.
2. **The Wall (founder gate).** Nothing reaches the outside world without explicit founder approval. Every `execute` node must have a founder `gate` upstream on every path or composition is rejected (`assertGateWall`); the default execute connector stages locally and never sends. The wall GRADUATES, never disappears: a founder may explicitly promote a pipeline up the autonomy ladder (`draft → trusted → autonomous`) so the gate auto-applies a blessed pattern to clean items and still escalates exceptions. Autonomy is set ONLY by an explicit founder promotion — never by composition, never by a run; the typed graph path rejects forging autonomy onto a gate node. Same rule for the gated microproduct deploy: it ships only under two founder authorizations, never by composition or a run.
3. **Taste.** The run ledger of gate decisions becomes durable memory that shapes the next run. A drafting agent must consult `get_taste`; a visual one must also consult `get_design`.

The host also owns durable state and typed, validated graph mutations. Everything else — what the pipelines are, which agents compose, how the graph branches — is the model's job, decided fresh each run, never pre-structured by host-side domain objects.

## Do NOT re-introduce (deleted 2026-06-29 as a second cage)

The outcome-program / agent-creation-policy / capability-foundry machinery, the opportunity accept/reject board, portfolio composition, blocking input contracts, and the `provided`/`discovered` source-mode gymnastics. These made the model satisfy an ontology instead of doing go-to-market, and runs dead-ended before the gate. If you find yourself adding a program, a policy, a required pre-run object, or a contract that blocks a run before the gate — stop, that is the cage. No closed GTM-channel enum, no output kind fixed to email/message, no fixed stage skeleton (guarded by `brain/test/anti-cage.test.mjs`).

## Vocabulary

A **goal** is one thing the founder wants to understand, change, make, achieve, or learn; each product has zero to many, with no privileged singleton mission. A **pipeline** is only an executable or repeatable path to the wall. In code it is still identified as `channel` (`channel-store`, `composeGraphForChannel`, `promoteChannel`) — a historical identifier, not a concept. Product, UI, and operator language say "pipeline" only when execution is actually being discussed; a deeper `channel` → `pipeline` rename remains a deferred refactor with no functional change.

## Invariants (non-obvious — a coding agent will break these without knowing)

- The founder gate is the ONLY contract checkpoint. No pre-gate node blocks a run on item count or field names — pre-gate contracts are zeroed at run time so a freely-composed graph reaches the gate on whatever it produced; contracts stay advisory (UI), never a dead-end.
- Engine and node health derive from real signals (scan, run ledger, connectors, gate decisions) — never seeded. A subsystem with no signal reports that honestly, never a fake number.
- Scanning is read-only. Build may create a local branch and worktree but stops before commit, push, deploy, or PR — except a founder-approved, gated microproduct deploy.
- Intelligence is rented, not hosted. Fuzzy work (research, enrich, ideate, draft) is a skill or subagent reached through an open step (`agent` / `skill` / `code` / `mcp`), never a new Node connector. Code is the deterministic spine only.
- Composition is the model's, not a fixed skeleton (`composition.mjs`, injectable; live `createClaudeComposer`; doctrine in the editable `~/.claude/agents/gtm-compose-workflow.md`). The host normalizes the spec, binds the founder's I/O, and re-asserts the wall. The blank default refuses rather than falling back to a template.
- The canvas is a projection over durable authorities, not a second source of truth or a fixed diagram. Product and GTM authorities remain distinct internally where truth and permissions require it, but goals, work artifacts, product context, paths, decisions, and outcomes coexist and relate on one founder-facing canvas (see `docs/OPEN-CANVAS-SPEC.md`).

## Verification

- Scanner changes → regression coverage in `brain/test/scan.test.mjs`.
- Engine-derivation changes → `brain/test/engine.test.mjs`; the taste loop → `brain/test/memory.test.mjs`.
- Operator-runtime changes → `brain/test/operator-runtime.test.mjs`; typed graph changes and persistence → their corresponding tests.
- UI changes → `npm test` plus browser-verify the loop (plain-language goal → visible canvas work → local correction → optional path reaching the founder wall → outcome return), multi-goal independence and conflicts, node health + Problems rail, find-references, and partial-failure flows.
- Acceptance case: `~/Buffalo-Projects` with `project_created` → the expected result is a proven attribution gap, reported by the Measure subsystem from that same scanned win event.

## Definition of done

Behavior implemented, diff scoped, `npm test` passes, the visible flow checked when relevant, engine and node numbers stay derived from real state, and any publishing or external-state action remains explicitly founder-approved. Preserve unrelated user changes; this worktree may already be dirty.

Deeper module-by-module architecture is derivable from the repo and is no longer kept here (see `AGENTS.md.before-2026-07-01` for the prior long-form version). Two cages were removed: the connector-DAG taxonomy became the open node model (`tool`/`agent`/`skill`/`code`/`mcp`, see `docs/GOAL.md`), then the outcome-program / policy / foundry / portfolio layer was deleted. If a doc, test, or module still treats programs, policies, the foundry, or portfolio as load-bearing, it is stale.
