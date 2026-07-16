# Chat + canvas evidence

> **Preserved pre-Atlas evidence.** These observations explain the configurable-firm interaction
> that survives beneath the Living Venture Atlas. They do not define the current opening canvas or
> implementation state; use [`../../../FIRM-SPEC.md`](../../../FIRM-SPEC.md) and
> [`../../../STATE.md`](../../../STATE.md).

The production pass began from the current `FirmApp`, `TeammateRail`, `ConversationFeed`,
`GoalComposer`, `FirmLens`, `CrewNode`, graph projection, styles, tests, and the five configurable-firm
explorations. These references informed the interaction shape; they were not copied as a visual skin.

## Mobbin reference pass — 2026-07-14

- [LangChain](https://mobbin.com/screens/9d16f34e-ec9c-4b5d-a64e-367ae02837a0) keeps the primary prompt
  calm and makes model/capability choice explicit at the point of sending. Drover therefore exposes
  Auto, Claude Code, and Codex in the composer instead of hiding routing behind a failed model name.
- [Grok](https://mobbin.com/screens/a4bb61ac-eadd-4249-90db-45a08dbd366c) keeps conversation controls
  persistent while the current artifact remains dominant. Drover uses a 2:3 conversation-to-canvas
  desktop split and keeps the composer anchored rather than opening a modal or separate chat page.
- [Leonardo AI](https://mobbin.com/screens/c8cf5e25-3820-42eb-addf-848481630d76) distinguishes persistent
  configuration from the artifact workspace without turning every option into visible chrome. Drover
  keeps detailed configuration progressive: the canvas shows participant/runtime/capability receipts,
  while structural changes are proposed, applied, and undone in the conversation.

## Resulting production decisions

- No canvas selection means the whole firm. A participant or bet selection narrows the same composer;
  it never silently defaults to the first teammate.
- Chat and canvas are projections of one versioned configuration. Canvas actions create unapplied
  chat proposals with field-level before/after diffs; applied changes redraw the canvas and return
  durable, reversible diff receipts.
- Participant nodes carry only consequential identity: configured presentation, runtime, and
  capability count. Lines remain reserved for real work and configured relationships. Organization
  lines use their own lateral anchors and labels; bet work leaves participants vertically, preventing
  a relationship from masquerading as execution flow.
- The default composer is a single quiet action row. Whole-firm revision context remains available to
  assistive technology, while focused scope and draft locking appear only when they affect the send.
- Animate UI `AutoHeight` handles proposal/receipt state changes under a global reduced-motion policy.
  Motion communicates spatial/state continuity and is not decorative.
