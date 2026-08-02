# Release ownership and enablement

Croki production releases are currently disabled. The repository can build and
test release artifacts, but it must not publish a CLI, desktop update, hosted
web app, relay, signed installer, or mobile build to inherited T3 destinations.

## 0.4.2 source candidate

The 0.4.2 source candidate aligns the four manifests updated by the release
workflow (`apps/server`, `apps/desktop`, `apps/web`, and `packages/contracts`).
It includes the Canvas and named-harness surface, Thread-native Coordination
Workstreams, and ACP support for connecting to any user-owned OpenClaw agent.
The candidate is not tagged or published. See the [0.4.2 release
notes](../project/release-notes-0.4.2.md) for the product summary.

## Current behavior

- `croki/main` receives full CI and Croki overlay checks.
- Pushes to `croki/main` build an unsigned Windows x64 installer artifact.
- Manual release dispatch defaults to a dry-run destination plan.
- Tagged, scheduled, relay, hosted web, signed desktop, and mobile production
  paths fail closed unless their Croki ownership gates are enabled and valid.
- The server package is still named `t3` and its metadata still points to the
  upstream T3 repository, so it is not eligible for Croki publication.

## Ownership guard

`scripts/croki-release-plan.ts` is the authoritative destination validator.
Run its non-publishing plan locally with:

```sh
npm run release:croki:plan
```

Production enablement requires `CROKI_RELEASE_ENABLED=true` and Croki-owned
values for the release repository and branch, CLI package, relay domain, web
router and channels, and Vercel project. Enabled signing, Discord, or mobile
destinations require their own complete Croki-prefixed configuration.

The guard rejects:

- the inherited `rhinehart514/croki` repository;
- release pushes to `main`;
- the inherited `t3` or `@croki/*` CLI packages;
- inherited `t3.codes` service destinations;
- the inherited T3 EAS project;
- incomplete signing, hosted web, relay, Discord, or mobile ownership.

Do not bypass the guard. Compatibility identifiers such as `CROKI_*`,
`croki://`, `.t3`, and the current server binary name remain in the codebase to
preserve installed state and wire compatibility; they are not release authority.

## Enablement order

1. Choose and configure the Croki release repository and release branch.
2. Rename and transfer the CLI package and repository metadata to Croki-owned
   destinations.
3. Configure Croki relay, hosted web domains, and Vercel ownership.
4. Configure desktop signing and any enabled mobile destinations.
5. Run the destination plan and release smoke checks.
6. Enable production release only after every requested destination reports
   `enabled` with no missing values or inherited targets.
7. Build a dry run, inspect every artifact, then test one controlled release.

## Local verification

```sh
npm run release:croki:plan
npm run release:smoke
npm run check:croki
```

The Windows artifact workflow is safe for local testing because it omits
inherited updater repository metadata. It should remain unsigned until Croki's
Windows signing identity is configured.
