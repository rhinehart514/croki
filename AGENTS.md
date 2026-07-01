# AGENTS.md — Drover (code identifiers: gtm-ide)

## Register boundary

Everything below is engineering register — file names, identifiers, data-flow shorthand. That is for changing this system, not for talking to Jacob. Anything surfaced to him — a decision, an option set, a status, a summary — gets translated to plain language per DOCTRINE's Writing rules first. This file teaches how the system works, not how to talk to him.

## Product purpose

The product's name is **Drover** — the go-to-market desk for founders running more than one product (renamed 2026-07-01; display strings say Drover, while package names, the MCP server key `gtm-ide`, storage paths like `~/.gtm-ide`, and provenance markers deliberately keep the old identifier — do not "fix" them). Drover is the IDE for go-to-market. Point it at a product's codebase; it reads what the product does and where wins enter; the founder states a GTM goal in plain words; it composes the agents and steps the goal needs behind a founder approval gate and runs to that gate. Nothing sends, publishes, or charges until the founder approves. Every gate decision trains taste for the next run. There is no required setup — no program to stand up, no policy, no template.

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

The unit the founder builds and runs is a **pipeline** — a staged flow to the gate. In code it is still identified as `channel` (`channel-store`, `composeGraphForChannel`, `promoteChannel`) — a historical identifier, not a concept. Product, UI, and operator language say "pipeline"; a deeper `channel` → `pipeline` rename is a deferred refactor with no functional change.

## Invariants (non-obvious — a coding agent will break these without knowing)

- The founder gate is the ONLY contract checkpoint. No pre-gate node blocks a run on item count or field names — pre-gate contracts are zeroed at run time so a freely-composed graph reaches the gate on whatever it produced; contracts stay advisory (UI), never a dead-end.
- Engine and node health derive from real signals (scan, run ledger, connectors, gate decisions) — never seeded. A subsystem with no signal reports that honestly, never a fake number.
- Scanning is read-only. Build may create a local branch and worktree but stops before commit, push, deploy, or PR — except a founder-approved, gated microproduct deploy.
- Intelligence is rented, not hosted. Fuzzy work (research, enrich, ideate, draft) is a skill or subagent reached through an open step (`agent` / `skill` / `code` / `mcp`), never a new Node connector. Code is the deterministic spine only.
- Composition is the model's, not a fixed skeleton (`composition.mjs`, injectable; live `createClaudeComposer`; doctrine in the editable `~/.claude/agents/gtm-compose-workflow.md`). The host normalizes the spec, binds the founder's I/O, and re-asserts the wall. The blank default refuses rather than falling back to a template.
- The canvas is a projection over an object model, not a fixed diagram. GTM mode and Product mode project two object models that never cross (see `docs/CANVAS.md`).

## Verification

- Scanner changes → regression coverage in `brain/test/scan.test.mjs`.
- Engine-derivation changes → `brain/test/engine.test.mjs`; the taste loop → `brain/test/memory.test.mjs`.
- Operator-runtime changes → `brain/test/operator-runtime.test.mjs`; typed graph changes and persistence → their corresponding tests.
- UI changes → `npm test` plus browser-verify the loop (goal launcher → operator "Go" → the run reaching the founder gate), node health + Problems rail, find-references, and partial-failure flows.
- Acceptance case: `~/Buffalo-Projects` with `project_created` → the expected result is a proven attribution gap, reported by the Measure subsystem from that same scanned win event.

## Definition of done

Behavior implemented, diff scoped, `npm test` passes, the visible flow checked when relevant, engine and node numbers stay derived from real state, and any publishing or external-state action remains explicitly founder-approved. Preserve unrelated user changes; this worktree may already be dirty.

Deeper module-by-module architecture is derivable from the repo and is no longer kept here (see `AGENTS.md.before-2026-07-01` for the prior long-form version). Two cages were removed: the connector-DAG taxonomy became the open node model (`tool`/`agent`/`skill`/`code`/`mcp`, see `docs/GOAL.md`), then the outcome-program / policy / foundry / portfolio layer was deleted. If a doc, test, or module still treats programs, policies, the foundry, or portfolio as load-bearing, it is stale.
