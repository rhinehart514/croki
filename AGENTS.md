# T3 Code project contract

T3 Code is an open-source, bring-your-own-subscription GUI for coding agents. A Node WebSocket server wraps
provider CLIs and serves web, Electron desktop, and React Native mobile clients.

## Product invariants

- Stay open and forkable. Do not couple core behavior to private infrastructure.
- Protect performance. Watch WebSocket payload size, list rendering, GPU-heavy CSS, and continuously repainting
  animation.
- Preserve remote operation through local networks, Tailscale, and T3 Connect. Dev is single-origin.
- Treat web, desktop, and mobile as product surfaces. Provider-shaped behavior needs an explicit decision for
  Codex, Claude, Cursor, Grok, and OpenCode.
- Prefer the smallest model that makes correct behavior unsurprising. Do not preserve or introduce machinery
  merely because it looks architecturally impressive.

## Three safety hazards

1. **Killing by pattern.** Never use `pkill -f`, `pgrep | kill`, or kill a PID found by matching a name, path,
   or worktree string. Kill only a PID captured at spawn or a confirmed port owner whose process directory is
   this worktree.
2. **Touching the live install.** `~/.t3/userdata` is the developer's live database. Read-only inspection is
   allowed; never start a server against it, open it read-write, seed it, or clean it.
3. **Baking in origins.** Never set `VITE_HTTP_URL` or `VITE_WS_URL` for dev. Vite proxies `/api`, `/ws`,
   `/oauth`, and `/.well-known`; explicit localhost origins silently break remote browsers.

## Cross-surface impact

Before completing a behavior change, check only the dimensions it can affect:

- entry points: chat, Settings, command palette, and keybindings;
- clients: web, desktop shell/IPC, and mobile;
- providers: each adapter, including an explicit unsupported decision;
- wire contracts: schema, server, web, mobile, and desktop;
- reverse state: every way in needs a way out and a visible current state;
- connection modes: local, remote/relay, tunnel, multi-device, and multi-environment;
- documentation: user behavior in `docs/user`, architecture in `docs/architecture`, vocabulary in
  `docs/reference/encyclopedia.md`.

## Development and verification

- Install with `vp i`; run server and web with `vp run dev`.
- Worktrees default to their ignored `.t3` state. Trust the actual ports and pairing URL printed by
  `[dev-runner]`; never assume ports or hand over a bare origin.
- Run the smallest proof: `vp test run <files>` plus targeted lint or typecheck for the changed scope.
- Do not run repo-wide `vp check`, `vp run -r test`, or `vp run -r typecheck` unless asked. CI owns the full
  matrix.
- Backend behavior changes require focused tests. Wait for typed receipts and worker drains, never sleeps or
  polling.
- For interactive verification, use the project skills `test-t3-app` or `test-t3-mobile`; they own isolated
  state, pairing, simulator, browser, and process-lifecycle procedure.

## Architecture

Clients send typed WebSocket requests. The server turns them into commands; a pure decider emits persisted
events; a projector derives the read model. Provider CLIs run as subprocesses behind adapters. Queue-backed
reactors perform side effects and emit receipts. Each turn ends with a hidden-ref git checkpoint.

- `apps/server`: WebSocket orchestration, providers, checkpoints, reactors, and persistence. Before writing
  Effect code, read `.repos/effect-smol/LLMS.md` and `docs/operations/effect-fn-checklist.md`.
- `apps/web`: React/Vite UI. `apps/desktop` wraps it; `apps/mobile` is React Native; `apps/marketing` is the site.
- `packages/contracts`: Effect/Schema wire contracts only, without runtime logic.
- `packages/shared`: shared runtime utilities and subpath exports; no barrel.
- `packages/client-runtime`: behavior shared by web and mobile.
- `.repos`: vendored read-only references. Never edit or import from them; sync dependency references with
  `vpr sync:repos`.

Keep orchestration pure, UI simple, and provider or platform complexity at adapter boundaries. If a project rule
conflicts with the task, surface the concrete conflict before breaking it.
