# Croki 0.4.10: Delegate the outcome

Croki 0.4.10 builds on 0.4.9's trustworthy intervention and recovery paths. A
founder can give Codex one durable outcome or ask an independent Codex reviewer
to challenge the current change set without replacing the canonical Thread or
creating a Croki-owned agent runtime.

Both features remain explicitly Codex-only because they use native Codex
protocol operations. Other providers keep their native behavior until they
expose equivalent, provable semantics.

## Run one Thread to a durable outcome

- An established Codex Thread exposes compact **Finish mode** in its header.
- The founder supplies one explicit objective and may optionally set a token
  budget.
- Codex continues the native goal across ordinary turn boundaries and context
  compaction until it completes, pauses, blocks, or reaches a usage or token
  limit.
- The same control shows the objective, native status, elapsed time, and token
  use, with actions to pause, resume, or clear it.
- Croki never invents a percent-complete score and does not create a project
  task, checklist, dashboard, or hidden planning loop.

The provider owns goal execution and persistence. Croki owns the explicit entry
point, typed transport, authorization, and truthful presentation.

Implementation: [PR #10](https://github.com/rhinehart514/croki/pull/10).

## Review without derailing the builder

- The existing Review panel exposes **Run Codex review** for an established
  Codex Thread and a concrete supported change target.
- Croki calls Codex's native detached review operation rather than composing a
  review prompt inside the builder's conversation.
- The returned reviewer becomes a durable read-only child Thread beneath the
  canonical parent.
- The parent remains usable while review runs.
- Findings stay source-linked in the reviewer's native transcript and can be
  carried back into ordinary parent work.
- Croki does not add **Fix** or **Dismiss** controls until the provider exposes
  durable finding identities and decision semantics.

Implementation: [PR #14](https://github.com/rhinehart514/croki/pull/14).

## Explicitly out of scope

0.4.10 does not make Finish mode implicit, translate it into a provider-neutral
loop, add a goals dashboard, schedule recurring work, let review mutate files,
or manufacture structured finding state from prose. It does not turn worker
Threads into competing canonical conversations.

## Release proof

- a founder can set one Codex objective, optionally bound token use, leave the
  Thread, reopen it, and see the provider's current durable state;
- pause, resume, clear, blocked, usage-limited, budget-limited, and complete
  states remain distinct and accurate;
- an established Codex Thread can start an independent detached review against
  a concrete change target;
- the reviewer persists as a read-only child while the parent remains usable;
  and
- unsupported providers and unestablished sessions do not show controls that
  Croki cannot fulfill.

Focused tests must prove native goal routing, typed authorization, detached
review lifecycle races, child persistence, read-only enforcement, and parent
continuity. Existing worker lineage, Review, provider, Thread, and mobile
boundaries must remain green.
