# Croki project instructions

Croki is Jacob's daily development environment for building real products with coding agents.

The user request chooses the work. These instructions govern how that work improves Croki.

Read `docs/project/current-state.md` before changing product direction. Read
`docs/internals/overview.md` before changing execution, state, or data flow.

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

**Mobile** is a React Native app for iOS and Android. It connects to Croki
servers so the founder can direct and inspect the same work remotely.

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

- **Entry points.** A behavior reachable from the chat view is usually also reachable from Settings, the command palette, and a keybinding. Fixing one is not fixing the feature.
- **Clients.** Web, desktop (wraps web, adds Electron shell/IPC), and mobile (React Native, separate navigation). Shared logic lives in `packages/client-runtime`
- **Providers.** Codex, Claude, Cursor, Grok, and OpenCode each have an adapter. Provider-shaped features need a decision per adapter, even if the decision is "not supported here".
- **Contracts.** Anything crossing the wire is typed in `packages/contracts`. Change the schema and the server, web, mobile, and desktop all follow.
- **Reverse states.** If you added a way in, add the way out and the way to see it. Snooze needs unsnooze. Close needs reopen. A one-way door is a bug.
- **Connection modes.** Local, remote/relay, and tunnel behave differently. Multi-device and multi-environment cases are real.
- **Docs.** `docs/` splits by audience. Behavior changes that a user would notice belong in `docs/user/` (shipped-product voice, no repo tooling or source paths); architecture and contributor changes in `docs/internals/`; runbooks in `docs/operations/`; new vocabulary in `docs/internals/glossary.md`.

- Croki is a harness host, not a harness. A default turn uses the selected
  provider's native behavior and adds no Croki-authored persona, planning loop,
  delegation policy, tool policy, workflow, behavioral instruction, application
  brief, sibling activity, project summary, or hidden context.
- Anything Croki applies that can affect the model must be chosen by the user,
  visible before send, scoped to the turn or a provider-native persistence
  mechanism, recorded with the turn, removable, and reversible. The absence of
  applied configuration is the default; do not create a selectable `Native`
  mode or silently emulate persistence by repeating prompts.
- Instructions, context attachments, provider runtime, tools, and senses are
  distinct. Enabling a tool does not authorize Croki to add instructions about
  when or how the model should use it. Opening, closing, selecting, or arranging
  Canvas must not change provider behavior, context, tool access, or authority.
- Prefer provider- and repository-native configuration such as `AGENTS.md`,
  skills, plugins, MCP configuration, and provider-owned project instructions.
  Croki may discover, explain, open, install, enable, or attach them, but must
  not translate them into an invisible proprietary prompt layer.
- Product, GTM, Venture, Parallel Threads, and other historical Croki behavior
  IDs are legacy compatibility data only. Existing turns remain readable; the
  IDs are never offered for a new turn and cannot reactivate model behavior.
- Canvas is a zero-maintenance projection of real project and Thread activity. It should help the founder understand the work, not become a second runtime, conversation, task board, context editor, memory database, or manually maintained scene.
- Sense calls are read-only. Consequential actions still go through native Threads, tools, approvals, and authority checks.
- `.croki/application.croki` is a repository-owned application brief for the
  founder and Croki UI. Its existence never sends it to a provider. A user may
  attach it visibly for one turn or reference it from provider-native project
  instructions. Create or edit it only when the founder explicitly asks for or
  confirms that product delta, through normal files, Git, and Review rather
  than dedicated setup UI. `.croki/application.json` and historical Concept,
  Release, and Venture schemas remain compatibility input, not active product
  surfaces or automatic model context.
- `.croki/context.json` is a legacy Canvas compatibility format. Do not revive its node, release-board, or provider-injection model.
- Keep raw Canvas bodies, rendered prompts, private memory, and sensitive context out of receipts, logs, CI summaries, and artifacts.
- Do not import or revive the archived standalone `brain`, `relay`, runtime, or workflow machinery unless an explicit migration requires it.
- `main` mirrors `upstream/main`. Croki product work belongs on `croki/main`.
- Visible branding is Croki. Preserve compatibility identifiers allowed by `scripts/lib/brand-policy.ts` unless a deliberate migration is in scope.
- Release destinations stay independently gated. Never point publishing, signing, relay, web, Discord, mobile, or updates at inherited T3 destinations.

These are current product boundaries, not permission to freeze Croki. When a task deliberately changes one, update the implementation, migration path, current-state document, and proof together.

- `vp i` installs. Worktrees get this from the croki.json setup script; if module resolution looks broken, it probably did not run.
- `vp run dev` starts server and web. In a worktree, state defaults to that worktree's gitignored `.t3`, which deliberately outranks an ambient `T3CODE_HOME` so you cannot land on shared state by accident. An explicit `--home-dir` still wins.
- Ports derive from the worktree path and are stable across restarts, but read the real ones from the `[dev-runner]` line since occupied ports shift.
- Sharing over the tailnet is three steps: run `vp run dev --share` in the background, wait for the `pairingUrl:` line in its output, paste that full URL (token included) in your reply. Do not wire up `tailscale serve` by hand for this, and do not open the URL yourself.
- The web app requires pairing. Hand over the pairing URL, not the bare origin. A URL without its token is useless to whoever you gave it to. If the token got consumed, mint a fresh one with `node apps/server/src/bin.ts pair` — note it carries standard scopes, while the startup URL carries admin scopes (needed for Settings → Connections management).
- Stop what you started, by the PID you tracked. See rule 1.

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

- Never make a PR unless the developer explicitly asks you to do so.
- Conventional commit titles, plain language: `fix(web): new threads no longer spike CPU`.
- Body: the problem in a sentence or two, then how you fixed it. End with the model and execution environment that did the work.
- **Rebase onto latest main before opening.** Stale branches conflict and burn a review round.
- UI changes need before/after images. Motion or timing needs a short video.
- One concern per PR. If the description says "also", split it.
- When babysitting: poll checks and comments newer than the last push, verify each bot finding against the source, fix real ones, dismiss false positives with a written reason. Stay quiet when nothing is new. Stop when the bots are green on the latest commit.

## How it works

Clients send typed WebSocket requests. The server turns them into _commands_, a pure _decider_ turns commands into persisted _events_, and a _projector_ derives the read model the UI renders. Provider CLIs run as subprocesses; per-provider _adapters_ translate their native protocols into orchestration events. Side effects run in queue-backed _reactors_ that emit _receipts_ when milestones land. Each turn ends with a _checkpoint_, a hidden git ref, so the app can diff and restore.

Full glossary with file links: `docs/internals/glossary.md`

## Where code lives

- `apps/server` - WebSocket, orchestration, providers, checkpointing. Effect-heavy: read `.repos/effect-smol/LLMS.md` before writing Effect code.
- `apps/web` - React/Vite UI. `apps/desktop` wraps it, `apps/mobile` is React Native, `apps/marketing` is the site.
- `packages/contracts` - Effect/Schema contracts plus small derived helpers. No heavy runtime logic.
- `packages/shared` - shared runtime utils, subpath exports, no barrel.
- `packages/client-runtime` - client code shared by web and mobile.
- `.repos/` - vendored read-only references. Prefer their patterns over invented ones. Never edit or import from them. Sync with `vpr sync:repos` when bumping the matching dependency.

## Taste

- Complexity belongs at the adapter boundary. Orchestration stays pure, UI stays dumb.
- Inferred types over annotations. `any` is the enemy.
- Comments describe how a thing is used, and move when the code moves. To be used mostly to describe functions, not to annotate every line of behavior.
- Our users drive agents all day and notice a dropped frame, a lying spinner, and a stale label. No continuously repainting animations; they peg the GPU on high-refresh displays.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.

## Additional tips

- Don't verify with browsers or computer use unless the user explicitly agrees or requests it.
- Security is important, but should not be over-indexed on, especially for dev mode/maintainer-only features.
