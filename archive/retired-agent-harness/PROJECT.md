# Desired consequence

Croki becomes Jacob's dependable daily environment for taking real products from founder intent through native coding-agent work to verified, shippable change without losing state, evidence, or control.

# Current reality

- Croki 0.4.8 is released at `v0.4.8` with macOS, Windows, and Linux GitHub artifacts. GitHub is the enabled Croki-owned release path; hosted web, CLI, signing, relay, Discord, and mobile production remain separately gated.
- `origin/croki/main` is the current product branch at `294b63768`. The `croki/` worktree is an older, dirty 0.4.8 simplification workspace and must not be reset or treated as current release source.
- The durable product substrate is strong: native provider sessions, Threads and worker Threads, worktrees, files, terminal, Preview, Review, Git, approvals, checkpoints, recovery, and checked-screen evidence.
- Open 0.4.9 candidates implement renderer recovery (#9), actionable attention (#11), native Codex steering (#12), and exact-boundary Edit from here (#13). Finish mode (#10) and detached review (#14) are deliberately 0.4.10 candidates. Release plans are in #15.
- Repository CI was green on the reviewed heads before the latest #13 correction. Every open PR also receives a failing Vercel status from the inherited `drover` project; that status is not evidence about Croki's enabled GitHub release path, but it currently leaves GitHub merge state `UNSTABLE`.
- PR #13's review found that failed rollback could leave an unsafe untrimmed resume cursor. Commit `310e1af11` removes the target provider binding on that failure path and is awaiting CI/re-review.

# Active direction

Preserve each selected provider's native behavior while making Croki-owned environment truth legible and actionable. For 0.4.9, ship control without interruption: honest renderer recovery, routing to founder judgment, native steering, and safe conversation correction. Keep Finish mode and detached review in 0.4.10 so the continuity release does not become an autonomous workflow system.

This direction excludes an implicit Croki agent harness, provider-neutral imitation of unsupported operations, task boards, notification inboxes, completion scores, and revived Concept/Release/Venture workflow objects.

# Current frontier

Turn the independent, overlapping 0.4.9 branches into one reviewed release without weakening Thread/provider invariants. First make PR #13 green on its latest safety fix. Then integrate #9, #11, #12, and #13 sequentially with rebases and combined verification. Resolve or explicitly remove the unrelated inherited Vercel status before calling the release branch green.

# Unresolved contradictions

- The local `croki/` worktree presents active 0.4.8 edits, while the remote product branch already contains the released 0.4.8 history and newer work. Preserve the local tree until its remaining unique changes are proven redundant or migrated.
- Croki's release contract says only Croki-owned enabled destinations define publication truth, but GitHub currently applies a failing inherited Vercel deployment status to every PR.
- Several feature PRs report exercised UI behavior but could not preserve Preview screenshots. Automated and semantic tests are evidence of behavior, not complete visual acceptance.

# Accountable judgment and authority

Jacob Rhinehart is accountable for product ambition, release composition, external publication, and merge disposition. Codex may inspect, implement, test, commit, push to existing feature branches, and address verified PR findings. It must not merge open PRs, publish another release, enable production destinations, or discard the dirty `croki/` worktree without Jacob's explicit disposition.

# Proof

- Each accepted PR is reviewed against its latest commit and passes repository CI, focused invariant tests, typechecking, formatting, and `npm run check:croki`.
- A combined 0.4.9 candidate proves recovery, attention routing, native steering, and exact-boundary branching together, including version skew, duplicate prevention, unsupported providers, and failure recovery.
- Rendered checks cover the changed founder journeys at desktop and narrow widths; missing capture remains explicitly unverified.
- The release plan reports only Croki-owned destinations, the tagged release matches that plan, and downloadable artifacts are present.

# Current commitments

- Do not merge without an explicit disposition.
- Do not publish to inherited T3 or `drover` destinations.
- Rebase each overlapping 0.4.9 branch after the preceding change lands.
- Keep 0.4.10's Finish mode and detached review out of 0.4.9.
- Preserve the dirty `croki/` worktree and its uncommitted files until reconciled intentionally.
