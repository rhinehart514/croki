# Drover interface

The interface is the desktop founder workbench for the firm defined in
[`docs/FIRM-SPEC.md`](../docs/FIRM-SPEC.md). [`docs/STATE.md`](../docs/STATE.md) is the dated proof
record; the root [`DESIGN.md`](../DESIGN.md) governs the visual system.

## Surface contract

- One persistent venture conversation occupies the left rail; the live infinite canvas is the main
  work surface at a 2:3 working ratio.
- The composer is the action spine. With no selection it addresses the venture; selecting an
  architecture element, teammate, bet, or exact workpiece sends an exact scope chip into the
  composer. A command leaves through that scope and its resulting act settles onto the canvas.
- The canvas is the Living Venture Atlas. Its opening view projects venture intent, product loops,
  reusable systems, motions, campaigns, wall pressure, and returned reality before teammate
  machinery. It owns placement only; semantic architecture and consequential records remain durable
  venture truth outside React Flow.
- A bet may be live, at the wall, or ended by the founder. The position is derived, never edited as
  a stored status. At-wall work remains inspectable, discussable, and forkable; the staged effect
  itself stays immutable until its wall decision.
- Configuration proposals and receipts appear in the conversation with readable before/after
  differences. Only the founder applies or restores a version.
- Teammate turns render as structured acts: the act, what changed, and its receipt. Runtime, model,
  cost, and configuration revision remain quiet provenance rather than navigation chrome.
- Wall controls are purpose-specific: release outward work, answer a teammate, review an outcome,
  or end a bet. No generic approval action crosses those purposes.

Founder-facing defaults say Drover, venture, teammate, bet, outcome, fork, and the wall. A configured
participant label may replace **teammate** consistently. **Outcome** always means returned reality.
Historical identifiers such as `gtm-ide` and `channel` are compatibility seams, not copy guidance.

## Platform contract

Desktop only. The shell has a 960-pixel minimum width; phone and tablet responsiveness is not a
target. Keyboard operation, visible focus, reduced motion, semantic control names, contrast, and
unclipped primary actions remain required at supported desktop sizes.

## Commands

From the repository root:

```sh
npm start
npm --prefix ui run test:unit
npm --prefix ui run lint
npm --prefix ui run build
npm run test:firm:browser
npm run test:acceptance
```

The single Firm journey is the shortest deterministic founder-flow receipt. Run
`npm run test:acceptance` before claiming the full interface is locally ready with the current brain.
