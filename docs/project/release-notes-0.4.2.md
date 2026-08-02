# Croki 0.4.2 release notes

Status: source release candidate. The candidate is prepared in the working
tree but has not been committed, tagged, or published.

## Highlights

- Canvas now opens on the project-owned 0.4.2 release candidate. Proposed,
  working, candidate, blocked, verified, and deferred work is visible beside
  every Thread, with native source-Thread links, explicit acceptance criteria,
  portable evidence, and enforced verification gates.
- The active release is loaded fresh with founder-approved context before every
  provider turn. Large candidates are summarized, malformed release data does
  not suppress valid canon, and content-free receipts expose the version and
  active-item count.
- Project Context remains available as a secondary Canvas view. Product and GTM
  harnesses can create bounded immutable visual artifacts when spatial
  reasoning helps, but artifacts never become release state, canon, execution,
  or provider behavior.
- Native provider behavior is the default. Product and GTM are explicit,
  visible, one-turn harnesses that reset after a successful send.
- Delegated runtime activity is projected as Thread-native Coordination
  Workstreams with actor, ownership, progress, and evidence metadata. Workstreams
  do not create another execution engine or turn Canvas into a coordination
  dashboard.
- OpenClaw connects through ACP to a user-selected Gateway agent. Users bring
  their own configured agent; Croki does not provision or replace its
  workspace, memory, skills, model, tools, or delegation policy.
- Canvas, harness, provider-runtime, and OpenClaw activity contracts are typed,
  persisted with the Thread, and covered by focused server, web, shared, and
  contract tests.

## Verification

The source candidate is checked with:

```sh
npm run release:croki:plan
npm run release:smoke
npm run check:croki
```

Run focused tests for each touched owner and the full release workflow checks
before tagging. The package manifests aligned by the release script are
`apps/server`, `apps/desktop`, `apps/web`, and `packages/contracts`, all at
`0.4.2`.

## Release gates

Publishing remains disabled until Croki-owned repository, branch, CLI,
relay/web destinations, signing credentials, and any requested mobile
destinations are configured and the ownership guard reports every requested
destination as enabled. No GitHub variables or secrets are assumed by this
candidate.
