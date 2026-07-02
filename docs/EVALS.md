> **SUPERSEDED — 2026-07-01.** These evals were written against the earlier "IDE for GTM"
> (repository-evidence → reviewed change) framing. The product was redefined as a GTM engine;
> the current direction is **docs/GTM-ENGINE-REBUILD.md** and the honest state is **docs/STATE.md**.
> The `npm test` release gate below still holds; the completion criterion above does not. Kept
> for history — new evals should target the engine (scan → market research → path → gated run →
> measured result → promotion).

---

# Product evals

GTM IDE is complete only when the user can move from repository evidence to a
reviewed, reversible change and preserve the full history locally.

## Eval 1 — grounded comprehension: passed

Target: `~/Buffalo-Projects`

Outcome: `project_created`

The scanner:

1. Confirms attribution capture in the join flow.
2. Confirms the win event in production code.
3. Lists its emitted properties.
4. Proves the missing attribution join.
5. Marks unproven claims blind.
6. Rejects comments, prose, tests, docs, and scanner definitions as evidence.

## Eval 2 — durable workspace: passed

Opening a repository and outcome creates or reloads one durable workspace.
Inspections, verification runs, revisions, and founder decisions survive reload.

## Eval 3 — reviewable change set: passed

Change generation:

1. Creates an isolated `codex/gtm-fix-*` branch and worktree.
2. Gives Codex the proven gap, citations, desired outcome, and safety boundary.
3. Preserves the summary, status, diff, worktree, branch, and evidence.
4. Supports approve or reject without changing the source repository.

## Eval 4 — apply and recovery: passed

Direct apply is enabled only when:

- the revision is approved;
- the source repository is still at the proposal base commit;
- the source worktree is clean;
- the patch passes `git apply --check`;
- the user explicitly confirms.

An applied patch can be reversed only after a reverse-patch check.

## Eval 5 — executable GTM graph: passed

The graph runner:

- Returns every node result even when the overall run fails.
- Blocks all downstream data descendants after failure.
- Stops at founder review gates.
- Continues after explicit gate approval.
- Runs one selected node with only its dependencies.
- Preserves graph edits and the latest 50 runs.
- Stages approved actions locally rather than sending them.

## Eval 6 — rendered workflow: passed

Browser verification covers:

- The default Buffalo workspace and cited diagnosis.
- Visible inspect, diagnose, propose, review, apply, and verify sequence.
- Reloaded workspace state.
- Partial graph failure with exact node-level recovery.
- Saved flow history after reload.
- Desktop and 390-pixel layouts.
- No browser console warnings or errors.

## Release gate

```sh
npm test
```

Expected result: all brain tests, frontend lint, TypeScript, and production build
pass.
