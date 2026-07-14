# F2 — Teammates work

**Goal:** a teammate drives real work through the existing runtime adapters directly — no operator
session record, no compiled graph. Fork creates bets; staged artifacts attach to bets; anything
outward parks at the wall.

## Context (scout receipts)

- The adapter contract is `runtimes/index.mjs:1-98`: `id/label/isAvailable/drive(ctx)`. The ctx
  seam the adapters actually use (nothing else is load-bearing): `isCancelled`, `currentStatus`,
  `onTurn`, `onText`, `onToolStart`, `onToolError`, `runTool`, `onRuntimeSession`, `onCost`,
  `resumePrompt`/`runtimeSessionId`, `spentUsd`/`maxSteps`/`stepCount`, `model`, `system`, `tools`.
  See `operator-runtime.mjs:163-250` for the reference ctx build — rebuild that ctx in ~80 lines,
  do not port the 1,167-line runtime.
- Model routing: `runtimeForModel` (`runtimes/index.mjs:45-50`): `gpt-*`→codex, `claude-*`→claude-code.
- `tool-safety.mjs` FORBIDDEN_TOOL must screen every tool name offered.
- `consult-guard.mjs` (`assertMoatConsulted`) requires drafting work to consult taste.
- `capability-registry.mjs` classifies effects (readTargets/writeTargets/external/irreversible/
  financial) into lanes FOUNDER_WALL / REVERSIBLE_LOCAL / READ_ONLY. This is the outward classifier.

## Build

Create `brain/src/firm/work-loop.mjs`:

1. **`driveTeammate({ ventureId, teammateRef, goal, betId?, model? })`** — builds ctx, selects the
   runtime via `selectRuntime`, and drives to the next pause. Resume state lives on the bet (or on
   a tiny per-teammate work record if no bet yet): `runtimeSessionId`, `stepCount`, `spentUsd`,
   `pausedFor?`. That is the whole session — no 40-field record.
2. **The tool set** (each screened by FORBIDDEN_TOOL, each an ordinary function over the firm
   core): `read_truth` (scan report + product model read), `get_taste` (memory.mjs draft memory /
   queryTaste), `fork_bet`, `stage_artifact` (attach content to `bet.staged[]`),
   `stage_outward` (classify via capability-registry; FOUNDER_WALL lane → `wall.park()` from F3;
   never executes), `ask_founder` (parks one question at the wall queue), `speak` (narration event).
   Teammate soul + voice loads into `system`; taste consult is enforced by `consult-guard` before
   any staged draft can park at the wall.
3. **Events**: append work events (text beats, tool starts, staged artifacts) to a bounded
   per-bet event log in the venture store — this is what the composer/lens streams.
4. **Divergence is prompt-level, not host logic**: the system prompt tells the teammate to fork
   genuinely divergent bets when facing a goal; the host never enforces a count or axes.

## Acceptance (tests under `brain/test/firm/`, fake runtime via injected `query`/`client` as the
existing runtime tests do)

- A fake-runtime drive takes a founder goal, forks two bets with distinct intents, stages a draft
  on each, and parks one outward send at the wall — with zero imports from the Dies list.
- A staged draft that never consulted taste is refused by the consult guard.
- Tool names matching FORBIDDEN_TOOL are refused at the seam.
- Resume: a paused drive resumes from `runtimeSessionId` state only.
- `runtimeForModel` routes `gpt-*`→codex and `claude-*`→claude-code unchanged (existing tests keep
  passing). Nothing committed.
