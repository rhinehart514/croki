---
status: canonical-current-code-record
refreshed: 2026-07-21
experience_direction: ../../DESIGN.md
token_source: ../../ui/src/index.css
feature_styles:
  - ../../ui/src/components/workspace/workspace-shell.css
  - ../../ui/src/components/thread/thread-shell.css
  - ../../ui/src/components/work-mode/work-mode.css
  - ../../ui/src/components/product-gtm/product-gtm.css
---

# Current design-system record

Root [`DESIGN.md`](../../DESIGN.md) owns the intended experience. This record names what the current production
tree actually renders.

## Product grammar

Croki is one calm, near-black desktop room with two founder surfaces:

- Work is direct Claude/Codex conversation and exact repository work.
- Product / GTM is the spatial living venture model: current truth, durable alternatives, live work, outward
  actions, founder gates, and returned evidence.

There is no production Releases, System, Atlas, pipeline-builder, organization-board, or Heat surface. The old
component trees and their feature CSS are absent from the production graph.

## Current implementation

- React 19, TypeScript, Vite, and Electron.
- `@xyflow/react` for the Product/GTM canvas.
- DM Sans for operating text; JetBrains Mono for exact machine material.
- Near-black `#090b0f` canvas, `#10141b` panels, and `#1a202a` lifted material.
- Blue `#5b8cff` only for direct action/focus.
- Amber `#e2a84a` only for founder authority.
- The fused dog-and-cat face is Croki's identity mark. It stays black and white at rest, leads installation,
  startup, and marketing surfaces, and remains restrained inside daily work. One spectrum sweep may mark launch
  or an idle-to-active transition; it settles immediately and never becomes ambient progress decoration.
- Current truth uses solid treatment. Provisional Product models use a dashed restrained texture and explicit
  language. Evidence returns use distinct source-bearing return edges.

Nodes are compact logo-led pills. The canvas derives a strictly left-to-right founder-authored consequence path
through Product, shared, and GTM territories in one graph. It frames the nearest exact contextual chapter first:
selection, founder gate, unread returned evidence, exact work needing review, stale provisional alternative,
active work, then the whole-venture trunk. Unrelated material remains spatially present but quiet, and a direct
`Whole venture` escape removes the temporary focus without creating a mode. Curved edges bridge territory
changes; a restrained spectrum marks only those crossings. Selecting a node expands its exact delta, decision,
work, or evidence in place. Supporting inputs sit at the exact step they affect; tentative repository reads
remain in a subordinate provisional field. Nodes are draggable, direct zoom controls and a minimap preserve
breadth, and persisted layout remains presentation rather than semantic truth. A compact top-right map key keeps
Product, shared truth, and GTM distinct. Its **GTM workflows** disclosure puts adopted workflows first and unfolds
their established operational steps on the same canvas; motions without established mechanics remain honest gaps.
The interaction adds neither a mode nor a filter over canonical truth.

## Responsive and state proof

The shell is judged at 1440×900 and 1280×800. The former 960px body floor was removed so a simulated 200% zoom
remains contained; at narrow effective widths the rail becomes an overlay and both founder surfaces remain
available. Reduced-motion media rules remove topology and shell transitions.

Deterministic acceptance currently proves:

- direct repository-first onboarding;
- Work conversation geometry and exact coding attempts;
- return/offline recovery without losing the draft;
- current truth, a provisional Product model, live work, and an outward founder gate on one canvas;
- exact selective merge becoming current Product truth;
- dense Product/GTM at 1440×900 and simulated 200% zoom;
- visible Electron and packaged-app launch.

Remaining screenshot QA is tracked in [`../STATE.md`](../STATE.md), which remains the current-proof authority.
