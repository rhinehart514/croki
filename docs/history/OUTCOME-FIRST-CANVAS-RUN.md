# Historical run — Drover outcome-first canvas

> **Archived 2026-07-14.** This run targeted the superseded open-canvas object system. It is a
> preservation receipt, not a task list. Current work starts from
> [FIRM-SPEC.md](../FIRM-SPEC.md) and [STATE.md](../STATE.md).

> **Historical resume contract (inactive):** read this file, check `git status`, and continue from
> the first incomplete task. Preserve the starting dirty tree; do not reset or discard pre-existing work.

## Starting state

- Branch: `experiment-machine-direction`
- Starting HEAD: `ec0ebb4`
- Starting `origin/main`: `ec0ebb4`
- Working tree before this run: 128 tracked paths changed, 4,377 insertions, 3,208 deletions, plus untracked experiment-machine files and tests.
- The pre-existing branch work includes the experiment-machine backend, founder presence/away hold, reply alerts, open-canvas shell changes, documentation consolidation, and broad tests. It is intentional working-tree context and must survive this run.
- Stop boundary: this run ends at a verified uncommitted diff. Commit, merge, push, pull request, publish, and deploy require a separate explicit request.

## Criteria

- [ ] One normalized canvas-selection descriptor drives shell, composer context, and valid object actions.
- [ ] Initial focus obeys explicit/restored focus and saved viewport before returned evidence.
- [ ] Grounded first frame has one central “What do you want to change?” prompt.
- [ ] Product altitude has no global pipeline Run action.
- [ ] Composer presentation changes by altitude without losing session/draft state.
- [ ] Selected step, lane, experiment, gate, and product change expose only their valid local action.
- [ ] Ordinary objects never expose Run.
- [ ] Durable object editing uses canonical revision authority and preserves conflicts honestly.
- [ ] Founder wall is visible with zero, one, and multiple pipelines without fabricating a gate.
- [ ] Gate review remains attached to the canvas wall and preserves authorization semantics.
- [ ] Returned replies/outcomes frame their actual causal loop without overriding founder-restored state.
- [ ] Desktop, compact, and narrow preserve the core loop without overlap or clipped primary controls.
- [ ] Focused tests, full UI tests, lint, build, and terrain browser journey pass.
- [ ] Rendered desktop/compact/narrow states pass a fresh design-critic gate.
- [ ] Focused tests, full verification, and browser evidence support a verified uncommitted diff.

## Tasks

- [x] Plan approved; autonomous and taste-gated execution authorized.
- [x] Capture branch, remote, and dirty-tree baseline.
- [x] Run baseline preflight.
- [x] Slice 1: selection and initial focus.
- [x] Slice 2: outcome-first shell and composer altitude.
- [x] Slice 3: selected-object actions and editing.
- [x] Slice 4: persistent founder wall and canvas-native gate review.
- [x] Slice 5: outcome-ranked return framing.
- [ ] Slice 6: responsive contract and integrated coverage.
- [ ] Render, critique, and iterate to SHIP.
- [ ] Full regression, final verification, and uncommitted handoff.

## Evidence log

These are pre-implementation baseline receipts, not proof of the current working tree. No current-tree success is claimed until the relevant verification is rerun after the changes settle.

- Baseline diff captured from `git diff --stat` and `git diff --name-status` before implementation.
- Baseline focused UI tests: 7 files, 85 tests passed.
- Baseline production UI build passed; existing chunk-size warning only.
- Baseline local launch: backend started at `127.0.0.1:4317` in local-only mode and UI started at `127.0.0.1:5173`; the existing Vite ResizeObserver loop warning was observed.

## Stop boundary

This run ends at a verified uncommitted diff.
