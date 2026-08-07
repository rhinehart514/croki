# ADE-native product adjustments

Status: product direction for evaluation  
Depends on: [current-state audit](./current-state-audit-2026-08-05.md)

## Subject

When a founder directs a native coding provider in a Croki Thread, Croki keeps
the environment, meaningful state, evidence, required judgment, and shipping
state legible, so the founder can resume, intervene, verify, and ship without
reconstructing the work; an implicit Croki agent harness does not appear.

## Non-negotiable boundary

Croki is the ADE around the selected agent. It does not become the agent.

| Selected provider owns                 | Croki owns                                                       |
| -------------------------------------- | ---------------------------------------------------------------- |
| Reasoning and planning                 | Durable Thread and worker representation                         |
| Implementation and tool strategy       | Tool availability, authority, and receipts                       |
| Native delegation behavior             | Durable worker Thread presentation                               |
| Provider memory and session behavior   | Repository, worktree, terminal, and runtime state                |
| Conclusions and response wording       | Captured environment and Git evidence                            |
| Whether it believes a turn is complete | Whether the environment is active, quiescent, blocked, or failed |
| Use of granted tools                   | Scope and consequence of granted authority                       |

Croki may project observed facts. It must not create an unstated completion
rubric, choose a provider strategy, add a planning loop, route work to agents,
rewrite the provider answer, or claim correctness from incomplete evidence.

## Adjustment 1: factual turn result

After a provider turn becomes quiescent, show at most one durable Croki result
directly beneath the provider answer.

It may contain only Croki-owned or source-labelled facts:

- changed files from the relevant checkpoint or Git state;
- observed checks and their exit state;
- captured screens and explicit missing visual evidence;
- pending approval, question, or failed environment action;
- commit, push, and pull-request state; and
- the provider's own reported conclusion, clearly attributed when shown.

The compact state should answer **what happened** and **what remains
unverified**, not **whether Croki thinks the work is correct**. Selecting an item
opens the existing Diff, Preview, terminal receipt, or Git detail in context.

This replaces duplicate checkpoint, raw snapshot, and transient completion
signals. It does not create a dashboard, task, score, or acceptance workflow.

## Adjustment 2: evidence beside the native answer

Preserve the provider answer exactly. Attach environment evidence where Croki
can substantiate a claim:

- an observed passing command links to its receipt;
- a captured screen links to the preserved image and page evidence;
- a changed-file count links to the exact checkpoint or Diff;
- a commit, push, or pull request links to its durable Git receipt; and
- missing evidence remains visibly missing.

Correlation must be conservative. Croki should not infer that a captured screen
proves the whole UI, that one command proves all tests, or that a clean worktree
proves the requested outcome.

## Adjustment 3: factual resume snapshot

When a founder reopens a Thread after meaningful time or state change, show a
compact snapshot derived from durable state:

- last provider activity and whether work is active, stopped, or failed;
- current branch, worktree, and pull request;
- latest changed files and checkpoint;
- pending founder input or authority;
- latest captured UI evidence; and
- environment or provider availability changes.

This is not a generated narrative and does not compete with the transcript.
Once acknowledged or no longer relevant, it collapses into the Thread history.

## Adjustment 4: contextual workspace surfaces

Preview, Diff, Files, Terminal, Review, and Canvas remain independent ADE
surfaces. The right panel should present the surface relevant to the selected
object instead of asking the founder to choose from a generic empty menu.

- A captured screen opens Preview history.
- A changed-file receipt opens Diff.
- A file reference opens Files.
- A command failure opens its terminal receipt.
- A sensed conclusion opens Canvas only when Canvas contains that source.

This is navigation, not provider routing. Opening or closing a surface never
changes provider behavior, context authority, or harness selection.

## Adjustment 5: complete surface return paths

Every founder action on environment evidence should return cleanly to the
canonical Thread:

- a Diff comment carries file, lines, and stable comment ID;
- a Preview annotation carries screen, viewport, and selected region;
- a terminal intervention carries the exact command receipt;
- a file selection carries its path and relevant range; and
- a Git failure carries the failed action and recoverable state.

Croki inserts only the founder-selected reference or attachment. The selected
provider decides what to do with it.

## Adjustment 6: provider readiness beside the composer

Before send, expose the selected provider instance's real environment state:

- installed or unavailable;
- authenticated, unauthenticated, or unknown;
- ready, warning, or error;
- required supporting process, such as an OpenClaw Gateway; and
- whether the current environment can perform the requested connection.

Blocked states provide **Open settings**, **Show setup**, **Reconnect**, or
**Retry** as appropriate while preserving the draft. A warning may allow an
explicit attempt when the provider contract permits it.

Croki must not compensate for an unavailable provider by silently switching
providers or inserting a behavioral harness.

## Adjustment 7: honest provider capability semantics

Extend provider capability metadata to cover the operations founders can
actually encounter:

- native, projected, or unsupported rollback;
- native fork support;
- in-session model switching;
- voice;
- background text generation;
- MCP-backed application observation; and
- auth-confidence state.

Controls appear only where their consequence is truthful. For example, a local
transcript trim must not be labelled as provider-native rollback.

This preserves provider differences instead of manufacturing parity.

## Adjustment 8: persistent Git evidence

Consequential Git actions become durable Thread activity:

- commit created;
- push completed or failed;
- pull request opened or updated;
- branch moved;
- conflict detected; and
- external state became stale.

Toasts may provide immediate feedback, but the Thread receipt is the durable
record and recovery point. Croki does not decide when to commit, push, open a
pull request, or merge unless the founder or native provider explicitly invokes
that action under the existing authority boundary.

## Adjustment 9: project-scoped authority

Remote sessions and provider tools should receive authority scoped to the
smallest useful environment boundary:

- environment;
- project;
- worktree;
- Thread or provider session;
- tool family; and
- lifetime.

Terminal CWD must resolve beneath an authorized project or worktree root, and
caller-provided runtime environment variables must pass the same policy as the
base environment. Publication and permission-changing actions retain explicit
consequence-aware confirmation.

This changes what the ADE permits, not how the agent reasons.

## Adjustment 10: environment truth surface

Provide one compact environment-status view for facts Croki owns:

- provider connection and capability;
- repository and worktree;
- running processes and Preview availability;
- checkpoint and persistence health;
- Git remote and pull-request state;
- remote connection and authority scope; and
- enabled release destinations.

This is diagnostics, not a project dashboard. It contains no tasks, agent
scores, generated plans, orchestration controls, or Croki-authored strategy.
Most users should reach it through a blocked or degraded state rather than
maintain it as a primary workspace.

## Recommended sequence

### First: make existing state legible

1. Factual turn result.
2. Persistent Git evidence.
3. Complete return paths from Diff, Preview, Files, and terminal.
4. Provider readiness and recovery beside the composer.

These changes reuse existing Thread activity and surfaces and should require no
new durable product noun.

### Second: make differences and authority truthful

5. Typed provider capability semantics.
6. Project-scoped terminal and remote authority.
7. Telemetry and credential lifecycle hardening.

### Third: make long-running work easier to resume

8. Factual resume snapshot.
9. Contextual right-panel presentation.
10. Environment truth diagnostics.

## What must disappear

- Generic surface selection when the relevant evidence already determines the
  destination.
- Provider failures that end at a disabled composer with no recovery action.
- Consequential Git outcomes that exist only as transient toasts.
- Generic rollback or readiness controls that imply false provider parity.
- Active Concept, Release, Venture, progress, or GTM context presented as
  compatibility-only documentation.
- Public platform availability that is not backed by an enabled Croki-owned
  release destination.
- Server-wide terminal and project authority where project-scoped authority is
  sufficient.

## Evidence required before acceptance

- The provider receives the same stored founder message and native behavior
  with each new ADE projection open or closed.
- One completed turn produces no more than one factual result receipt.
- Every displayed fact traces to a checkpoint, command, Preview, approval,
  provider, environment, or Git source.
- Missing evidence is distinguishable from failure and success.
- Refresh, reconnect, restart, fork, revert, and Thread deletion preserve or
  clean up receipts according to existing ownership rules.
- Each provider capability control matches the selected provider's real
  semantics.
- Remote terminal and tool actions cannot escape the authorized project or
  worktree.
- Keyboard, screen-reader, narrow-width, loading, failure, and recovery states
  are verified in the running product.
