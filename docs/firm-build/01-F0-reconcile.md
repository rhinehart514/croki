# F0 — Reconcile the contract

**Goal:** the repository has one unambiguous answer to what Drover is: [FIRM-SPEC.md](../FIRM-SPEC.md).

## Build

1. Add a banner at the top of `docs/OPEN-CANVAS-SPEC.md` and `docs/EXPERIMENT-MACHINE-SPEC.md`
   (below the title, above Status): a short note that the build direction is now
   `docs/FIRM-SPEC.md`; these documents remain binding only for the harness (truth, wall, taste)
   and as implementation history. Match the banner voice used by historical docs (see
   `docs/history/DDD.md` for the pattern).
2. Prepend a dated section to `docs/STATE.md` (below the title): the firm reset is underway,
   FIRM-SPEC.md is the spec of record, existing "Built and tested" receipts describe the
   pre-reset tree, and no new claims are made until the reset's own verification runs.
3. Do **not** edit `AGENTS.md` or any CLAUDE.md — context files are founder-maintained. List any
   context-file updates you believe are needed in your final report instead.

## Acceptance

- Both superseded specs carry the banner; STATE.md carries the dated reset note.
- No other files changed. Nothing committed.
