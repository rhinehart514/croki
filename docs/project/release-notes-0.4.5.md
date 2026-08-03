# Croki 0.4.5 stabilization notes

Status: Unreleased

Croki 0.4.5 is a bug-fix release focused on making regular desktop startup,
Founder Mode, and Parallel Threads dependable in daily use.

## Fixed

### Codex collaborator lifecycle states

Parallel Threads now translates every collaborator state emitted by the Codex
protocol into the existing Workstreams lifecycle:

| Codex state   | Workstreams state |
| ------------- | ----------------- |
| `pendingInit` | Waiting           |
| `running`     | Running           |
| `completed`   | Completed         |
| `errored`     | Failed            |
| `notFound`    | Failed            |
| `interrupted` | Stopped           |
| `shutdown`    | Stopped           |

Croki 0.4.4 recognized only a subset of these protocol values. A collaborator
that was starting, interrupted, or missing therefore appeared as `Unknown`,
leaving the founder unable to tell whether parallel work was waiting, stopped,
or had failed.

The Workstreams projection remains provider-neutral. This fix changes only the
Codex activity translation and does not add another task or coordination
system.

### Regular Croki opens with long project histories

Croki 0.4.4 could remain open without showing a window while a new persistent
project-perception cache replayed the full orchestration history. Profiles with
large histories could spend minutes rebuilding derived Canvas state before the
desktop considered the local server ready.

Croki 0.4.5 removes that startup cache and derives the project-wide Canvas
model on demand from durable Thread projections. Sibling Thread conclusions,
provenance, and `sense_inspect` object lookup remain available without a second
persisted model or startup rebuild. The desktop also keeps probing a live local
server after a readiness timeout instead of permanently missing a late healthy
state. Existing project data and the applied database migration remain intact.

## Verification

Run the focused Workstreams, startup, projection, and release checks:

```sh
pnpm --dir apps/web exec vp test run --project unit src/components/chat/CoordinationWorkstreams.logic.test.ts
pnpm --dir apps/web run typecheck
pnpm --filter @croki/desktop exec vitest run src/backend/DesktopBackendManager.test.ts
pnpm --filter croki-server exec vitest run src/orchestration/Layers/ProjectionSnapshotQuery.test.ts src/orchestration/Layers/ProjectionPipeline.test.ts
pnpm --filter croki-server run typecheck
pnpm run check:croki
npm run release:smoke
```
