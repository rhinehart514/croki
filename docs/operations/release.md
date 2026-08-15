# Release ownership and enablement

Croki production releases are disabled by default. Destinations are opt-in,
and every enabled destination fails closed unless its Croki-owned configuration
is complete. Hosted web and production mobile clients additionally require
exact-version `croki-server` publication in the same release. A GitHub-only
desktop release instead updates its bundled, desktop-managed server and compiles
package-backed remote server updates out of the client.

## 0.4.13 source candidate

The 0.4.13 source candidate aligns the four manifests updated by the release
workflow (`apps/server`, `apps/desktop`, `apps/web`, and `packages/contracts`).
It syncs Croki through T3 Code `e321667b` while preserving Croki's provider
boundary, migration history, branding, and destination ownership, and restores
the Croki sidebar mark after the upstream sync. See the
[0.4.13 release notes](../project/release-notes-0.4.13.md) for the product summary.

## Current behavior

- `croki/main` receives full CI and Croki overlay checks.
- Pushes to `croki/main` build an unsigned Windows x64 installer artifact.
- Manual release dispatch defaults to a dry-run destination plan.
- Tagged and manually dispatched GitHub release paths can be enabled with
  `CROKI_RELEASE_ENABLED=true`, `CROKI_RELEASE_REPOSITORY=rhinehart514/croki`,
  and `CROKI_RELEASE_BRANCH=croki/main`. Relay, CLI, web, signing, Discord, and
  mobile paths remain skipped unless their own enable flags and configuration
  validate.
- Nightly macOS arm64 releases run on the Mac Studio at 02:15 local time through
  `com.croki.nightly-release`. The local publisher checks `croki/main` against
  the source commit recorded on the latest nightly, validates and builds an
  isolated checkout from the private `rhinehart514/croki` repository, then
  uploads the DMG and updater metadata to the public binary-only
  `rhinehart514/croki-releases` repository. That public repository lets the
  packaged app fetch updates without a GitHub token. The publisher does not use
  GitHub-hosted runners or Actions artifact storage.
- Packaged desktop clients map the **Stable** track to `rhinehart514/croki`
  and **Nightly** to `rhinehart514/croki-releases` before each update check.
  This keeps the public nightly feed token-free while allowing either build to
  change tracks and download the selected update inside Croki.
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

## Zero-cost nightly publisher

Install or refresh the per-user macOS schedule with:

```sh
npm run release:nightly:install
```

Test prerequisites and change detection without building or publishing:

```sh
CROKI_NIGHTLY_DRY_RUN=true npm run release:nightly:local
```

The publisher requires an Apple Silicon Mac, the repository's pinned Node and
Vite+ tools, Rust, and an authenticated GitHub CLI. It creates its mirror and
temporary worktrees under `~/Library/Application Support/Croki Nightly Release`
and writes launch logs under `~/Library/Logs/Croki`. Override the private source
with `CROKI_NIGHTLY_SOURCE_REPOSITORY` or the public updater destination with
`CROKI_NIGHTLY_UPDATE_REPOSITORY`; their defaults are `rhinehart514/croki` and
`rhinehart514/croki-releases` respectively.

The publisher prefers Node 24 from Homebrew and accepts a user-installed Vite+
binary from its native or pnpm location, or the repository's locked
`node_modules/.bin/vp`. It fails before
fetching or building when Node does not satisfy Croki's `^24.13.1` runtime.
The isolated checkout installs and validates only the desktop artifact's
workspace dependency closure (desktop, bundled server, bundled web client, and
their shared packages), plus the repository lint plugin used by the release
gate, rather than pulling unrelated mobile and hosted-service dependencies onto
the release Mac.

This zero-cost path intentionally produces an unsigned/ad-hoc macOS build.
Users must approve its first launch in macOS. Developer ID signing,
notarization, and the equivalent silent updater experience require Apple-owned
credentials and are not claimed by this publisher. Stable cross-platform
releases remain available through the manually dispatched GitHub workflow.

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
