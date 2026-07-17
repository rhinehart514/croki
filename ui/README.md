# Drover interface

The interface is the Electron desktop founder workbench defined by
[`docs/FIRM-SPEC.md`](../docs/FIRM-SPEC.md) and root [`DESIGN.md`](../DESIGN.md).
[`docs/STATE.md`](../docs/STATE.md) records what the current tree proves.

## Surface contract

- The venture canvas is the main work surface over one canonical open Product/go-to-market model.
- One continuous venture conversation and persistent scoped branches direct and interrogate the canvas.
- A compact workspace index organizes branches, views, snapshots, active runs, and founder-required
  decisions without duplicating the venture into another tree.
- Selection focuses an object, reveals relevant relationships, restores its branch/artifacts, and scopes the
  same composer while the wider venture remains visible.
- Understand, Design, Execute, and Learn are reversible lenses, never workflow stages or duplicate stores.
- Generated visual answers are temporary. Saved live views remain synchronized; snapshots are immutable.
- The canvas owns presentation state—placement, camera, route bends, visual-only groups—not semantic truth.
- Direct manipulation is reversible. Ambiguous semantic gestures expose Drover's interpretation before
  changing the canonical model.
- Deep code, diffs, previews, campaign assets, research, telemetry, comparisons, workflows, and exact
  founder consequences open in a temporary resizable workbench that preserves canvas and conversation
  context.
- Claude/Codex runs remain visible through scoped work, milestones, provenance, verification, cost, and
  failures. They do not become roster navigation or an AI org chart.
- Founder controls use exact consequence verbs; no generic approval action crosses send, publish, deploy,
  spend, destructive/irreversible change, canonical-truth resolution, evidence review, or work ending.

The current source still contains Now, immersive, and legacy shells plus compatibility-era teammate/bet
components. They are migration debt under the approved direction, not alternate product options.

## Founder language

Product-owned copy names the concrete Product or go-to-market object, work, artifact, evidence, and
consequence. Historical identifiers such as `gtm-ide`, `bet`, `fork`, `channel`, and `~/.gtm-ide` may remain
in source and storage until a safe migration; they are not required founder vocabulary.

## Platform contract

Desktop only. The shell has a 960-pixel compatibility minimum and is judged at 1440×900 and 1280×800,
including browser zoom through 200%. Phone and tablet responsiveness is not a target. Keyboard operation,
visible focus, reduced motion, semantic names, contrast, and unclipped primary actions remain required.

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

Browser journeys are deterministic regression receipts. The Electron product, outside-founder
comprehension, real effects, and market value require separate evidence.
