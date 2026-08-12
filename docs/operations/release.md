# Release ownership and enablement

Croki production releases are disabled by default. Destinations are opt-in,
and every enabled destination fails closed unless its Croki-owned configuration
is complete. Hosted web and production mobile clients additionally require
exact-version `croki-server` publication in the same release. A GitHub-only
desktop release instead updates its bundled, desktop-managed server and compiles
package-backed remote server updates out of the client.

## 0.4.3 source candidate

The 0.4.3 source candidate aligns the four manifests updated by the release
workflow (`apps/server`, `apps/desktop`, `apps/web`, and `packages/contracts`).
It compresses Croki Senses into a bounded working-understanding Canvas while
preserving complete model-facing Perception Frames. See the [0.4.3 release
notes](../project/release-notes-0.4.3.md) for the product summary.

## Current behavior

- `croki/main` receives full CI and Croki overlay checks.
- Pushes to `croki/main` build an unsigned Windows x64 installer artifact.
- Manual release dispatch defaults to a dry-run destination plan.
- Tagged and scheduled GitHub release paths can be enabled with
  `CROKI_RELEASE_ENABLED=true`, `CROKI_RELEASE_REPOSITORY=rhinehart514/croki`,
  and `CROKI_RELEASE_BRANCH=croki/main`. Relay, CLI, web, signing, Discord, and
  mobile paths remain skipped unless their own enable flags and configuration
  validate.
- The local server package is `croki-server` and its metadata points at the
  Croki repository. Set `CROKI_CLI_PUBLISH_ENABLED=true` and
  `CROKI_CLI_PACKAGE=croki-server` only for a release that should publish it to
  npm.

## Ownership guard

`scripts/croki-release-plan.ts` is the authoritative destination validator.
Run its non-publishing plan locally with:

```sh
npm run release:croki:plan
```

Production enablement requires a destination flag and only the Croki-owned
values needed by that destination. Use `CROKI_RELEASE_ENABLED` for GitHub,
`CROKI_CLI_PUBLISH_ENABLED` for npm, `CROKI_RELAY_DEPLOY_ENABLED` for relay,
`CROKI_WEB_DEPLOY_ENABLED` for hosted web, `CROKI_SIGNING_ENABLED` for signed
desktop artifacts, `CROKI_DISCORD_RELEASE_ENABLED` for announcements, and the
existing mobile flags for EAS. The release plan reports each destination
independently.

The guard rejects:

- the inherited `pingdotgg/t3code` repository;
- release pushes to `main`;
- the inherited `t3` or `@croki/*` CLI package;
- inherited `t3.codes` service destinations;
- the inherited T3 EAS project;
- incomplete signing, hosted web, relay, Discord, or mobile ownership.

Do not bypass the guard. Compatibility identifiers such as `CROKI_*`,
`croki://`, `.t3`, and the current server binary name remain in the codebase to
preserve installed state and wire compatibility; they are not release authority.

## Enablement order

1. Configure the Croki GitHub repository and `croki/main` release branch.
2. Enable the GitHub destination and run its dry run; inspect every artifact.
3. Enable CLI, relay, web, signing, Discord, or mobile only after each
   destination has complete Croki-owned credentials and a passing plan.
4. Run the destination plan and release smoke checks after every enablement.
5. Test one controlled release before enabling additional destinations.

## Local verification

```sh
npm run release:croki:plan
npm run release:smoke
npm run check:croki
```

## Exact-version update invariant

When package-backed server updates are available, Croki clients ask an older
server to install the client's exact version. A client never asks a newer server
to roll back; the client must update through its own distribution path instead.
The release plan therefore rejects hosted web and production mobile publication
unless `croki-server` publication is enabled. The GitHub release job accepts a
skipped CLI job only when npm publication was not requested; it never accepts a
requested-but-failed CLI publish.

In a GitHub-only desktop build, the desktop app owns updates for its bundled
local server. Package-backed update actions for remote, boot-service, respawned,
or manually managed servers are compiled out, so the client may describe an
older server but must not offer an impossible npm command. Enable CLI publication
when a release must support those remote update paths.

GitHub Release publication uses the repository-scoped workflow token so shared
Release App API limits cannot strand artifact upload. The Croki Release App
credentials remain reserved for the stable finalize job that writes aligned
versions back to `croki/main`.

The Windows artifact workflow is safe for local testing because it omits
inherited updater repository metadata. It should remain unsigned until Croki's
Windows signing identity is configured.
