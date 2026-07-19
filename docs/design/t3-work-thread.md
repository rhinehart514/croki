# Continuous work thread

Status: implemented direction, 2026-07-18

## Product moment

A founder returns to a venture, opens one piece of work, understands what happened, reviews the actual
output, and either steers or makes the next consequential decision.

## Interaction contract

- Drover is a desktop-only operating environment. This surface has no mobile navigation or phone layout.
- Returning users resume a venture; the entry surface does not promise a canvas.
- The venture home is a return list ordered by consequence, not a dashboard of Drover machinery.
- Selected work is one continuous thread: intent, relevant conversation, exact returned material, then the
  next decision.
- Alternate representations are compact result views. They do not create a permanent inspector or third
  pane.
- Steering an approach and opening its produced material are different, explicitly labeled actions.
- The map is optional and summoned. Agent configuration and implementation machinery remain behind
  disclosure.

## Visual hand

- Composition: single-column editorial work thread inside the existing resizable venture index shell.
- Color: existing `--n-*` near-black neutral planes, blue only for action/focus, amber only for founder-held
  consequence, green only for truthful active work.
- Type: DM Sans operating hierarchy; repository paths, identifiers, runtime receipts, and diffs use the
  existing mono stack.
- Signature element: exact produced material appears inline as the next durable event in the work thread.
- Motion: the existing 150–200ms settling contract; only surface arrival and truthful active-work state.

## Acceptance checks

1. No returning-user label says “Open canvas.”
2. Selecting work never produces three simultaneous navigation/content panes.
3. A product change, draft, market return, or founder gate is visible in the same scroll as its conversation.
4. “Review” opens real staged content; “Steer” only scopes the composer and never implies acceptance.
5. At 1440×900, 1280×800, and the 960px desktop minimum, the composer does not overlap the work thread.
6. Back returns to the venture list; Map remains one explicit optional action.
