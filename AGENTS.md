# Croki project instructions

Croki is Jacob's daily development environment for building real products with coding agents.

The user request chooses the work. These instructions govern how that work improves Croki.

Read `docs/project/current-state.md` before changing product direction. Read `docs/architecture/overview.md` before changing execution, state, or data flow.

## Always improve Croki

Every task in this repository has two responsibilities:

1. Complete the requested outcome.
2. Leave the exact part of Croki it touches better for daily product building.

Do not treat requests as isolated tickets. While completing the requested work, remove directly related friction, unclear state, repeated steps, weak wording, brittle behavior, and unnecessary product concepts when they can be fixed and proven in the same change.

The request still sets the boundary. Do not invent unrelated roadmap work or turn a focused fix into a product rewrite. Improve the real user path being touched, not the entire repository around it.

Croki is not finished. Current code, screens, docs, tests, names, workflows, and production behavior are evidence of what exists, not authority over what must continue to exist. Change them when a better complete result requires it. Preserve explicit safety, data, release, compatibility, and founder-authority boundaries.

Do not preserve a weak workflow because it already shipped. Do not bolt a feature onto a journey that should instead be shortened, combined, automated, reordered, or removed.

When the request is broad, inspect the current product, choose the strongest coherent improvement that can be completed now, and implement it. Do not stop at analysis or create a strategy document unless the user asked for one.

## What Croki must let the founder do

A founder should be able to:

1. Open a real repository.
2. Start or resume a Thread with the provider they choose.
3. Let that provider work through files, terminal, preview, tools, worktrees, and Git.
4. Understand the meaningful state of the work without reading every runtime event.
5. Intervene at the exact blocker, tradeoff, or product consequence that requires judgment.
6. Verify the result, review the change, recover when needed, and ship.

Croki wins when this loop becomes faster, clearer, safer, and more capable through daily use.

Thread carries the founder's direction. The selected provider performs the work. Canvas keeps the current outcome, important conclusions, evidence, and required judgment in view. Preview, checkpoints, review, and Git prove what actually changed.

Improve this loop before expanding into adjacent surfaces.

## Handle every product task this way

Before changing code:

- Inspect the relevant journey in the running product when possible. Otherwise trace the real path through UI, client state, server, provider, persistence, recovery, and Git.
- Read recent changes in the touched area so you do not revive a direction that was just removed.
- Find the exact moment where the founder waits, rereads, guesses, repeats work, loses work, leaves Croki, or cannot tell what happened.
- Define the concrete before and after in terms of what the founder sees, does, and can finish.
- Consider at least one approach that changes or removes the workflow instead of adding another control.
- Choose the smallest set of product concepts needed for the complete result, not the smallest code diff.

While changing the product:

- Prefer one complete path over several partial surfaces.
- Remove or merge concepts before adding modes, panels, settings, cards, nodes, schemas, agents, or dashboards.
- Reuse native behavior where it serves the result. Replace inherited behavior where it does not.
- Keep ordinary work in the dominant product loop. Do not force the founder through settings, files, logs, or another tool merely because the machinery already exists.
- Make intermediate state, completion, failure, recovery, persisted state, and the way back out clear.
- Never show success before the underlying action is complete.
- Preserve user work across refreshes, reconnects, provider failures, and app restarts wherever Croki promises durability.
- Fix directly adjacent breakage in the same user path when it can be safely completed and proven. Do not silently expand into unrelated work.

A backend primitive, schema, card, toggle, placeholder, hidden command, or demo route is not a finished product change. Ship the real entry point and the full usable path.

Do not ask Jacob to provide product wording, screen inventories, or implementation choices that can be inferred from the repository and the request. Make a strong reversible decision and show it in the product.

Product thinking must appear as actual users, screens, actions, system responses, decisions, and outcomes. Do not substitute words such as `intent`, `capability`, `context`, `visibility`, `coordination`, `orchestration`, or `agentic` for showing what changes in the product.

When behavior can affect web, desktop, mobile, providers, worktrees, remote connections, or wire contracts, inspect those exact surfaces and make unsupported cases explicit.

When the product contract changes, update the copy, tests, docs, migrations, and old paths that would otherwise preserve the previous behavior. Do not leave two competing products in the repository without a real compatibility reason.

## Keep these Croki boundaries

- Provider runtimes remain native by default. Do not add a hidden persona, planning loop, delegation policy, tool policy, workflow, or behavioral prompt.
- A behavior-changing harness must be explicitly selected, visible, scoped, reversible, and off by default.
- Runtime, context, tools, harnesses, and senses are separate. Opening, closing, selecting, or arranging Canvas must not change provider behavior or grant authority.
- Canvas is a zero-maintenance projection of real project and Thread activity. It should help the founder understand the work, not become a second runtime, conversation, task board, context editor, memory database, or manually maintained scene.
- Sense calls are read-only. Consequential actions still go through native Threads, tools, approvals, and authority checks.
- `.croki/application.json` is optional repository-owned application lineage. Released reality and building intent are founder-approved facts, not an agent-maintained memory. Never silently establish, promote, or rewrite them.
- `.croki/context.json` is a legacy Canvas compatibility format. Do not revive its node, release-board, or provider-injection model.
- Keep raw Canvas bodies, rendered prompts, private memory, and sensitive context out of receipts, logs, CI summaries, and artifacts.
- Do not import or revive the archived standalone `brain`, `relay`, runtime, or workflow machinery unless an explicit migration requires it.
- `main` mirrors `upstream/main`. Croki product work belongs on `croki/main`.
- Visible branding is Croki. Preserve compatibility identifiers allowed by `scripts/lib/brand-policy.ts` unless a deliberate migration is in scope.
- Release destinations stay independently gated. Never point publishing, signing, relay, web, Discord, mobile, or updates at inherited T3 destinations.

These are current product boundaries, not permission to freeze Croki. When a task deliberately changes one, update the implementation, migration path, current-state document, and proof together.

## Keep the implementation direct

- Keep state transitions deterministic and typed. Put provider, platform, and transport differences at adapter boundaries.
- Prefer direct ownership and simple code over new layers, registries, factories, generic frameworks, or speculative extension points.
- Use types to make invalid states difficult to represent.
- Comment why a non-obvious boundary exists, not what every line does. Keep comments accurate when behavior changes.
- Do not carry dead compatibility paths, dual writes, flags, or migrations without a real installed-state reason.
- Do not rewrite unrelated code while completing a focused product change.
- Tests should prove user-visible behavior, important state transitions, and failure paths rather than freeze implementation details.
- Async tests wait for typed receipts and worker drains, never arbitrary sleeps or polling.
- Keep Croki TSX files under 300 lines and model or service files under 500 lines unless splitting would make the behavior harder to follow.

`apps/server` owns local execution, providers, persistence, terminals, preview, Git, checkpoints, and runtime signals. `apps/web` is the primary product surface. `apps/desktop` owns Electron behavior and packaging. `apps/mobile` owns the mobile client. `packages/contracts` owns wire schemas. `packages/shared` and `packages/client-runtime` hold genuinely shared behavior.

Never use `pkill -f`, `pgrep | kill`, or kill a process selected by a name, path, or worktree match. Kill only a PID captured at spawn or a confirmed port owner running from this worktree.

`~/.t3/userdata` is the live install. Read-only inspection is allowed. Never run development against it, open it read-write, seed it, migrate it, or clean it.

Do not set `VITE_HTTP_URL` or `VITE_WS_URL` for development. Use isolated, gitignored state and the pairing URL printed by the dev runner. Never share that one-time URL.

Do not perform destructive Git, data, release, or production actions unless the task explicitly requires them.

## Prove the improvement

- Run the smallest focused tests, lint, and typecheck that prove the touched behavior.
- Run `npm run check:croki` for Croki product changes.
- Before an upstream sync, run `npm run report:croki-overlay -- --base <known-upstream-sha>`.
- Do not run the full repository test or typecheck matrix unless the task requires it. CI owns broad coverage.
- For UI work, exercise the real path at the relevant viewport and inspect the final pixels, interaction, empty state, loading state, failure state, and recovery.
- For provider or cross-surface work, verify each affected provider or client, or state the exact unsupported case.
- Do not call the task complete because it compiles. Confirm that the founder can perform the intended action and understand what happened.

Report completion in product terms: what the founder could do before, what they can do now, the evidence that it works, and any remaining risk. Do not lead with file counts or architecture summaries.
