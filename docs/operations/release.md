# Release ownership and enablement

Croki production releases are disabled by default. Destinations are opt-in,
and every enabled destination fails closed unless its Croki-owned configuration
is complete. Hosted web and production mobile clients additionally require
exact-version `croki-server` publication in the same release. A GitHub-only
desktop release instead updates its bundled, desktop-managed server and compiles
package-backed remote server updates out of the client.

## 0.4.14 source candidate

The 0.4.14 source candidate aligns the four manifests updated by the release
workflow (`apps/server`, `apps/desktop`, `apps/web`, and `packages/contracts`).
It rebuilds Croki on T3 Code `be7d35aa` while preserving Croki's provider
boundary, installed-state history, branding, and destination ownership. See the
[0.4.14 release notes](../project/release-notes-0.4.14.md) for the product summary.

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
The external Vite+ binary only bootstraps the filtered dependency install; all
validation, tests, and builds then use the isolated checkout's locked Vite+
binary so the runner and imported test APIs share one Vitest runtime.
The isolated checkout installs and typechecks only the desktop artifact's
workspace dependency closure (desktop, bundled server, bundled web client, and
their shared packages), plus the repository lint plugin used by the release
gate, rather than pulling unrelated mobile and hosted-service dependencies onto
the release Mac. A single test runner then executes the release-critical
desktop updater, updater UI, artifact, manifest, and nightly-version suites,
followed by the release smoke guards. Keeping those tests in one runner avoids
nested test-runner conflicts in an isolated filtered workspace.

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

## Desktop auto-update notes

- Updater runtime: `apps/desktop/src/updates/DesktopUpdates.ts`.
- `electron-updater` adapter: `apps/desktop/src/electron/ElectronUpdater.ts`.
- `apps/desktop/src/main.ts` only wires the updater layers into the desktop runtime.
- Update UX:
  - Background checks run on startup delay + interval.
  - No automatic download or install.
  - The desktop UI shows a rocket update button when an update is available; click once to download, click again after download to restart/install.
- Provider: GitHub Releases (`provider: github`) configured at build time.
- Repository slug source:
  - `T3CODE_DESKTOP_UPDATE_REPOSITORY` (format `owner/repo`), if set.
  - otherwise `GITHUB_REPOSITORY` from GitHub Actions.
- Required release assets for updater:
  - platform installers (`.exe`, `.dmg`, `.AppImage`, plus macOS `.zip` for Squirrel.Mac update payloads)
  - channel metadata: `latest*.yml` for stable releases, `nightly*.yml` for nightly releases
  - `*.blockmap` files (used for differential downloads)
- macOS metadata note:
  - `electron-updater` reads `latest-mac.yml` on stable and `nightly-mac.yml` on nightly, for both Intel and Apple Silicon.
  - The workflow merges the per-arch mac manifests into one channel-specific mac manifest before publishing the GitHub Release.

### Windows payload topology and update validation

Windows packages the bundled server and only its runtime-external/native
dependency closure in `resources/server.asar`. Native modules and helper
executables declared as unpacked by that archive must be present at the matching
paths below `resources/server.asar.unpacked`. The Windows-native backend reads
the archive in place through Electron. WSL cannot read ASAR files, so enabling
the WSL backend extracts the server tree once into the desktop state directory
under `wsl-server-tree/<version>` and reuses the completed version until the app
is updated.

The artifact builder rejects a Windows package when any of these invariants
break:

- `resources/server.asar` is absent or does not contain the server entry.
- Any file marked unpacked in the ASAR header is absent from
  `resources/server.asar.unpacked`.
- On same-architecture Windows builds, the packaged primary cannot load the fff
  native library from inside `server.asar` through its `.unpacked` sibling.
- The isolated, extracted sidecar cannot load the server entry with plain Node.
- The external Windows resource monitor is absent.
- The unpacked Windows application contains more than 80 files.

Cross-architecture Windows builds retain every structural and extracted-sidecar
check, but skip executing the target Electron binary. A same-architecture build
for each release target must exercise the primary native-load probe.

NSIS differential packaging remains enabled. A sidecar layout transition can
produce a larger one-time download; subsequent small releases retain their
blockmaps, with a 60 MB maximum for a representative sidecar-to-sidecar update.

## 0) npm OIDC trusted publishing setup (CLI)

The workflow invokes `node apps/server/scripts/cli.ts publish` after aligning package versions. That
script temporarily prepares the `t3` package, then runs `vp pm publish --filter t3 ...` from the
repository root so workspace publish configuration is applied correctly.

Checklist:

1. Confirm npm org/user owns package `t3` (or rename package first if needed).
2. In npm package settings, configure Trusted Publisher:
   - Provider: GitHub Actions
   - Repository: this repo
   - Workflow file: `.github/workflows/release.yml`
   - Environment (if used): match your npm trusted publishing config
3. Ensure npm account and org policies allow trusted publishing for the package.
4. Create release tag `vX.Y.Z` and push; workflow will:
   - align the release package versions to `X.Y.Z`
   - build web + server
   - invoke the CLI publish script with npm dist-tag `latest`
5. Nightly runs invoke the same publish script with npm dist-tag `nightly`.

## 1) Release validation and unsigned builds

There is no dry-run tag path. Pushing any accepted non-nightly tag, including
`v0.0.0-test.1`, classifies the run as the stable channel. It publishes `t3` with npm dist-tag
`latest`, creates a real GitHub Release, aliases the hosted app to `latest.app.t3.codes` and
`app.t3.codes`, and can commit a version bump to `main` in the finalize job. Do not push a test tag
to validate the workflow.

The workflow has no non-publishing `workflow_dispatch` mode. Use normal CI or local quality gates to
validate checks and builds without shipping. To exercise the complete release graph at lower stable
risk, manually dispatch `channel=nightly`; this still publishes a real nightly npm package, GitHub
prerelease, desktop updater release, and hosted nightly alias, but it does not update stable aliases or
commit a version bump to `main`. Only run it when a real nightly release is acceptable.

Manual `channel=stable` with a version input is also a real stable-channel release. Omitting signing
secrets only makes platform artifacts unsigned; it does not prevent publication.

## 2) Apple signing + notarization setup (macOS)

Required secrets used by the workflow:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `MACOS_PROVISIONING_PROFILE` (base64-encoded provisioning profile with Associated Domains)

Required repository variables:

- `APPLE_TEAM_ID`

Optional repository variables:

- `CLERK_PASSKEY_RP_DOMAINS`: comma-separated RP-domain override. By default, the build derives the
  domain from the production Clerk publishable key.

Checklist:

1. Apple Developer account access:
   - Team has rights to create Developer ID certificates.
2. Create an explicit App ID for `com.t3tools.t3code` and enable Associated Domains.
3. Create a `Developer ID Application` certificate and a compatible provisioning profile for that
   App ID with Associated Domains enabled.
4. Export the certificate + private key as `.p12` from Keychain.
5. Base64-encode the `.p12` and store as `CSC_LINK`.
6. Base64-encode the provisioning profile and store it as `MACOS_PROVISIONING_PROFILE`.
7. Store the `.p12` export password as `CSC_KEY_PASSWORD`, and set `APPLE_TEAM_ID` to the
   10-character Apple Developer Team ID.
8. In App Store Connect, create an API key (Team key).
9. Add API key values:
   - `APPLE_API_KEY`: contents of the downloaded `.p8`
   - `APPLE_API_KEY_ID`: Key ID
   - `APPLE_API_ISSUER`: Issuer ID
10. Complete the Clerk Native API and AASA setup in [T3 Connect Clerk Setup](../internals/t3-connect.md#desktop-passkeys).
11. Re-run a tag release and confirm macOS artifacts are signed/notarized and contain the expected
    `com.apple.developer.associated-domains` entitlement.

Notes:

- `APPLE_API_KEY` is stored as raw key text in secrets.
- The workflow writes it to a temporary `AuthKey_<id>.p8` file at runtime.
- The workflow decodes `MACOS_PROVISIONING_PROFILE`, validates it with `security cms`, and passes it
  to the desktop packager.

## 3) Azure Trusted Signing setup (Windows)

Required secrets used by the workflow:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_TRUSTED_SIGNING_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`
- `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`

Checklist:

1. Create Azure Trusted Signing account and certificate profile.
2. Record ATS values:
   - Endpoint
   - Account name
   - Certificate profile name
   - Publisher name
3. Create/choose an Entra app registration (service principal).
4. Grant service principal permissions required by Trusted Signing.
5. Create a client secret for the service principal.
6. Add Azure secrets listed above in GitHub Actions secrets.
7. Re-run a tag release and confirm Windows installer is signed.

## 4) Ongoing release checklist

1. Ensure `main` is green in CI.
2. Bump app version as needed.
3. Create release tag: `vX.Y.Z`.
4. Push tag.
5. Verify workflow steps:
   - preflight passes
   - all matrix builds pass
   - `publish_cli` publishes the exact release version before the release job
   - release job uploads expected files
6. Smoke test downloaded artifacts.

## 5) Troubleshooting

- macOS build unsigned when expected signed:
  - Check all Apple secrets plus `APPLE_TEAM_ID` are populated and non-empty.
  - Confirm the provisioning profile belongs to `APPLE_TEAM_ID.com.t3tools.t3code` and includes
    Associated Domains.
- Windows build unsigned when expected signed:
  - Check all Azure ATS and auth secrets are populated and non-empty.
- Build fails with signing error:
  - Retry with secrets removed to confirm unsigned path still works.
  - Re-check certificate/profile names and tenant/client credentials.
