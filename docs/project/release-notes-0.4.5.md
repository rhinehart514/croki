# Croki 0.4.5 stabilization notes

Status: Released 2026-08-03

Croki 0.4.5 is a bug-fix release focused on making regular desktop startup,
Founder Mode, and Parallel Threads dependable in daily use.

## Fixed

### Canvas stays hidden when disabled

Turning Canvas off in **Settings → Beta** now removes its product surfaces
completely. The command palette no longer shows a disabled **Open Canvas**
action, and previously recorded Canvas presentations no longer appear in the
Thread timeline. The setting remains available so Canvas can be enabled again.

### Thread transitions and streamed responses are smoother

Thread timelines now reveal as one surface after their virtualized rows mount,
preventing cached and uncached conversations from flashing into place in
different stages. Newly appended assistant text is paced in bounded chunks so
large provider updates remain readable without falling behind the live turn.
Reduced-motion preferences bypass the pacing and transition behavior.

### Release media workflow is repository-owned

The repository now includes an optional Remotion-based release-artifacts
workspace, Croki project actions, selected product captures, provenance, review
records, and validation scripts. Generated renders and dependency caches remain
local. The workflow keeps external claims tied to inspected product evidence
without adding media-production state to Canvas or the application runtime. Its
validator continues to block final-media publication until founder review and
the documented external motion-authoring handoff are complete.

### Parallel workers are inspectable child chats

Codex parallel workers now persist as read-only child Threads nested beneath
the canonical parent Thread in the side rail. Opening a worker shows its
assignment and its own assistant transcript instead of mixing that output into
the parent conversation. A **Continue in parent** action returns to the only
Thread that accepts founder input.

Child lineage is stored in the projection database, so worker chats survive a
desktop restart and shell-snapshot reload. They remain part of the same project
and workspace and do not create another runtime, coordinator, or writable task
surface.

The parent Thread remains canonical. Worker chats cannot be renamed, replied
to, settled, snoozed, or managed independently from the side rail.

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
pnpm --filter croki-server exec vitest run src/orchestration/Layers/ProjectionSnapshotQuery.test.ts src/orchestration/Layers/ProjectionPipeline.test.ts src/orchestration/Layers/ProviderRuntimeIngestion.test.ts
pnpm --filter croki-server run typecheck
pnpm run check:croki
npm run release:smoke
```
