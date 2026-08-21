# Croki 0.4.3 release notes

## Highlights

- Canvas now shows a bounded working understanding instead of rendering every
  runtime observation as a card.
- Each active Thread projects one current outcome, up to three semantic
  conclusions, one judgment or blocker, and one collapsed evidence group.
- Commands, context-window updates, checkpoints, receipts, and prior artifact
  revisions remain inspectable without filling the Canvas field with telemetry.
- The complete raw Perception Frame remains available to model-facing Croki
  Senses. Human-facing compression does not reduce agent perception.
- The Canvas layout now follows semantic hierarchy rather than chronology.
  Relationships stay hidden until selection, evidence is subordinate, and cards
  no longer form an endlessly growing event graph.
- Empty Threads show an honest empty state instead of a synthetic
  `Thread / 0 source events` outcome.

## Verification

The release is checked with:

```sh
npm run release:croki:plan
npm run release:smoke
npm run check:croki -- --base HEAD
```

Focused Canvas tests cover projection limits, mechanical-event compression,
judgment priority, evidence provenance, visible relationship integrity, source
selection, and the empty state. The web typecheck and browser-level Canvas
inspection also pass.

The package manifests aligned by the release script are `apps/server`,
`apps/desktop`, `apps/web`, and `packages/contracts`, all at `0.4.3`.

## Release gates

Destinations remain independently gated. The Croki-owned GitHub release may
publish desktop artifacts from `croki/main`; CLI, relay, web, signing, Discord,
and mobile destinations remain disabled until their own Croki-owned
configuration is enabled and validated.
