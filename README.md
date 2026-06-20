# GTM IDE

GTM IDE is a local, code-grounded workspace for debugging and operating
go-to-market flows. Open a repository, name the event that represents a real
win, and the product connects production-code evidence to a safe change loop:

```text
inspect → diagnose → propose → review → apply → verify
```

The source repository stays under founder control. Scans are read-only.
Proposed changes are created in isolated git branches and worktrees. Nothing is
committed, pushed, deployed, published, or sent automatically.

## The repository workspace

The primary workspace:

- Scans JavaScript and TypeScript production code without uploading it.
- Detects concrete analytics calls and attribution capture.
- Confirms the requested win event and its emitted properties.
- Separates proven, inferred, gap, and blind claims.
- Preserves every inspection and verification report locally.
- Creates a grounded change set with the installed Codex CLI.
- Keeps the exact diff, evidence, worktree, branch, summary, and uncertainty
  together.
- Records founder approval or rejection.
- Can apply an approved patch to a clean, unchanged source repository after an
  explicit confirmation.
- Can reverse an applied patch after a successful reverse-patch check.
- Preserves revision and decision history under `~/.gtm-ide`.

The Buffalo Projects acceptance case proves:

- `ref` enters through the join flow.
- `project_created` is emitted with builder, project, privacy, and category.
- No source, referrer, campaign, or channel reaches that win event.

## The GTM flow library

The secondary flow surface supports reusable GTM execution graphs:

- Editable context, prompts, connector choices, configuration, and node
  positions.
- Full-flow or dependency-scoped single-node runs.
- Per-node success, failure, blocked, and pending-review results.
- Founder gates that actually block every downstream data node.
- Durable graph edits and the latest 50 run results.
- Honest connector requirements and unavailable states.
- Local staging of founder-approved actions. The default graph never sends
  outreach.

External search and generation require their respective environment keys. A
missing key blocks only the dependent branch and leaves every completed result
inspectable.

## Run

Requirements:

- Node.js
- Git
- Codex CLI, signed in, for change-set generation

```sh
npm start
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

The default workspace uses `~/Buffalo-Projects` and `project_created`.

## Verify

```sh
npm test
```

The release gate runs:

- Scanner regressions.
- Isolated change-set creation.
- Workspace persistence, approval, apply, revert, and dirty-repository safety.
- Graph dependency, gate, partial-run, and persistence tests.
- Frontend lint.
- TypeScript and production frontend build.

Direct repository scan:

```sh
node brain/src/mirror.mjs ~/Buffalo-Projects --win project_created
```

## Architecture

```text
brain/src/scan.mjs        grounded repository analysis
brain/src/workspace.mjs   durable proof, revision, decision, and run state
brain/src/revision.mjs    review, apply, and revert safety
brain/src/build.mjs       isolated worktree + Codex change-set generation
brain/src/graph.mjs       dependency-aware GTM graph execution
brain/src/flow-store.mjs  durable graph and run history
brain/src/server.mjs      local API and static application server
ui/                      React, Tailwind, and React Flow interface
```

`Sources/GTMIDE/` is an earlier SwiftUI exploration, not the release path.

## Safety boundary

- Scanning is read-only.
- Change generation creates `codex/gtm-fix-*` branches under
  `~/.gtm-ide/worktrees`.
- Direct apply requires approval, an unchanged source `HEAD`, a clean source
  worktree, and a successful `git apply --check`.
- Revert requires a successful reverse-patch check.
- General GTM execution stops at founder gates.
- The included execution connector stages approved actions locally; it does not
  send or publish.
