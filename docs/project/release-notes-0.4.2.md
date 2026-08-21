# Croki 0.4.2 release notes

## Highlights

- Canvas is now the zero-maintenance native projection of Croki Senses. It
  surfaces what agents are observing, attending to, connecting, and waiting for
  without requiring a founder or agent to author a board, nodes, edges, or
  release items.
- Croki Senses expose a hybrid Perception Frame with rendered pixels, semantic
  objects, relationships, provenance, confidence, affordances, and meaningful
  deltas. Models can refresh, focus, inspect, simulate, and wait rather than
  being restricted to a fixed Canvas schema.
- The read-only `sense_status`, `sense_observe`, `sense_inspect`, and
  `sense_wait` capabilities make model perception inspectable while leaving
  execution, tools, approvals, and authority native to the Thread. They return
  frames without emitting observation activities or feedback loops.
- Repository-owned project context remains durable truth, but Canvas never
  writes canon or turns a Perception Frame into memory. The previous Release,
  Context, and agent-authored Artifact mode descriptions are superseded
  compatibility notes for this pivot.
- Native provider behavior remains the default. Opening, closing, selecting, or
  arranging Canvas never changes provider behavior or grants authority.
- OpenClaw connects through ACP to a user-selected Gateway agent. Users bring
  their own configured agent; Croki does not provision or replace its workspace,
  memory, skills, model, tools, or delegation policy.
- Canvas, Croki Senses, provider-runtime, and OpenClaw boundaries are typed and
  covered by focused server, web, shared, and contract tests. Source activities
  remain Thread-native; Perception Frames are disposable projections.

## Verification

The release is checked with:

```sh
npm run release:croki:plan
npm run release:smoke
npm run check:croki
```

Focused Senses/Canvas tests cover each touched owner alongside the full release
workflow checks. The package manifests aligned by the release script are
`apps/server`, `apps/desktop`, `apps/web`, and `packages/contracts`, all at
`0.4.2`.

## Release gates

Destinations are independently gated. A GitHub-only Croki release is valid when
the ownership guard sees `CROKI_RELEASE_ENABLED=true`,
`CROKI_RELEASE_REPOSITORY=rhinehart514/croki`, and
`CROKI_RELEASE_BRANCH=croki/main`; it may publish unsigned desktop artifacts
through the default GitHub token. CLI, relay, web, signing, Discord, and mobile
destinations remain disabled until their specific flags and Croki-owned
credentials are configured.
