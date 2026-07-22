---
surface: product-gtm-attention
status: implemented
date: 2026-07-20
---

# Product / GTM attention tray

## Decision

Needs attention is a count-bearing disclosure over Whole venture, not a fourth Product / GTM destination.
Opening it preserves the canonical canvas in place. Opening a gap closes the tray and selects that exact
object on the canvas so the founder can inspect or act without crossing into a diagnostic list screen.

## Surface contract

- Screens touched: Product / GTM mode rail and workspace.
- Hierarchy: the venture map remains primary; attention is temporary review context.
- Layout: a compact left-anchored tray over the full-bleed canvas with one internal scroll owner.
- Signature interaction: selecting a gap collapses the tray into exact canvas selection.
- State: loading, empty, populated, long-list scrolling, work-state labels, close, keyboard focus, and narrow
  width containment are explicit.
- Tokens: existing Drover neutral, amber, type, radius, spacing, shadow, and focus tokens only; no token was
  promoted.

## Grounding

The existing Drover workspace rail, map, buttons, and tokens are reused. No new component library API,
Mobbin reference, motion system, or design specialist was needed for this feature-local collapse.

## Verification

- `npm test`
- Component coverage proves the map remains rendered, the header remains Whole venture, and selecting a gap
  returns to Whole venture with the exact object selected.
- Live browser inspection was attempted through the collaborative preview, but preview automation timed out
  and no fallback browser was available. Visual behavior therefore remains unclaimed until the next desktop
  or browser-harness inspection.

## Proof plan

In a venture with a large attention count, confirm that the founder can open attention, understand the count,
choose one gap, and reach its exact map context without losing orientation or treating attention as a backlog.
