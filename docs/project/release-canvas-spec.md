# Release Canvas product specification

Status: superseded compatibility specification

> Superseded by the 0.4.2 Croki Senses / Perception Frame contract in
> [Croki on Croki](../croki.md). Release and Context data may be read as
> historical sources, but Canvas is no longer a release board, context editor,
> or persisted project-management surface.

## Product decision

Historically, Canvas opened on the next Croki release candidate and answered four questions
beside any Thread:

1. What are we considering?
2. What is being worked on now?
3. What has entered the candidate?
4. What proof or ownership is still missing before release?

This is a project-owned projection, not a second project-management system.
The Thread remains where work happens. Canvas makes release judgment legible.

## Why Markdown is insufficient

A release Markdown file is useful for narrative, but weak as the live product
surface. It does not reliably distinguish intent from state, tie work to its
source Thread, enforce proof before verification, prevent duplicate identity,
or show when a statement became stale. Checkboxes also collapse materially
different states such as proposed, actively working, accepted, blocked,
verified, and deferred.

Release Canvas keeps the narrative small and makes those transitions explicit.
Release notes remain the human-readable shipping record generated from a
candidate, not the authority for live readiness.

## Native Croki hierarchy

- **Release Canvas** is the default Canvas landing view and the spatial view of
  the next candidate.
- **Thread** owns conversation, agent work, approvals, plans, tool activity,
  changed files, and verification output.
- **Context** owns durable founder-approved project truth and provisional
  proposals in `.croki/context.json`.
- **Visual artifact** is an immutable, Thread-scoped Product or GTM
  presentation used only when spatial reasoning helps judgment.
- **Provider runtime** remains native and performs the work.

Changing Canvas views never changes provider behavior. Canvas does not own a
scheduler, agent loop, worktree, review system, or separate memory service.

## Primary experience

Opening Canvas from the right panel, command, or surface menu lands on the
active release. The header shows the version, baseline, goal, and unsaved state.
The field groups release items by explicit state:

- `proposed`: awaiting scope judgment;
- `working`: active work with one or more source Threads;
- `candidate`: accepted into the release but not fully proven;
- `blocked`: accepted work with a named unresolved dependency;
- `verified`: every acceptance criterion has passed;
- `deferred`: intentionally outside this candidate.

The current Thread is marked directly on linked work. `Current Thread` creates
or reveals that link without copying execution into Canvas.

Selecting an item opens an inspector for title, kind, state, outcome, source
Threads, acceptance criteria, and evidence references. References use the same
portable repository-file and HTTP(S) contracts as project context. Source
Thread links return to the native Thread.

The secondary `Context` view preserves founder canon and is where existing
file, diff, and preview evidence capture lands. Thread visual activities open
their immutable artifact and expose an explicit return to Release Canvas.

## Readiness rules

Release state is explicit and founder controlled:

- an item cannot become `verified` without at least one criterion;
- every criterion must be `passed` before verification;
- editing proof on a verified item returns it to `candidate`;
- a `released` candidate may contain only `verified` or `deferred` items;
- publishing is independent and remains blocked by Croki ownership gates.

The source candidate can therefore be locally verified while production
publishing remains visibly blocked.

## Data and provider boundary

The optional `release` object lives in `.croki/context.json` beside durable
project context. Shared parsing bounds release identity, items, criteria,
Threads, outcomes, and references. IDs are unique and transitions validate the
whole candidate.

Before each provider turn, the server reads a fresh snapshot. If the candidate
is active, a compact bounded projection of non-proposed, non-deferred items is
included with founder-approved canon. Large candidates are summarized rather
than suppressing all context. The content-free turn receipt exposes only the
active release version and item count.

Malformed release data is omitted during partial recovery without discarding
valid founder canon. Missing, invalid, or oversized Canvas data never prevents
the native provider turn.

## Editing and conflicts

Release edits reuse the existing Canvas draft, validation, undo, redo,
session-recovery, and compare-and-write path. Changes remain local until Save.
Concurrent source changes preserve the draft and require an explicit reload.
Repair of malformed project data is explicit.

## 0.4.2 completion contract

Croki 0.4.2 introduces Release Canvas when all of the following hold:

- Canvas opens on the project-owned next release candidate;
- current Thread work can be linked and reopened;
- proof is portable and verification is enforced by shared validation;
- the active release reaches every supported provider through bounded context;
- Context and visual-artifact modes remain available without becoming release
  state;
- focused shared, server, web, smoke, and Croki boundary checks pass;
- production publication remains disabled until every destination is
  Croki-owned.
