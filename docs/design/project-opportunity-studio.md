# Project Opportunity Studio

> **Superseded (2026-06-28).** This documents the generate-then-review Opportunity Studio,
> which has been removed. The founder rejected the auto-generated accept-list; channels are
> now named directly and compiled into programs (`compileChannelProgram` / `compose_channel`),
> and ideation is the composer's thinking posture, not a board. The `OpportunityStudio` UI,
> `opportunity-engine.mjs`, `ideation.mjs`, and the `list_opportunities` /
> `generate_opportunities` / `review_opportunity` tools no longer exist. Kept as a dated
> build-record of what shipped then; see `docs/GOAL.md` P11 for the removal.

## UX Plan

Entry: project switcher or add-product empty state. Primary path: select repository, understand evidence, review opportunities, compose, and run. Alternate path: return to saved opportunities or add inputs first. Dead end removed: blank channels with no strategic help. Moment of value: evidence-backed channel and agent candidates. Return loop: measured outcomes and founder decisions update future inputs. Primary action: compose the reviewed opportunity set.

### Goal

- User: a founder or GTM engineer with one or more product codebases.
- Job to be done: select a product, understand what the code proves, review grounded and speculative channel/agent opportunities, then compose selected opportunities into a safe executable GTM system.
- Success signal: a founder can move from repository selection to a validated channel graph containing chosen agents, inputs, outputs, a founder gate, and an attributable feedback path without editing graph JSON.
- Non-goals: automatically approving gates, sending or publishing without approval, claiming speculative opportunities are proven, replacing arbitrary external ETL platforms, or creating a fixed catalog of GTM channels.

### Flow Map

- Entry points:
  - Product switcher in the global toolbar.
  - Empty-state “Add product” action.
  - Existing repository workspace promoted into a project.
- Primary path:
  1. Pick or add a product repository and define its real win event.
  2. Scan the repository and inspect a code-grounded product brief.
  3. Generate opportunity candidates.
  4. Review channel and agent candidates, each labeled `derived` or `speculative`.
  5. Edit, accept, reject, or defer candidates.
  6. Select accepted channel and agent candidates to compose.
  7. Choose input and output adapters.
  8. Preview the workflow, including founder gate and feedback edge.
  9. Compose the channel into the project and open its canvas.
- Alternate paths:
  - Add a CSV/manual input before opportunity generation.
  - Add an API input or API output with configuration placeholders.
  - Author or edit an accepted agent artifact before composition.
  - Return to opportunities later after outcomes or product feedback change.
  - Create a blank channel from the existing channel surface.
- Dead ends or loops to remove:
  - Booting directly into the last channel with no visible product context.
  - A blank channel requiring the founder to invent its strategy before the product helps.
  - Agent creation hidden inside generic chat with no reviewable artifact.
  - Outcomes recorded without a visible path back into future workflow inputs.
- First meaningful action: selecting a repository-backed project.
- Moment of value: seeing a credible opportunity set whose evidence links back to production code.
- Trust/proof moment: reviewing exactly why an opportunity is derived or speculative before it can become executable.
- Return loop: observed outcomes and founder decisions update project intelligence, then opportunity generation and future input nodes consume that updated context.

### Screen Inventory

| Screen | Purpose | Primary object | Primary action | Secondary actions |
|---|---|---|---|---|
| Project picker | Select or create the product context | Product project | Open project | Add project, rescan |
| Product understanding | Inspect code-grounded product truth | Product brief | Generate opportunities | Review citations, rescan |
| Opportunity studio | Compare channel and agent candidates | Opportunity | Accept/edit/reject | Filter, defer, regenerate |
| Composition review | Turn selected candidates into a workflow | Proposed workflow | Compose channel | Configure adapters, edit agent |
| Channel portfolio | Operate composed GTM systems | Channel | Open/run channel | Duplicate, preserve brief |
| Workflow canvas | Build, simulate, gate, and debug | Executable graph | Run loop | Edit nodes/artifacts |

### Acceptance Criteria

- Multiple projects persist independently and can be selected.
- Every project scopes its repository grounding, channels, opportunities, and active channel.
- Product understanding shows file-and-line evidence and honest blind/inferred states.
- Opportunity generation produces both channel and agent candidates.
- Every candidate records origin, rationale, evidence, confidence, status, and revision history.
- Review decisions persist without immediately mutating workflows.
- Accepted selections compose through validated typed graph operations.
- Agent steps can target Claude or Codex and expose an editable on-disk artifact.
- Inputs support manual rows, CSV content, and HTTP APIs.
- Outputs support local/manual staging and gated HTTP APIs.
- A feedback edge and attributable action identifier connect measured outcomes to future context/input.
- The existing founder gate remains mandatory before external output.

## Component Match Table

Existing repo components and tokens remain the visual foundation. Each slot lists its interaction type, choice, source, semantic fit, required states, and rejected alternatives. Reuse and approved primitives come before a package or bespoke component; the two bespoke components are product-specific rather than cosmetic.

| Screen/slot | Interaction type | Choice | Source | Reuse/package/bespoke | Required states | A11y obligations | Rejected alternatives |
|---|---|---|---|---|---|---|---|
| Global project switcher | Navigation/select | Native button + project menu panel | Existing toolbar patterns | Bespoke on existing buttons | loading, empty, active, error | button semantics, focus return, Escape close | Hidden settings selector |
| Add project form | Structured creation | Inline form | Existing channel create pattern | Reuse pattern | idle, scanning, invalid repo, scan error | labels, error association, submit state | Blocking modal |
| Product brief | Evidence summary | Evidence rows and status chips | Problems rail/citation patterns | Extend existing | proven, inferred, blind, rescanning | headings and source links/buttons | Generic metric cards |
| Opportunity candidate | Review/decision | Opportunity decision row | Channel card + gate review patterns | Bespoke product primitive | proposed, accepted, rejected, deferred, editing | radio/button labels, keyboard decision path | Kanban board |
| Agent candidate | Review/artifact | Opportunity row with provider/model controls | Artifact editor | Extend existing | Claude, Codex, missing runtime, editing | explicit provider labels | Separate agent marketplace |
| Input/output adapter | Configuration | Adapter choice row | Node editor controls | Extend existing | manual, CSV, API, invalid config | field labels, validation messages | Free-form JSON first |
| Workflow preview | Trust before mutation | Linear step preview with feedback return | Graph concepts | Bespoke compact preview | valid, invalid, missing gate | list semantics, status text | Full canvas before composition |
| Compose action | Mutation | Primary button | Existing Button | Reuse | disabled, composing, success, error | disabled reason, live status | Auto-compose on accept |

### Package Or Bespoke Justification

- New dependencies: none.
- Bespoke components: project picker and opportunity decision surface because they express the product’s unique evidence-to-system workflow.
- Existing components extended: toolbar, artifact editor, channel cards, node editor controls, evidence/status styling.

## Placement Rationale

Every control names what it governs, why here beats the alternatives, and its frequency and risk. Visible mode controls separate project understanding, opportunity review, and channels. The only filters are opportunity type and origin.

| Control or region | Governs | Placement | Why here | Why alternatives lose | Frequency/risk |
|---|---|---|---|---|---|
| Project switcher | Global product scope | First breadcrumb after brand | Everything else is project-scoped | Settings hides the primary context | Frequent, high consequence |
| Understand/Opportunities/Channels modes | Project-level workflow stage | Visible center navigation | These are the three major jobs before channel execution | Mixing them with Build/Simulate/Run confuses scopes | Frequent |
| Add/rescan project | Repository truth | Project picker and understanding header | Close to the object being changed | Global command bar obscures scan consequence | Occasional, medium consequence |
| Opportunity decisions | Candidate lifecycle | On each candidate | The decision needs evidence and rationale in view | Bulk decisions hide judgment | Frequent, consequential |
| Compose selected | Accepted candidate set | Sticky opportunity footer/header | It governs the reviewed set | Per-card composition creates partial systems | Occasional, high consequence |
| Provider choice | Agent execution | Agent candidate/configuration | It belongs to the agent artifact | Environment settings make agents opaque | Occasional |
| Input/output adapters | Workflow boundary | Composition review | They define the system boundary | Hiding them in node details weakens comprehension | Per composition |
| Founder gate | External boundary | Workflow preview and canvas | Must be visible before composition and execution | Runtime-only visibility is too late | Always, critical |

### Primary Hierarchy

- Primary object: the selected product project.
- Primary action: generate and review executable opportunities grounded in that product.
- Mode controls: Understand, Opportunities, Channels.
- Filters: opportunity type and origin only.
- Status/proof: evidence state and review status stay on each candidate.
- Recovery: rescan, regenerate, edit, defer, or return to the previous saved opportunity set.

## State Matrix

Accessibility and a11y contract: use semantic buttons, forms, lists, headings, and status text; every input has a visible label or aria-label; keyboard order follows the visual order; focus remains visible and returns after menus close; status and confidence never rely on color alone; errors are associated with fields; contrast follows the existing accessible tokens and WCAG expectations. No custom APG widget is introduced.

| Component/screen | Default | Loading | Empty | Error/retry | Disabled | Hover/focus/active | Permission/auth | Offline | Mobile/tablet/desktop | Long text/localization | AI states | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Project picker | projects listed | loading projects | add first product | reload/list retry | add disabled during scan | visible focus and selected project | local filesystem only | local server error | stacked under tablet width | truncate path, preserve title | scan running/cancel-safe | No deletion in this scope |
| Product brief | report and citations | scanning | no report yet | rescan retry | generate blocked without report | citation focus | read-only scan | server error | columns collapse | wrap evidence | missing evidence/blind | Date every scan |
| Opportunity studio | candidate groups | generating | no candidates | regenerate retry | compose disabled with no accepted channel | selected and decision focus | runtime availability shown | preserve last saved set | single column mobile | rationale wraps | generating, low confidence, stale | Never blur derived/speculative |
| Agent candidate | provider/model/ref | artifact loading | scaffold agent | save/run error | unavailable provider explained | provider active state | Claude/Codex availability | local artifact still editable | controls stack | prompt scrolls | missing runtime | No external execution at review |
| Composition review | step preview | composing | no accepted set | validation error | API output blocked until gate exists | focusable steps | output auth config remains local | saveable draft | linear compact layout | labels wrap | generated proposal review | Mutation only on explicit compose |

### State Decisions

- Unsupported states and why: project deletion and remote team permissions are excluded because they add destructive and collaboration boundaries unrelated to the first complete loop.
- Recovery paths: saved project/report/opportunities remain intact after generation failure; composition validation never partially writes a channel.
- Copy needing review: generated opportunity names and rationales remain editable before acceptance.

## Validation Plan

Validation and repair uses the browser and Playwright where available, desktop/tablet/mobile breakpoints, screenshots, keyboard and accessibility checks, plus tests, lint, typecheck, production build, and explicit acceptance thresholds.

### Deterministic Checks

- Lint/typecheck: existing `npm test`.
- Unit/component tests: project migration/selection, opportunity persistence/review, graph composition, CSV parsing, API adapter validation, provider dispatch.
- Storybook/story checks: unavailable in this repository.
- Visual checks: desktop project creation, opportunity review, composition, resulting graph.
- Accessibility checks: labeled project and opportunity controls, keyboard decisions, focus-visible, no color-only origin/status.

### Browser Checks

- Desktop route: `http://127.0.0.1:4317`.
- Tablet route: same app at approximately 900px.
- Mobile route: same app at approximately 390px; verify no trapped controls.
- Primary path: add/select project → understand → generate → accept channel and agent → configure CSV/API boundaries → compose → open graph.
- Alternate path: existing project → opportunities → defer one candidate → compose remaining channel.
- Keyboard path: tab through mode switch, candidate decisions, adapter controls, and compose.
- Error/recovery path: invalid repository, malformed CSV, invalid API URL, unavailable Codex runtime.

### Acceptance Thresholds

- Required tests: full `npm test` green.
- Required screenshots: project picker, opportunity review, composed workflow on desktop; one narrow viewport.
- Required accessibility behavior: all controls named; decisions and modes operable by keyboard; focus remains visible.
- Known checks that cannot run: real external API delivery is tested with injected fetch rather than transmitting data.

## Proposed Diff

| File/module | Change | Why | Risk | Verification |
|---|---|---|---|---|
| `brain/src/project-store.mjs` | Multi-project index and project-scoped persistence | Make product selection real | Migration of current singleton | Migration tests |
| `brain/src/opportunity-store.mjs` | Durable briefs, candidates, decisions | Preserve reviewable intelligence | Schema drift | Store tests |
| `brain/src/opportunity-engine.mjs` | Deterministic evidence packet and model-ready proposal contract | Separate truth from ideation | Generic candidates | Grounding tests |
| `brain/src/workflow-composer.mjs` | Compose accepted candidates into validated graphs | Complete selection-to-execution | Unsafe/malformed graph | Composition tests |
| `brain/src/step-runners.mjs` and agent bridge/runtime files | Claude/Codex agent provider dispatch and bounded transforms | Make agent opportunities executable | Runtime availability | Injected runtime tests |
| `brain/src/connectors/find/*` | CSV and API inputs | Support practical data boundaries | Parsing/network failures | Connector tests |
| `brain/src/connectors/execute/*` | Manual/API outputs | Support safe output boundaries | External effects | Gate and mocked HTTP tests |
| `brain/src/server.mjs` | Project/opportunity/composition endpoints | Connect UI and operator | Route complexity | API-level tests where practical |
| `brain/src/operator-runtime.mjs` | Inspect/generate/review/compose tools | Let resident operator drive same engine | Model bypassing review | Tool and safety tests |
| `ui/src/App.tsx` | Project-level modes and selected project state | Establish correct IA | Large integration surface | Browser flow |
| `ui/src/components/ProjectPicker.tsx` | Product selection and creation | Activation | New component | Browser + keyboard |
| `ui/src/components/ProductUnderstanding.tsx` | Grounded brief | Make code truth legible | Dense evidence | Browser |
| `ui/src/components/OpportunityStudio.tsx` | Channel/agent review and composition | Product magic moment | Complex states | Browser + typecheck |
| `ui/src/api.ts`, `ui/src/types.ts`, `ui/src/index.css` | Contracts and styling | Support new surfaces | Regression | Build + browser |

### Scope Boundaries

- Must change: project persistence, opportunity lifecycle, graph composition, adapter nodes, provider selection, project-level UI.
- May change: operator tools, artifact scaffolds, portfolio brief copy, documentation.
- Must not change: founder gate semantics, direct repository scan truth rules, apply/deploy/publish permissions, unrelated SwiftUI prototype.

### Rollout Notes

- Feature flag: none; local product migration is backwards compatible.
- Analytics: no external analytics added.
- Migration/backwards compatibility: current singleton `project.json` becomes the first indexed project without losing channels or shared context.
