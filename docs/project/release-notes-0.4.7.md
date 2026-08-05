# Croki 0.4.7 release candidate

Croki 0.4.7 makes the core Thread loop more natural to direct and safer to keep
running throughout a real build. This is a source candidate, not a published
release. Croki 0.4.5 remains the released application baseline until the 0.4.7
artifacts are reviewed and published.

## Speak directly to Codex

Codex Threads gain native realtime voice beside the composer. Croki establishes
an audio-only WebRTC session with Codex, presents explicit connecting,
listening, stopping, and failure states, and keeps ordinary typing available as
the recovery path. The desktop app grants microphone access only to the trusted
top-level Croki origin and never grants camera access through this path.

## Keep delegated work attached to its parent

Durable worker Threads stay immediately beneath their canonical parent in the
left rail, including active, snoozed, and settled states. Worker transcripts are
read-only and offer one direct action back to the parent conversation. Child
rows omit ordinary rename and lifecycle controls that would imply they are
independent founder conversations.

## Repair weak generated titles

Initial generated titles now persist reliably. The Thread menu can regenerate a
generated title from the current conversation and attachments while preserving
the first user direction and recent context. Manual renames are never silently
replaced.

## Stay usable during long-running work

- Thread catch-up replay is bounded and initial hydration no longer requires a
  full database snapshot.
- Renderer memory growth is contained, sidebar prewarming is limited, and the
  desktop shell can recover from a renderer out-of-memory crash.
- Threads with open pull requests do not settle automatically.
- Dedicated worktrees follow branch drift so pull requests remain tied to the
  Thread that created them, including legacy Croki and T3 temporary branches.
- Growing server and configuration unions decode forward-compatibly.

## Safer terminal and preview behavior

- Replayable terminal queries are removed from stored terminal history.
- Holding `Ctrl/Cmd+W` closes only the intended terminal or app surface.
- Preview URL entry, focus, refresh, zoom, shortcuts, and keyboard annotation
  submission behave consistently in the in-app browser.
- An annotation image can be sent directly while Croki's existing **Add
  evidence** path remains available.
- OpenCode and Kimi sessions can use preview tools.

## Desktop development and startup

Electron registers privileged schemes before app readiness, enables Codex's
realtime conversation capability, and includes the macOS microphone usage
description. Development uses one explicitly owned supervisor per checkout,
recovers stale locks, and cleans up only the processes it started.

## Verification boundary

The candidate is covered by affected web, desktop, server, contracts, and
client-runtime tests; package typechecks; formatting and lint checks; the Croki
ownership boundary; release smoke checks; and the desktop production build.
Publication and tag movement remain separate, explicit release actions.
