> **ARCHIVED.** This UX/completion plan targets the earlier "IDE for GTM" product. It is not a
> current plan. Current product and UX authority lives in [FIRM-SPEC.md](../FIRM-SPEC.md),
> [STATE.md](../STATE.md), and the root [DESIGN.md](../../DESIGN.md).

---

# Drover completion plan

## Product judgment

GTM IDE is a code-grounded GTM debugger first and a general GTM operating
environment second. The product should not ask users to draw an abstract
automation graph before it has understood the product. Its primary loop is:

1. Open a repository.
2. Name the outcome that matters.
3. Inspect production code and preserve the evidence.
4. Diagnose the first measurable break.
5. Create a proposed repository change in an isolated branch and worktree.
6. Review the exact diff and the evidence behind it.
7. Approve or reject the change.
8. Apply it locally or continue in the isolated branch.
9. Verify the outcome again.
10. Preserve the run, decision, evidence, and revision history.

The general GTM graph remains useful, but it is a secondary flow library. It
must obey the same execution contract: visible inputs, per-node results,
approval gates, durable runs, and honest unavailable states.

## UX plan

Entry: open a repository workspace. The primary path moves from inspection to
reviewed change and verification; the alternate path preserves already-proven
or missing-evidence outcomes. Every dead end has recovery. The primary action is
always adjacent to the current object. The moment of value is a cited diagnosis,
and the return loop is durable proof, revision, and decision history.

### User goal

Turn an important GTM outcome into a measurable, repairable, and repeatable
repository-backed workflow without losing control of source code.

### Entry

- Open the default Buffalo Projects example.
- Enter another local repository and outcome event.
- Reopen a recently saved workspace.

### Primary path

Open workspace → inspect repository → select the diagnosed gap → create a
change set → review evidence and diff → approve → continue in its branch or
apply locally → verify → record the decision.

### Alternate path

- The outcome is already instrumented: preserve the proof and create no repair.
- The outcome cannot be found: show missing evidence and allow the outcome to
  be revised.
- The repair agent produces no safe diff: preserve the attempt and explanation.
- A connector-backed general GTM flow is unavailable: show the exact blocked
  node and keep runnable local nodes usable.
- The founder rejects a proposal: retain it in history without applying it.

### Dead end

- Generic graph errors that discard node-level results.
- Approval gates that visually pause but still execute downstream nodes.
- “Feedback” and “saved” language without durable state.
- Graph edits that disappear on refresh.
- A repair diff with no durable relationship to the evidence and decision.

### First meaningful action

Open a repository and name its win event.

### Moment of value

See a grounded diagnosis with production-code citations and one explicit next
change.

### Trust moment

Review the exact patch beside the evidence, branch, worktree, test summary, and
approval state before any source repository is changed.

### Return loop

Reopen the workspace to see prior scans, proposals, decisions, applied changes,
and verification results. Rerun the outcome after the repository changes.

### IA and flow acceptance

The entry point, primary path, alternate path, dead end recovery, moment of
value, and return loop must all remain visible in one workspace rather than
being split across unrelated dashboard pages.

## Component match table

Each slot names its interaction type, component choice, repo source, semantic
fit, required states, and rejected alternatives. Existing repo components,
tokens, primitives, and packages are reused before a bespoke component is
introduced.

| Slot | Component | Source | Decision | Required states and obligations |
| --- | --- | --- | --- | --- |
| Workspace navigation | Compact workspace list | Bespoke on existing panel styles | New domain component | Empty, selected, long paths, keyboard buttons |
| Primary mode | Existing toolbar tabs | Existing `App.tsx` pattern | Reuse | Selected state and visible focus |
| Workflow map | `GraphCanvas` / React Flow | Existing package | Extend | Node status, blocked state, individual run, keyboard alternative |
| Evidence | `CitationList` | Existing component | Reuse | Missing evidence and long code |
| Change review | Change-set inspector | Bespoke | New signature component | Generating, no diff, failed, review, approved, rejected, applied, reverted |
| Diff | Semantic preformatted diff | Native HTML/CSS | Bespoke composition | Horizontal scroll, additions/deletions, accessible text |
| Decisions/history | Timeline list | Bespoke on native list/buttons | New domain component | Empty, current item, timestamps, long summaries |
| Confirmation | Inline confirmation panel | Existing panel/button primitives | Reuse/extend | Explicit apply/revert wording, cancel, focus visibility |
| General flow nodes | Existing `NodeEditor` and `GraphCanvas` | Existing components | Extend | Partial results, blocked descendants, gate approval |

No new dependency is required.

The repo components are matched to their semantic interaction type: toolbar
tabs remain a peer mode choice; native buttons remain commands; repository and
outcome fields remain labeled text inputs; the React Flow canvas is a visual
sequence, never the only keyboard path. Existing CSS variables in
`ui/src/index.css` remain the token source for color, spacing, type, borders,
and status.

## Placement rationale

Why here: placement follows the object each control governs, its frequency,
risk, and whether it is navigation, mode, filter, command, proof, or feedback.
Alternatives such as a hidden menu, modal, header action, or disconnected page
are rejected when they obscure context.

- Workspace identity and recent work belong in the left rail because they
  govern the whole session and must remain visible while reviewing evidence.
- The workflow map remains central because it shows sequence and status, but it
  is not the source of truth. Selecting a step reveals its proof or result.
- The right inspector owns evidence, proposals, approvals, and diffs because
  these actions affect the selected workflow object.
- Run, propose, approve, apply, revert, and verify controls sit next to the
  object they affect. Consequential actions are never hidden in a global menu.
- History sits below the active workspace summary rather than in a separate
  dashboard, keeping prior decisions connected to the current outcome.

### Why here and rejected alternatives

- The workspace selector is high frequency and governs the whole screen, so it
  stays in the rail rather than a modal or header dropdown. Hiding it would make
  switching context risky when a diff is open.
- Funnel and general-flow mode is a peer mode switch, so it stays in visible
  tabs rather than filters or overflow.
- Proposal, approval, apply, revert, and verify are object commands. They sit in
  the inspector instead of a global toolbar because the wrong revision or
  repository would be consequential.
- Status and proof remain adjacent to the affected step. A toast-only design was
  rejected because failures and evidence must survive after the notification.
- Destructive or source-changing confirmation appears inline in the inspector.
  A tiny modal was rejected because the user must still see branch, repository,
  dirty-state, and diff context.

## State matrix

The state and accessibility contract covers loading, empty, recoverable error,
disabled, focus, permission, offline, mobile, long text, and AI execution
states. A11y validation includes keyboard completion, semantic HTML, accessible
labels, ARIA only where needed, WCAG contrast, and APG obligations for any
custom widget.

| State | Behavior |
| --- | --- |
| Loading | Keep the shell stable and label the active repository operation. |
| Empty / new workspace | Show repository and outcome inputs with one primary open action. |
| Proven gap | Select diagnosis and expose create-change-set action. |
| Already instrumented | Show proof and verify action; disable repair generation. |
| Missing outcome | Mark evidence missing and keep the outcome field editable. |
| Proposal generating | Show branch/worktree creation and agent activity; disable duplicate generation. |
| Proposal failed | Preserve the failed revision and show its exact recoverable error. |
| Proposal ready | Show diff, summary, status, tests, evidence, and approve/reject controls. |
| Disabled | Explain why repair, approve, apply, revert, or verify is unavailable. |
| Permission / unavailable | Block actions whose connector, repository, or approval requirement is missing. |
| Approved | Enable branch/apply actions; preserve who/when as a local founder decision. |
| Rejected | Keep the revision in history and disable apply. |
| Applied | Show verification as the primary next action. |
| Reverted | Preserve the reversal and allow a new proposal. |
| Dirty source repository | Block direct apply and recommend the isolated branch. |
| Graph partial failure | Return and render every node result; focus the first failed node. |
| Gate pending | Do not execute descendants until approved. |
| Connector unavailable | Mark the node blocked with its exact requirement. |
| Offline/external failure | Preserve local state and allow retry. |
| Mobile / narrow viewport | Collapse rails into stacked regions without hiding the primary action. |
| Long text / paths / diffs | Wrap labels and horizontally scroll code without moving controls. |
| Keyboard | Every action has a native button/input path; dragging is optional. |

## Accessibility contract

- Use native landmarks, headings, lists, buttons, inputs, and `pre`/`code`
  semantics before ARIA.
- Every icon button has an accessible name. Status never relies on color alone.
- Focus remains visible at WCAG contrast and is not clipped by panels.
- The keyboard path can open a workspace, select a step, create a proposal,
  review it, approve or reject it, and start verification.
- Async errors are persistent beside the affected object and announced with
  `role="alert"` where appropriate.
- Apply and revert confirmations receive focus when opened; cancel restores
  focus to the invoking button.
- React Flow dragging is optional. A list of workflow steps exposes the same
  selection and run actions for keyboard and assistive-technology users.
- Motion respects reduced-motion preferences. No APG custom widget is added
  without its required keyboard contract.

## Validation plan

Acceptance uses unit test, lint, typecheck, browser and Playwright-style
interaction checks, breakpoint screenshot evidence, accessibility review, and
the repair loop until the thresholds below pass.

- Unit tests for workspace creation, persistence, revisions, decisions, apply,
  revert, graph gate semantics, dependency skipping, and individual-node runs.
- Existing scanner regression tests remain mandatory.
- Full `npm test`.
- Explicit lint, TypeScript typecheck through the production build, and Node
  unit-test output must be clean.
- Browser checks:
  - open the Buffalo workspace;
  - inspect the proven gap;
  - view durable history;
  - run the general graph without keys and inspect the exact failed node;
  - approve/reject a fixture proposal without touching a real source repo;
  - reload and confirm workspace state persists;
  - capture desktop, tablet, and mobile breakpoint screenshots;
  - run the primary path with mouse and keyboard;
  - verify focus, disabled actions, long text, and recoverable errors;
  - inspect browser console errors.
- No real proposal is applied to Buffalo Projects during automated verification.

### Acceptance thresholds

- All tests, lint, and typecheck/build pass.
- The browser primary path completes without a console error.
- Reloading preserves the active workspace, scan history, and decisions.
- A graph failure renders the exact failed node and preserves successful node
  results.
- A pending gate prevents every data descendant from executing.
- Desktop, tablet, and mobile screenshots have no clipped primary action or
  overlapping controls.
- Playwright-style browser interaction and screenshot evidence are captured
  through the in-app browser repair loop.

## Proposed diff

### Add

- `brain/src/workspace.mjs`: durable local workspace, run, revision, and decision
  model.
- `brain/src/revision.mjs`: safe patch review, branch/apply/revert operations.
- `brain/test/workspace.test.mjs`: persistence and revision coverage.
- Focused UI components for workspace navigation, workflow steps, change review,
  and history.

### Edit

- `brain/src/server.mjs`: workspace and revision APIs; domain failures return
  structured results.
- `brain/src/graph.mjs`: correct dependency, partial-run, and approval semantics.
- `brain/src/connectors/registry.mjs`: honest executable connector registry and
  context wiring.
- `ui/src/api.ts`: preserve structured non-success run payloads.
- `ui/src/types.ts`: durable workspace, revision, decision, and run types.
- `ui/src/App.tsx`: make the repository-backed workspace the primary flow.
- `ui/src/components/GraphCanvas.tsx` and `NodeEditor.tsx`: individual step
  execution, blocked states, approval, and partial failure visibility.
- `ui/src/index.css`: styles for the new domain components and responsive states.
- `README.md`, `docs/EVALS.md`, and `AGENTS.md`: document the finished workflow
  and safety boundary.

### Leave untouched

- `Sources/GTMIDE/`: native packaging is not part of this product completion.
- Existing user changes unrelated to the local web product.
