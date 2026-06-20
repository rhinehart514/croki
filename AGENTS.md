# AGENTS.md

## Product purpose

GTM IDE is a local, code-grounded go-to-market workbench. A user supplies a
repository and a win event; the product proves where attribution enters, confirms
the win event, renders the measurable funnel, and isolates tracking gaps with
`file:line` evidence.

## Canonical commands

- Run: `npm start`
- Full verification: `npm test`
- Direct scan: `node brain/src/mirror.mjs <repo> --win <event>`

## Architecture

- `brain/src/scan.mjs` owns grounded repository analysis.
- `brain/src/server.mjs` serves the local API and built React client.
- `brain/src/build.mjs` creates an isolated git worktree and invokes Codex for a
  narrow repair.
- `brain/src/workspace.mjs` owns durable repository workspaces, proof runs,
  revisions, and founder decisions.
- `brain/src/revision.mjs` owns review, clean-repository apply, and checked
  revert behavior.
- `brain/src/graph.mjs` owns dependency-scoped GTM flow execution and approval
  gates.
- `brain/src/flow-store.mjs` owns durable general-flow edits and run history.
- `ui/` is the canonical product interface.
- `Sources/GTMIDE/` is an earlier SwiftUI prototype, not the current release
  path. Reconsider this only when full Xcode is available and native packaging is
  an explicit goal.

## Product invariants

- Product claims are proven by production-code citations or marked inferred or
  blind. Comments, tests, docs, UI copy, and scanner pattern definitions are not
  product evidence.
- Scanning is read-only.
- The build action may create a local branch and worktree, but it stops before
  commit, push, deployment, or pull-request creation.
- Direct patch application requires explicit confirmation, an approved
  revision, the original base commit, a clean source worktree, and a successful
  patch check.
- General GTM flow execution must stop at founder gates. The default execution
  connector stages actions locally and never sends or publishes.
- Preserve unrelated user changes; this worktree may already be dirty.

## Verification

- Scanner changes require regression coverage in `brain/test/scan.test.mjs`.
- UI changes require `npm test` and browser verification of workspace,
  change-review, and graph partial-failure flows.
- The Buffalo Projects acceptance case is `~/Buffalo-Projects` with
  `project_created`; the expected result is a proven attribution gap.

## Definition of done

The requested behavior is implemented, the diff is scoped, `npm test` passes,
the visible flow is checked when relevant, and any publishing or external-state
action remains explicitly approved.

Last verified: 2026-06-19. Revisit if the canonical interface or safety boundary
changes.
