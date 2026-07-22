# Editable workflow authoring and contract audit

> **ARCHIVED DESIGN AUDIT.** This workflow-authoring model is explicitly outside the current Firm
> ontology. Use [FIRM-SPEC.md](../FIRM-SPEC.md).

## UX Plan

Entry begins on a built channel canvas, including a channel created from a model-composed ideation lane. The primary action is “Add step,” available directly on the canvas. The primary path is: add an input, agent, skill, gate, output, or measure step; connect it by dragging between handles; select the step; describe its required inputs and promised outputs in plain field names; save; then run. The moment of value is the canvas explaining a real operational constraint before or during execution, such as “Outreach draft needs personalFact” or “Measure is blind without source.”

The alternate path is to start with the reusable Pilot outreach recipe, then replace its providers, prompts, and data. Users may also disconnect an edge, delete a draft step, or ask Claude to revise the graph. A dead end is avoided by keeping the add-step control visible on an empty channel and by showing a concrete repair action for every blocked contract. The return loop is edit contract or source, rerun the affected step, review at the founder gate, then let measured outcomes feed future context. Preview ideation lanes remain read-only because their primary action is choosing a channel, not editing several speculative graphs at once.

## Component Match Table

| Slot | Interaction type | Source and fit | States | Choice |
| --- | --- | --- | --- | --- |
| Canvas graph | Spatial workflow editor | Reuse existing React Flow package, node primitives, handles, edge styles, layout, and repository tokens | idle, selected, connecting, invalid connection, running | Existing repo component |
| Add-step control | Compact choice menu | Bespoke panel using existing button, icon, type, spacing, and surface tokens | closed, open, disabled while running, keyboard focus | Bespoke because the repository has no step palette |
| Recipe action | One-click starting point | Reuse add-node and connect-node typed operations | available only for empty channels, applied, error | Existing mutation primitives |
| Contract editor | Small structured form | Extend the existing Rules tab and field primitives | unchanged, edited, invalid, saved | Existing inspector placement |
| Contract status | Inline state label | Extend existing node status area and health language | ready, waiting, blocked, satisfied, blind | Existing node primitive |
| Workflow audit | Scannable issue list | Bespoke React Flow Panel using existing problem-row visual language | clear, issues, selected issue, long text | Bespoke because contracts are graph-local rather than engine subsystem health |
| Delete action | Destructive draft edit | Extend inspector action row; use a confirm state | idle, confirm, disabled while running | Existing inspector action area |

Rejected choices: a full-screen workflow wizard does not fit a spatial IDE; a generic modal hides the graph relationship it governs; a second permanent left rail would compete with the existing Explorer; and editing contracts as raw JSON would make a core GTM concept inaccessible.

## Placement Rationale

The add-step control belongs in the canvas because it governs graph composition, is used frequently during build mode, and must remain close to the empty state and connection handles. It is hidden in ideation preview mode because that mode governs selection among speculative channels rather than authoring. The workflow audit belongs at the top-right of the canvas because it summarizes the graph without displacing the Explorer or node inspector; selecting an audit item focuses the governed node.

Contracts belong in the selected node’s Rules tab because they govern step behavior and change less frequently than run results. Their current state is repeated as a compact node badge because blocked data flow must be visible without opening every inspector. Delete belongs at the bottom of the inspector because it is a lower-frequency, higher-risk draft action. Alternatives considered were toolbar-only editing and a global schema page; both separate the decision from the step and make branch-specific repair harder.

## State Matrix

| Surface | Loading | Empty | Error | Disabled or permission | Keyboard and focus | Offline or long text | AI-specific |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Canvas authoring | Existing graph loading treatment | Add step and Pilot outreach recipe | Invalid cycle or duplicate connection appears in the existing error banner | Editing disabled while a run is active; ideation preview is read-only | Add-step button has a semantic label; menu items are buttons; Escape closes; node focus follows audit selection | No network required for local edits; labels truncate with full title | Model-composed graph is explicitly a starting point |
| Contract form | None after node selection | Blank accepts/emits means no declared contract | Invalid duplicate or malformed field names are labeled inline | Save disabled while running | Native inputs and labels; predictable tab order; visible focus | Comma-separated fields wrap; plain English replaces schema jargon | Agent output is not trusted merely because the model returned it |
| Node status | Running indicator already exists | “No contract” remains quiet | Blocked and blind use text plus icon, not color alone | No interactive permission | Status is included in accessible title/label | Long repair message is shortened on card and complete in audit | “Waiting” differs from “blocked”; generated output must satisfy declared fields |
| Workflow audit | None; derived immediately | “No contract issues” | Lists the first repair per affected node | Read-only during run | Every issue is a button that focuses the node; semantic heading and aria label | Panel scrolls; messages wrap | Static compatibility is distinguished from observed run evidence |
| Delete | None | Not applicable | Mutation error preserves the graph | Disabled while running | First click enters confirm state; second activates deletion; focus remains in inspector | Fully local | No agent may bypass the founder gate by deleting it during execution |

Accessibility contract: controls use semantic buttons and labels, status never relies on contrast alone, focus remains visible, and the graph supports keyboard deletion only through explicit selected-edge callbacks. Browser validation will inspect aria labels, focus order, text contrast, and behavior at desktop and narrow breakpoints.

## Validation Plan

Unit tests cover graph contract validation, typed operations preserving contracts, static compatibility audit, required-input blocking before a runner is invoked, output-contract failure, measurement blind state, and the Pilot outreach recipe. Existing graph, operator, engine, and gate tests must remain green. Typecheck and production build run through the repository’s full test command.

Browser acceptance checks at desktop and a narrow breakpoint: open a blank channel; add a manual input; add an agent; connect them; disconnect the edge; reconnect it; define accepts and emits; confirm the audit updates; load the Pilot outreach recipe; confirm drafting is blocked without `personalFact`; confirm Measure is blind without `source`; delete a node through confirmation; save and reload; and verify ideation preview remains non-editable. Capture screenshots of the clean, blocked, and blind states and repair any clipping, focus, or responsive defects found.

## Proposed Diff

- `brain/src/contracts.mjs`: normalize contracts, derive static graph audits, validate actual inputs and outputs, and produce plain-language repair messages.
- `brain/src/graph-operations.mjs`: validate and preserve node contracts through typed add and update operations.
- `brain/src/graph.mjs`: enforce required input contracts before execution and promised output contracts after execution.
- `brain/src/server.mjs` and `ui/src/api.ts`: expose validated graph operations and graph contract audit endpoints.
- `brain/src/workflow-recipes.mjs`: define the generic Pilot outreach recipe with manual/API-ready inputs, agent steps, founder gate, staged output, measurement, and feedback.
- `ui/src/types.ts`: add contract and audit types.
- `ui/src/components/GraphCanvas.tsx`: enable connections and edge deletion in build mode; add the step palette, recipe action, contract status badges, and workflow audit panel.
- `ui/src/components/NodeEditor.tsx`: add plain-language accepts/emits editing and confirmed node deletion.
- `ui/src/App.tsx`: route canvas edits through validated typed operations and refresh the audit.
- `ui/src/index.css`: style the palette, audit, contract fields, badges, and responsive states using existing tokens.
- `brain/test/`: add contract, recipe, and operation regression coverage.
