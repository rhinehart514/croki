# Distribution — how a founder gets Drover

**Honest snapshot:** 2026-07-15, alpha. [STATE.md](STATE.md) remains the authority for product proof.
This file covers delivery mechanics only.

There is no signed public download. The supported alpha path is source on a desktop machine. A local
arm64 macOS package can be built from the repository, but the current Firm tree has no freshly
verified package receipt; the existing artifact under `release/` predates the current package
version and does not count as one.

## Current paths

| Path | State | Boundary |
|---|---|---|
| Run `npm run app` | Supported local alpha path | Builds the UI, starts the loopback brain, and hosts founder authority below the renderer |
| Run `npm start` | Read-only browser diagnostics by default | Requires Node and npm; an explicit loopback-only development hatch exists but is not a distribution authority |
| Build `npm run app:dist` | Configured for arm64 macOS | Produces an unsigned, ad-hoc-signed local DMG; reverify before handoff |
| Download a signed, notarized app | Does not exist | Requires founder-owned Apple identity and hosting decisions |

Drover is local software, not bundled intelligence. Real teammate work needs at least one connected
runtime:

- Claude Code through the bundled Agent SDK, using an existing Claude Code login or configured
  Anthropic credential; or
- the `codex` CLI on `PATH` with `codex login status` succeeding.

Runtime credentials remain provider-owned. Drover records the runtime and authentication mode, never
the credential. Durable product state lives under the intentional historical `~/.gtm-ide` path.

## Source path

```sh
git clone <repo> drover
cd drover
npm install
npm run app
```

The desktop host builds the interface, starts the brain plus client on loopback, and injects a fresh
founder capability below the renderer. Create a venture and bind its product repository; no unlock
ceremony is required. `npm start` serves the same shell for read-only diagnostics, but founder writes
remain unavailable because a standalone browser is not a trusted host.

For local source development only, `DROVER_DEV_FOUNDER=1 npm start` makes the loopback browser
writable without minting agent authority. The hatch is off by default, accepts only same-origin
non-agent requests received from a loopback socket, and does not change the supported Electron or
packaged-app security model.

The product target is desktop only. Running the source server on another operating system does not
create a phone, tablet, or cross-platform packaging commitment.

## Local macOS app

```sh
npm install
npm run app
# or
npm run app:dist
```

`app:dist` targets Apple-silicon macOS and writes a versioned `Drover-<version>-arm64.dmg` under
`release/`. `release/` is ignored and must never be treated as proof for a different package version
or source tree.

The package has no Developer ID signature or notarization. Gatekeeper therefore requires the
founder to use the explicit one-time right-click **Open** path. `electron-builder.yml` sets
`publish: null`; no update manifest is emitted and the app performs no update check.

The packaged display name is Drover. Compatibility identifiers stay unchanged: npm package
`gtm-ide`, bundle id `com.gtmide.desktop`, storage path `~/.gtm-ide`, and historical `channel`
records are intentional.

## Verification before a handoff

Run the product gates against the source tree first:

```sh
npm run test:acceptance
```

This reruns the mechanical suite, design-token parity, four preserved operating journeys, and three
Living Venture Atlas journeys. It is the source-tree readiness receipt, not a packaged-app or
outside-founder proof.

For a desktop artifact, build from that same verified tree, launch the packaged app, bind a disposable
repository, confirm runtime readiness, restart, and complete the deterministic Firm journey. Record
the package version, architecture, macOS version, runtime/auth mode, and resulting artifact hash.
Do not update [STATE.md](STATE.md) with packaging proof until that receipt exists.

## What public distribution still requires

These are founder-owned external actions and are not authorized by a documentation or build task:

1. Join or use an Apple Developer account and issue a Developer ID Application certificate.
2. Replace the local ad-hoc signing path with hardened-runtime signing and notarization.
3. Choose artifact hosting and, only if wanted, an update provider.
4. Run the signed package, Gatekeeper, clean-machine, upgrade, and rollback matrix.

Intel macOS, Windows, and Linux packages are not current product commitments. Adding one requires an
explicit product and distribution decision, native-path verification, and its own signing story.
