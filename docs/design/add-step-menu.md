# Add-step menu — redesign

The command dock's "+" menu (`ComposerDock.tsx` portal; `.composer-add-menu` in `index.css`;
`STEP_OPTIONS` in `lib/step-options.tsx`; shared primitive in `styles/menu.css`).

## The value problem (before)
A flat list of nine raw connectors under one label ("Add a block"). Three of nine slots were the
same concept — "where items enter" — in three modes (Manual / CSV / API), the lowest-judgment
block. The actual composition kinds (Agent / Skill / Code) and the safety spine (gate / output /
measure) carried the same flat weight as a CSV importer. The product's wedge — your *real* agents
and skills — was just the first row.

## The decision
This menu is the manual escape hatch from the vibe path: used when the founder knows the exact
block to drop. One split organizes it: **the Library is for capability (your real agents and
skills); the building blocks are for the deterministic spine around them (bring in → transform →
ship → measure).** The building blocks are precisely the steps the Library and the vibe path do
*not* hand you. Optimize for fast scan + that clean split.

- **Library as primary.** "Browse the library" is an elevated, filled row (`surface-2`, leading
  collection icon, trailing chevron) ranked above the blocks — the one place boldness is spent.
  Copy leans on the wedge word: "Your real agents and skills."
- **Cut the generic Agent / Skill rows.** They dropped a placeholder node with a hardcoded ref
  (`gtm-enrich`, `positioning`) you then reconfigure — the generic the product exists to beat,
  sitting one row under the wedge that beats it. Adding an agent/skill now goes through the Library
  (pick a real one, or author a new one); the menu stops having two doors to "add an agent."
- **Fold the gate + staged-output rows into one "Review & stage."** Staged output is an `execute`
  node, and the wall rejects any execute with no gate upstream — so a lone "Staged output" built a
  graph that wouldn't validate until you remembered to add and order a gate above it. "Review &
  stage" drops the gate→output pair already wired (`then` on the `StepOption`; `onAddChain` in the
  dock → `handleAddChain` in `App.tsx`), wall-valid by construction.
- **Collapse the three source variants into one "Input."** Unchanged from the prior pass: the node
  defaults to manual, and the founder switches mode (manual/csv/api) on the node via the existing
  `ConnectorSelector` in `NodeEditor.tsx`.
- **No eyebrows.** At four rows the flow order (Input · Code · Review & stage · Measure) carries the
  anatomy on its own; grouping labels earn their keep at seven rows, not four.
- Nine flat rows → one primary + four rows.

## The hand
- Color: tokens only — `--surface` (forced opaque; glass skin makes the token translucent),
  `--surface-2` (the one elevated fill), `--ink`/`--muted`/`--faint`/`--line`. Monochrome, no new accent.
- Type: existing scale — 13px label, 11px meta; primary label 600.
- Composition: "lead + four flat rows."
- Signature: the elevated library row.

## Mechanics also fixed in this pass
- **Clipping** — the menu now renders in a `document.body` portal anchored to the "+" button rect,
  so the dock's `overflow: hidden` rounded card can't cut it off (it opens upward, bottom-left origin).
- **Translucency** — forced opaque background (`#fbfaf8` glass skin / white otherwise) instead of the
  skin's translucent `--surface`; backdrop-filter killed on the menu.
- Escape + outside-click dismiss, since a portaled menu is no longer bounded by the dock.

## New shared primitive
`.menu-primary` in `styles/menu.css` — a reusable elevated lead-action row for any menu head.

Grounded in the existing shadcn-based `.menu` primitive. No new visual foundations; IA + layout
refinement inside the decided token system.
