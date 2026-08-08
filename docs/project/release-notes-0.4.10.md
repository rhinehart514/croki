# Croki 0.4.10: Native means native

Croki 0.4.10 integrates the current T3 Code foundation while removing Croki's
active model-behavior harness. Croki supplies the durable development
environment; the selected coding provider remains the agent.

A default turn now contains only the message and attachments the founder can
see. Anything else that can affect the model—files, skills, interaction mode,
permissions, or Croki-added tool access—must be applied through an explicit
user action.

## No active Croki harness

- The **Behavior: Native / Product** composer control is removed.
- Product, GTM, and Venture behavior prompts are no longer available for new
  turns.
- Default turns do not receive application direction, application progress,
  sibling Thread activity, project activity, or Croki parallel-worker policy.
- Default Codex turns omit Croki-authored `developer_instructions`. An
  explicitly selected provider-native Plan mode may still apply that
  provider's planning contract.
- The provider receives the founder's normalized visible message and explicit
  attachments directly.

Historical behavior receipts and Canvas artifacts remain readable. Legacy
clients that submit removed harness or parallel-policy fields receive a clear
version-skew error; Croki never silently reactivates the old behavior.

## Application direction is user-applied

`.croki/application.croki` remains the repository-owned application brief, but
it is founder-facing until the founder chooses to send it.

The Thread header exposes one compact application focus. Opening it shows the
declared direction and two actions:

- **Add to message** inserts a visible `.croki/application.croki` file chip in
  the composer.
- **Open .croki** opens the ordinary source file without changing model input.

The file chip has a focusable remove control and retains keyboard Backspace and
Delete behavior. The focus reads from the active Thread workspace—including a
Thread-owned worktree—so the inspected file, opened file, and attached file are
the same source.

## Explicit model controls

Croki continues to make provider capabilities easy to apply without wrapping
them in a Croki-owned strategy layer:

- `@file` adds repository context visibly;
- `$skill` invokes a provider-native skill;
- model and reasoning controls remain explicit;
- Default and provider-native Plan remain explicit interaction choices;
- permission mode remains a separate explicit authority choice;
- Canvas remains a founder-facing projection and does not grant model tools;
  Croki will expose any future Canvas capability only through a visible,
  removable, turn-scoped choice; and
- provider-native delegation remains observable without becoming a Croki
  scheduler.

New Canvas artifacts record `user-applied` source semantics. Historical
Product and GTM attribution remains decode-only compatibility data.

## Current T3 Code foundation

0.4.10 merges T3 Code upstream commit
`a20923ce463335e89e92f5983d98a180536e8e7d` and preserves Croki's product,
identity, release, and application boundaries.

### Sidebar and long Threads

- Sidebar v2 is the default.
- Pinned Threads support reordering and unpinning.
- Croki attention states and nested worker Threads remain intact.
- Thread history supports pagination instead of hydrating an entire long
  conversation.
- Lightweight shell snapshots avoid loading every message and activity body.

### Native agent observability

- Codex collaboration children and Claude subagents/workflows normalize into
  durable agent activity.
- The Agents panel exposes provider-native work without creating a competing
  canonical conversation.
- Background-agent liveness and reaping are integrated.
- Task and tool progress use stable, bounded activity rows so heartbeats cannot
  evict meaningful lifecycle evidence.
- Croki observes provider-owned delegation; it does not plan, schedule, or
  recover that delegation itself.

### Plans, usage, providers, and browser history

- Current inline-plan presentation and plan progress are integrated.
- The Usage area reads provider transcript usage across environments.
- Provider settings can differ by environment.
- Browser recent history is integrated.
- Theme infrastructure is updated while visible labels remain Croki-branded.
- Exact legacy `t3-*` theme identifiers remain supported only to preserve
  stored user settings.

### Mobile

- Unified model and Thread settings
- Long-Thread pagination
- Pinned-Thread ordering
- Connection and header improvements
- Native paste and typography improvements
- Worker navigation, application grouping, and update recovery

Mobile follows the same no-harness boundary: no behavior selector, automatic
application attachment, or Croki delegation prompt is present in turn
plumbing.

### Desktop and platform

- Current desktop startup, state, URL handling, and Linux behavior are
  integrated under Croki identities.
- Ghostty terminal headers now live in the repository-level native package.
- Croki release, relay, signing, EAS, and publication ownership guards remain
  intact.
- Croki and `croki-dev` protocols are preserved.
- Inherited T3 publication destinations continue to fail closed.

## Reliability repairs

### Provider reactor startup

The orchestration reactor previously subscribed lazily to a hot event stream.
A provider event could arrive after startup returned but before the consumer
actually subscribed. Startup now acquires the live subscription before forking
the consumer, closing the event-loss window.

This restores deterministic provider-history forks, temporary session release,
and recoverable provider-fork failures.

### Runtime activity merge repair

Duplicate `task.updated` and `tool.progress` switch branches introduced during
upstream integration were removed. The retained implementations preserve
stable task-scoped identifiers, bounded progress, summaries, and task linkage.

### Database convergence

Migration 42 reconciles overlapping Croki and T3 migration identifiers so both
schema histories converge without discarding either side's data model.

### Source integrity

Raw control bytes introduced during conflict resolution were replaced with
explicit source escapes. Server and web sources remain ordinary text files.

## What disappeared

0.4.10 removes these active product surfaces and behaviors:

- Product and Native behavior selection
- Product, GTM, and Venture prompt overlays
- automatic application and progress injection
- automatic sibling-work and project-activity injection
- Croki parallel-worker instructions
- default Croki Codex developer instructions
- automatic plan-sidebar opening
- Preview ideation behavior
- hidden Canvas harness attribution

Opening or arranging Croki surfaces—Application, Canvas, Preview, files,
terminal, Review, or Git—does not by itself change provider behavior or model
input.

## Compatibility

- Historical behavior and Canvas receipts remain readable.
- Legacy command fields remain decodable only for upgrade diagnostics.
- Existing stored theme identifiers continue to resolve.
- Historical Application, Concept, Release, and Venture data remains readable.
- New turns and new Canvas artifacts use only the explicit 0.4.10 contract.

## Release proof

The integrated release passed:

- full workspace typechecking;
- 2,219 web tests;
- 642 mobile tests;
- 371 shared-package tests;
- 244 script and policy tests;
- all 55 ProviderCommandReactor tests;
- Croki overlay enforcement against the exact T3 base;
- release smoke and frozen-lockfile verification;
- rendered application-focus, add-to-message, and removal checks; and
- an independent product review followed by repair of worktree consistency and
  accessible removal.

The release boundary is enforced in code: Croki is the environment around
native providers, not an implicit agent harness.
