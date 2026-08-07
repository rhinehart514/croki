# Croki 0.4.9: Control without interruption

Croki 0.4.9 lets a founder leave real work running, redirect it without
restarting, and return at the exact moment their judgment is required. It
extends 0.4.8's retrieval and continuity work without adding an inbox,
workflow engine, or parallel task system.

The release is assembled from independently reviewable changes. Each must be
rebased after the preceding change lands because they share Thread and provider
surfaces.

## Guide work while it runs

- A running Codex Thread keeps an editable composer beside **Stop**.
- **Guide** sends the instruction through Codex's native steering operation
  without cancelling or restarting the active turn.
- Unsent guidance remains a normal durable draft.
- Accepted guidance receives a visible delivered receipt. If Croki crashes
  before acknowledgement, it reports delivery as unconfirmed and does not
  replay the instruction, avoiding duplicate steering.
- Providers without a proven native steering operation remain unsupported
  rather than receiving an imitation built from extra turns.

Submitted guidance is immediate and therefore no longer editable or removable.
Croki does not create a guidance queue that claims stronger delivery guarantees
than the provider exposes.

Implementation: [PR #12](https://github.com/rhinehart514/croki/pull/12).

## Return only when judgment is needed

- Sidebar Thread rows distinguish approval, structured input, and fresh failure
  states from ordinary working and completed activity.
- A project with unresolved founder work shows one compact **_n_ need you**
  count in existing navigation.
- Opening that Thread lands on and focuses the exact unresolved approval,
  question, or failure, then consumes the navigation intent so later updates do
  not steal focus.
- Completed work, visited failures, archived Threads, and worker children do not
  create attention noise.
- Croki does not infer usage limits, token budgets, or other typed states from
  free-form error text.

This is routing into the existing Thread, not a notification center or second
work queue.

Implementation: [PR #11](https://github.com/rhinehart514/croki/pull/11).

## Recover with an honest receipt

- After a recoverable Electron renderer crash or out-of-memory restart, Croki
  reopens the last verified same-origin screen after the local server welcomes
  the new renderer.
- Server-owned agent and terminal work reattaches when that server process
  survived.
- Durable composer drafts remain available.
- One compact recovery receipt distinguishes what was restored from
  browser-only state that reset.
- Croki never claims that a full process crash preserved PTYs, arbitrary tool
  processes, or work that was not durably acknowledged.

Implementation: [PR #9](https://github.com/rhinehart514/croki/pull/9).

## Correct an earlier instruction safely

- An earlier user prompt exposes **Edit from here** when the connected server
  and selected Codex runtime both prove exact-boundary branching support.
- Croki creates a successor Thread immediately before the selected message and
  restores its text, review comments, and recoverable images into the new
  composer.
- The original Thread remains unchanged.
- The current filesystem also remains unchanged. The action says **Files stay
  as they are**; restoring files remains the separate Git-backed operation.
- A capability gate prevents an older server from silently turning the action
  into a full-history fork.
- Single-flight and stale-navigation guards prevent duplicate successors or a
  late result pulling the founder away from another Thread.
- Unsupported providers and rollback failures remain explicit.

Implementation: [PR #13](https://github.com/rhinehart514/croki/pull/13).

## Explicitly out of scope

0.4.9 does not add Finish mode, autonomous outcome loops, detached review,
provider-neutral steering, a notification inbox, a task board, filesystem undo
inside conversation branching, or replay of unacknowledged instructions.

## Release proof

- a founder can guide a running Codex turn and see whether delivery was
  confirmed;
- unresolved approval, input, and fresh failure states raise their hand without
  completed-work noise;
- opening an attention target focuses the exact unresolved item once;
- a recoverable renderer failure returns to the verified screen with a truthful
  receipt;
- an earlier Codex prompt can create one exact-boundary successor with its
  supported input restored; and
- the original conversation and current filesystem remain visibly separate
  from that branch operation.

Focused tests must prove capability/version-skew gates, duplicate prevention,
recovery claims, unsupported-provider behavior, and provider-native delivery.
Existing Thread, approval, draft, worktree, Git restore, and provider boundaries
must remain green.
