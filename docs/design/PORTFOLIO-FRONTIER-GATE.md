---
status: proof-gated
authored: 2026-07-14
owner: Jacob
authority:
  product: ../FIRM-SPEC.md#f8--the-portfolio-proof
  implementation: ../STATE.md
  plan: PRODUCTION-UX-PLAN.md#batch-9--portfolio-frontier
---

# Portfolio frontier gate

The portfolio wall and venture-transfer contract are mechanically implemented, but they are not a
frontier claim and do not become Drover's default entry surface from deterministic tests.

Eligibility requires a dated Batch 8 outside-founder proof record in `docs/STATE.md`. After that record
exists, launch the desktop host with `GTM_IDE_PORTFOLIO_PROOF_DATE=YYYY-MM-DD`, using the exact evidence
date. The backend then exposes grouped portfolio wall records and export/import through the same
host-issued founder capability used for consequential venture acts. With no date, an invalid date, or
a future date, the UI names the proof gate and returns no cross-venture wall data.

F8 remains unproved until `docs/STATE.md` separately records two real ventures returning through one
wall and a real cross-machine import that resumes durable work after destination-repository rebind,
cold provider resume, and explicit product-change worktree re-fork.

## Durable contract

- Export file: `<venture>.drover.json`, format `drover-venture-transfer`, version `1`.
- Excluded: source repository/worktree paths, provider session IDs, credentials, and reusable template
  lessons. Venture-owned teammate lessons retain their venture provenance.
- Import requires a valid, unbound destination repository and refuses an existing venture identity.
- Import writes a `settings/transfer.json` receipt. Provider resume is `cold`; transferred
  product-change workspaces and staged artifacts are `needs-refork` and cannot imply a live worktree.
- Portfolio wall groups pending items only by venture identity. Each item retains its owning
  `ventureId`, `betId`, and `outcomeId` context. There are no comparative metrics, sentiment, health,
  agent grids, or global workflow records.

## Verification

```sh
npm --prefix brain test
npm --prefix ui run test:unit -- src/components/firm/VenturePicker.test.tsx src/components/firm/PortfolioTransfer.test.tsx
```

Passing these commands proves the contract and gate behavior only. It does not prove Batch 8 or F8.
