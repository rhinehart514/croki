# GTM IDE

GTM IDE is a local, code-grounded workspace for creating outcome programs,
generating personalized GTM capabilities, running them through gated workflows,
and compounding feedback into better future capabilities. Open a repository,
name the event that represents a real win, and the product connects
production-code evidence to a safe change loop:

```text
inspect → diagnose → propose → review → apply → verify
```

For go-to-market execution, the domain loop is:

```text
outcome program → agent creation policy → personalized agent → workflow → gate → feedback → better policy
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

- Arbitrary founder-defined channels. A new project starts with no prescribed
  channel catalog; each new channel starts as a blank durable graph.
- Channel creation, duplication, renaming, activation, and archiving without a
  hard-coded limit. Four to six simultaneous motions are an operating target,
  not six product templates.
- Editable context, prompts, connector choices, configuration, and node
  positions.
- Full-flow or dependency-scoped single-node runs.
- Per-node success, failure, blocked, and pending-review results.
- Founder gates that actually block every downstream data node.
- Durable graph edits and the latest 50 run results.
- Honest connector requirements and unavailable states.
- Local staging of founder-approved actions. The default graph never sends
  outreach.

The resident GTM operator turns that graph into an IDE loop:

- Runs through the bundled Claude Code Agent SDK, using an existing Claude Code
  login when available; a direct Anthropic API runtime remains the fallback.
- Accepts a durable plain-language goal.
- Inspects repository evidence, graph state, connector readiness, and problems.
- Applies validated typed graph patches rather than replacing graph JSON.
- Runs nodes or the full loop, diagnoses real results, and keeps working.
- Pauses at founder gates and resumes the exact reviewed run without rerunning
  upstream work.
- Preserves its goal, model conversation, events, run checkpoint, and status
  under `~/.gtm-ide/operator-sessions`.

External search and generation require their respective environment keys. A
missing key blocks only the dependent branch and leaves every completed result
inspectable.

## Product and channel composition

The project-level front door completes the path into those executable graphs.
Channels are defined directly — there is no opportunity accept-list to generate
and review; ideation is the composer's thinking posture (the `Ideate` button),
not a separate generate-then-accept board.

- Select or add multiple repository-backed product projects.
- Preserve independent code evidence, shared intelligence, and channels for each
  product.
- Name a channel directly (by the founder or by Claude) and compile it into a
  durable outcome program with buyer hypotheses, channel hypotheses, measurement
  plans, and status (`compileChannelProgram`).
- Keep code grounding available as production `file:line` evidence while
  unsupported strategic bets stay explicitly speculative.
- Choose Claude or Codex for each agent; the capability foundry creates an agent
  creation policy, personalization profile, personalized agent instance, and
  editable markdown artifact.
- Compose a channel spec plus its inline agents into a validated input → agents →
  founder gate → output → measure workflow (`compose_channel`).
- Use manual rows, local CSV content, or HTTP APIs as inputs; stage outputs
  locally or send approved items through a configured HTTP API.
- Feed observed outcomes, product feedback, founder decisions, and run failures
  into the feedback ledger so future agent creation policies improve.

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
brain/src/graph-operations.mjs validated typed graph patches
brain/src/flow-store.mjs  durable graph and run history
brain/src/operator-store.mjs durable operator sessions and event history
brain/src/operator-runtime.mjs resident model/tool operation loop
brain/src/channel-graph.mjs blank and duplicated channel graph creation
brain/src/project-store.mjs arbitrary channel portfolio + shared intelligence
brain/src/program-store.mjs durable outcome programs
brain/src/agent-policy-store.mjs agent creation policies and policy revision
brain/src/capability-foundry.mjs personalization profiles and agent instances
brain/src/feedback-ledger.mjs normalized feedback signals
brain/src/program-compiler.mjs program → policy → agent → graph compilation
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
