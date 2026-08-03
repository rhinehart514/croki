# Croki project instructions

Croki is Jacob's daily development environment for building real products with coding agents.

The standard is not “the code works” or “the feature exists.” Each meaningful change should save the founder time, remove uncertainty, protect work, improve a product decision, or make a serious build easier to finish repeatedly.

Croki currently builds on the upstream T3 Code foundation. Keep the reliable native execution loop, but do not let inherited code, names, screens, or workflows decide what Croki must become.

Read `docs/project/current-state.md` before changing product direction and `docs/architecture/overview.md` before changing execution or data flow.

## The product we are building

A founder should be able to:

1. Open a real repository.
2. Start or resume a Thread with the provider they choose.
3. Let the provider work through files, terminal, preview, tools, worktrees, and Git.
4. Understand the meaningful state of the work without reading every event.
5. Intervene at the exact blocker, tradeoff, or product consequence that needs judgment.
6. Verify the result, review the change, recover when needed, and ship.

Croki wins when this loop becomes faster, clearer, safer, and more capable in daily use.

Thread carries the founder's direction. The selected provider performs the work. Canvas keeps the current outcome, important conclusions, evidence, and required judgment in view. Native preview, checkpoints, review, and Git prove what actually changed.

Improve this loop before expanding into adjacent product surfaces.

## Product judgment

- Treat current code, docs, vocabulary, layouts, and production behavior as evidence, not authority.
- Anything in the product may change when the task requires a better result. Production is not sacred. Explicit safety, data, release, and authority boundaries still are.
- Use the request as direction, not as a frozen feature specification. Infer the complete outcome the user is trying to achieve.
- Do not patch only the visible symptom when a repeated step, screen, concept, or decision can disappear.
- Before adding something, consider whether the existing journey should be collapsed, automated, reordered, or rebuilt.
- Prefer one complete path over several partial surfaces.
- Remove or merge concepts before adding modes, panels, settings, cards, nodes, schemas, agents, or dashboards.
- Do not preserve a weak workflow merely because tests, docs, or production currently encode it.
- Do not build workflow scaffolding solely to compensate for limitations the selected provider no longer has.
- Ambition should deepen the requested outcome, not expand unrelated scope.

Product thinking must appear as actual users, screens, actions, system responses, decisions, and outcomes. Do not hide weak thinking behind words such as “intent,” “capability,” “context,” “visibility,” “coordination,” “orchestration,” or “agentic.” Use those terms only when they name exact code or a necessary technical distinction.

When the request is broad, do not stop at analysis or create a brainstorm document by default. Inspect the current product, choose the strongest coherent improvement reachable now, and implement it.

## Daily product work

Before changing code:

- Inspect the relevant journey in the running product when possible. Otherwise trace it through UI, state, server, provider, persistence, and recovery.
- Read recent changes in the touched area so you do not revive a direction that was just removed.
- Find the exact moment where the founder waits, rereads, guesses, loses work, leaves Croki, or cannot tell what happened.
- Consider at least one approach that changes the workflow instead of adding another control.
- Define the concrete before and after, then choose the smallest set of product concepts needed for the complete result, not the smallest diff.
- Reuse native behavior where it serves the result. Replace inherited behavior where it does not.

Do not ask Jacob to supply product wording, screen inventories, or implementation choices that can be inferred from the repository and the request. Make a strong reversible decision and show it in the product.

Ship the complete path. Include the real entry point, meaningful intermediate state, failure and recovery behavior, persisted state, and a clear way back out. A backend primitive, schema, card, toggle, placeholder, or demo route is not a finished product change.

Keep the founder in the dominant loop whenever possible. Do not expose machinery merely because it exists or force ordinary work through settings, files, or another tool.

Errors must be honest and actionable. Never show success before the underlying action is complete. Preserve user work across refreshes, reconnects, provider failures, and app restarts wherever Croki already promises that durability.

When behavior can affect web, desktop, mobile, providers, worktrees, remote connections, or wire contracts, inspect those exact surfaces and make unsupported cases explicit.

Update copy, docs, tests, migrations, and old paths when the product contract changes. Do not leave the old product implemented or described beside the new one without a real compatibility reason.

## Croki boundaries

- Provider runtimes remain native by default. Do not add a hidden persona, planning loop, delegation policy, tool policy, workflow, or behavioral prompt.
- A behavior-changing harness must be explicitly selected, visible, scoped, reversible, and off by default.
- Runtime, context, tools, harnesses, and senses are separate. Opening or arranging Canvas must not change provider behavior or grant authority.
- Canvas is a zero-maintenance projection of real project and Thread activity. It should help the founder understand the work, not become a second runtime, conversation, task board, context editor, memory database, or manually maintained scene.
- Sense calls are read-only. Consequential actions still go through native Threads, tools, approvals, and authority checks.
- `.croki/context.json` is repository-owned project truth. Agent-authored changes remain provisional. Never silently promote, retire, or rewrite founder-approved canon.
- Keep raw Canvas bodies, rendered prompts, private memory, and sensitive context out of receipts, logs, CI summaries, and artifacts.
- Do not import or revive the archived standalone `brain`, `relay`, runtime, or workflow machinery unless an explicit migration requires it.
- `main` mirrors `upstream/main`. Croki product work belongs on `croki/main`.
- Visible branding is Croki. Preserve compatibility identifiers allowed by `scripts/lib/brand-policy.ts` unless a deliberate migration is in scope.
- Release destinations stay independently gated. Never point publishing, signing, relay, web, Discord, mobile, or updates at inherited T3 destinations.

These are current boundaries, not an excuse to freeze the product. When a task deliberately changes one, update the code, migration path, current-state document, and proof together.

## Engineering and safety

- Keep state transitions deterministic and typed. Put provider, platform, and transport differences at adapter boundaries.
- Prefer direct ownership and simple code over new layers, registries, factories, or generic frameworks.
- Use types to make invalid states difficult to represent. Comment why a non-obvious boundary exists, not what each line does.
- Do not carry dead compatibility paths, dual writes, flags, or migrations without a real installed-state reason.
- Do not rewrite unrelated code while completing a focused product change.
- Tests should prove user-visible behavior, important state transitions, and failure paths rather than freeze implementation details.
- Async tests wait for typed receipts and worker drains, never arbitrary sleeps or polling.
- Keep Croki TSX files under 300 lines and model or service files under 500 lines unless splitting would make the behavior harder to follow.

`apps/server` owns local execution, orchestration, providers, persistence, terminals, preview, Git, checkpoints, and runtime signals. `apps/web` is the primary product surface. `apps/desktop` owns Electron behavior and packaging. `apps/mobile` owns the mobile client. `packages/contracts` owns wire schemas. `packages/shared` and `packages/client-runtime` hold genuinely shared behavior.

Never use `pkill -f`, `pgrep | kill`, or kill a process selected by a name, path, or worktree match. Kill only a PID captured at spawn or a confirmed port owner running from this worktree.

`~/.t3/userdata` is the live install. Read-only inspection is allowed. Never run development against it, open it read-write, seed it, migrate it, or clean it.

Do not set `VITE_HTTP_URL` or `VITE_WS_URL` for development. Use isolated, gitignored state and the pairing URL printed by the dev runner. Never share that one-time URL.

Do not perform destructive Git, data, release, or production actions unless the task explicitly requires them.

## Proof

- Run the smallest focused tests, lint, and typecheck that prove the touched behavior.
- Run `npm run check:croki` for Croki product changes.
- Before an upstream sync, run `npm run report:croki-overlay -- --base <known-upstream-sha>`.
- Do not run the full repository test or typecheck matrix unless the task requires it. CI owns broad coverage.
- For UI work, exercise the real path at the relevant viewport and inspect the final pixels, interaction, empty state, failure state, and recovery.
- For provider or cross-surface work, verify each affected provider or client or state the exact unsupported case.
- Do not call the task complete because it compiles. Confirm that the founder can perform the intended action and understand what happened.

Report completion in product terms: what the founder could do before, what they can do now, the evidence that it works, and any remaining risk. Do not lead with file counts or architecture summaries.
