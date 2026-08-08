# Deferred composer toolbar cleanup

Status: superseded historical exploration

> This proposal predates Croki's native-provider boundary. Product, GTM,
> Venture, and Native behavior IDs are legacy compatibility data only. Croki
> now has no built-in harness selector; model-affecting configuration is applied
> explicitly by the user and remains visible, scoped, removable, and reversible.

## Opportunity

The web composer footer can present provider/model, turn behavior, project
context, access, interaction mode, plan or task navigation, context-window
usage, and send or stop at the same visual level. At medium widths this becomes
a long control train such as:

```text
OpenAI  Native  No Canvas · project  Full access  Build  Tasks  context  Stop
```

Spacing and separators cannot give this row a clear hierarchy because it mixes
four different kinds of information:

- what will answer: provider and model;
- how the turn will be approached: Native, Product, or GTM plus Build or Plan;
- what authority and context the turn receives;
- navigation and run controls.

This proposal is a future simplification, not a commitment for the current
release.

## Surface brief

The user is composing or supervising a turn and needs to confirm the model,
material deviations from normal turn setup, and the primary run action without
parsing every default.

The finished surface should prioritize:

1. provider and model;
2. one inspectable summary of turn behavior and access;
3. send or stop.

Applied project context remains visible and removable because it affects the
next turn. Panel navigation and passive telemetry do not compete with the
primary action.

## Proposed wide layout

```text
[ Model ▾ ]  [ Build · Full access ▾ ]                         [ Stop ]
```

The second control is a single turn-setup summary. Its menu keeps the existing
independent choices explicit:

```text
Work          Build / Plan
Specialist    Provider default / Product / GTM
Access        Supervised / Auto-accept edits / Auto / Full access
```

The summary is exception-first:

- default provider behavior in Build mode: `Build · Full access`;
- Product harness: `Product · Full access`;
- GTM harness in Plan mode: `GTM · Plan · Full access`;
- supervised access: retain `Supervised` in the visible summary.

Product and GTM remain explicit, scoped, reversible harnesses. Consolidation
changes presentation only. It must not merge provider runtime, context, tools,
permissions, or harness semantics.

## Context treatment

Do not render an inline negative status such as `No Canvas`, `No context`, or
`Context empty`. Absence does not affect the turn and should not occupy the
footer. The workspace name is already established elsewhere and should not be
repeated.

When approved project context will be included, expose it in the existing
context area above the prompt:

```text
Context 4        Canvas selection: Pricing · Distribution
```

The context affordance opens the content-safe turn setup inspection and offers
a scoped way to omit removable context from the next turn. Canvas selections
remain separate, visible user-message context.

Invalid, partial, oversized, or unavailable context should surface as a concise
warning. Loading should appear only when it blocks a reliable setup result or
lasts long enough to be meaningful.

## Tasks and Plan

Tasks or Plan opens a right-panel surface, so it should not be a peer of Build
and Stop inside the composer.

- Use the right-panel tab when the panel is open.
- When the panel is closed and actionable work exists, use a neutral edge
  affordance with an optional count.
- Do not use primary blue treatment for an already-open panel while Stop is the
  active run action.
- Resolve the current naming split in which the composer may say `Tasks` while
  the right-panel surface says `Plan`.

## Context-window usage

The circular context-window meter resembles a loading spinner beside Stop.
Keep its full detail available from model or turn inspection, but only surface
it inline when capacity requires attention. If the provider compacts
automatically and no user action is required, routine utilization should remain
quiet.

Warnings should use explicit text or a legible warning icon rather than relying
on an unlabeled progress ring.

## Responsive behavior

The footer should not depend on horizontal scrolling to reveal turn controls.

- Wide: model, turn setup, and send or stop remain visible.
- Medium: shorten labels without splitting turn setup back into separate
  controls.
- Narrow and touch: retain model and turn setup as icon-led controls; keep the
  selected state in accessible names and the opened menu.
- Keyboard: every setting remains reachable, focus returns to the trigger after
  menu dismissal, and the existing interaction-mode shortcut remains valid.
- Reduced motion: no new animated status or continuously repainting effect.

## What disappears

- the persistent Native default label;
- negative Canvas or context status;
- the repeated workspace name;
- most vertical separators;
- Tasks or Plan navigation inside the composer;
- routine context-window telemetry beside the primary action;
- horizontal footer scrolling as the normal overflow strategy.

## Likely implementation boundary

A future implementation should remain feature-local and reuse existing menu,
select, tooltip, and button primitives. It should not add a dependency or a new
design-system layer.

Likely owners:

- `apps/web/src/components/chat/ChatComposer.tsx` for footer composition;
- a focused `ComposerTurnSetup` component for the combined control;
- `CrokiContextPresentation.tsx` for exception-driven context visibility;
- `ContextWindowMeter.tsx` for warning-only inline presentation;
- `ChatView.tsx` and `RightPanelTabs.tsx` for Plan or Tasks naming and
  navigation placement.

## Acceptance criteria

- The normal running state contains no more than two left-side controls and one
  primary right-side action.
- Product or GTM is visible before send whenever selected.
- Applied context is visible, inspectable, and removable before send.
- Full-access and supervised states remain distinguishable without opening the
  menu.
- Stop is the strongest action during a run.
- Plan or Tasks uses the same label in its launcher and destination.
- The footer does not horizontally scroll at representative desktop, medium,
  narrow, or touch widths.
- Existing provider, harness reset, access, plan-mode, send, and interrupt
  behavior remains unchanged.

## Decisions to revisit before implementation

- Whether routine context-window usage belongs in the model picker or the turn
  setup inspection.
- Whether the closed Tasks affordance belongs on the right-panel edge or in the
  Thread header.
- The exact compact summary when a named harness, Plan mode, and non-default
  access are active together.
