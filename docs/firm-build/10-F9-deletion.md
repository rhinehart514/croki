# F9 — The deletion pass

**Goal:** the tree is clean: everything in FIRM-SPEC.md §Dies is gone, the guards protect the new
physics, and `npm test` is green end to end. This is the last task; run it only when F1–F8 are in.

## Build

1. **Delete the Dies list** (FIRM-SPEC.md §Deletion ledger) — source files and their tests. Before
   each deletion, `grep` the tree for importers; a surviving importer means either the importer
   dies too or the task order was wrong — report, don't hack around it.
2. **Routes**: collapse `brain/src/routes/` to the firm's surface (system/health, ventures, wall,
   market, product-changes, presence, credentials, MCP door). Unmatched API routes keep failing
   as JSON.
3. **MCP door**: `mcp.mjs` re-targets to the firm's verbs (inspect venture, drive teammate, fork,
   stage, read wall — never decide). Actor stamping and forbidden-tool screening unchanged.
4. **Rewrite the anti-cage guards** for the new physics (FIRM-SPEC.md §New anti-cage guards): no
   bet schema, no status enum, no org chart, no numbers in the market's mouth, one dial, and the
   smallness budget (name the file count ceiling for `brain/src/` in the guard; count the tree).
5. **Register guard**: port `anti-cage-founder-register.test.mjs` — machinery vocabulary stays off
   founder surfaces.
6. **Full verification**: `npm --prefix brain test`, `npm --prefix ui run test:unit`, lint, and
   the production build (`npm test` at root). UI suites that tested deleted surfaces are deleted
   with their surfaces; UI suites for surviving surfaces must pass.

## Acceptance

- Zero imports of deleted modules anywhere. `npm test` green at root.
- `brain/src/` file count is within the guard's ceiling and the guard enforces it.
- A written receipt in the final report: what was deleted (file list), what was ported, test
  counts before/after. No claims beyond what the runs prove. Nothing committed.
