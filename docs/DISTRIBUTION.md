# Distribution — how a founder gets Drover

**Honest snapshot:** 2026-07-20, alpha. [STATE.md](STATE.md) remains the authority for product proof.
This file covers delivery mechanics only.

There is no Developer ID-signed public download. The supported alpha paths are source on a desktop machine
and a freshly verified local arm64 macOS package. The package is ad-hoc signed for local use; it is not
notarized or suitable for an unattended public handoff.

## Current paths

| Path | State | Boundary |
|---|---|---|
| Run `npm run app` | Supported local alpha path | Builds local renderer assets and launches Electron with an in-process Brain and trusted IPC bridge |
| Run `npm start` | Same desktop path | Alias for `npm run app`; it does not start a web server |
| Build `npm run app:dist` | Verified local arm64 path | Produces an ad-hoc-signed local DMG and app bundle |
| Download a signed, notarized app | Does not exist | Requires founder-owned Apple identity and hosting decisions |

Drover is local software, not bundled intelligence. Founder-directed Product and go-to-market work needs
at least one connected runtime:

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

The root install is one npm workspace installation for the desktop host, Brain, and UI. The marketing
`site/` remains a separately installed Next.js application.

The desktop host builds the interface, loads it from local application files, runs the Brain in-process,
and injects a fresh founder capability below the renderer. Create a venture and bind its product
repository; no unlock ceremony is required. Normal and packaged launches bind no HTTP port. The browser
harness is test-only infrastructure and is not a supported product or development launch path.

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

The previously recorded package receipt predates the serverless desktop transport and is no longer current
proof. Rebuild and record a new hash after the readiness gate. Packaged acceptance must prove local renderer
loading, the trusted preload, IPC Brain health, and the absence of a published web-server runtime address.

The package has no Developer ID signature or notarization. Gatekeeper therefore requires the
founder to use the explicit one-time right-click **Open** path. `electron-builder.yml` sets
`publish: null`; no update manifest is emitted and the app performs no update check.
The local alpha carries Drover's own application icon but keeps its application files inspectable outside
ASAR. Hardened archive posture, signing, and notarization belong to the public-distribution pass.

The packaged display name is Drover. Compatibility identifiers stay unchanged: npm package
`gtm-ide`, bundle id `com.gtmide.desktop`, storage path `~/.gtm-ide`, and historical `channel`
records are intentional.

## Verification before a handoff

Run the product gates against the source tree first:

```sh
npm run test:acceptance
```

This reruns the repository's mechanical, token, deterministic browser, Electron, and disposable packaged-app
readiness gates. The exact
journey inventory must match `package.json` and the current `STATE.md`; legacy Now/Atlas/immersive journey
names are migration coverage, not product direction. It is not outside-founder or public-distribution proof.

For a desktop artifact, build from that same verified tree and retain the disposable packaged-app acceptance
receipt. Before handing an artifact to another machine, also bind a disposable repository, confirm a real
runtime, restart, and complete the Firm journey on that machine. Record the package version, architecture,
macOS version, runtime/auth mode, and resulting artifact hash; do not reuse the receipt after the tree changes.

## What public distribution still requires

These are founder-owned external actions and are not authorized by a documentation or build task:

1. Join or use an Apple Developer account and issue a Developer ID Application certificate.
2. Replace the local ad-hoc signing path with hardened-runtime signing and notarization.
3. Choose artifact hosting and, only if wanted, an update provider.
4. Run the signed package, Gatekeeper, clean-machine, upgrade, and rollback matrix.

Intel macOS, Windows, and Linux packages are not current product commitments. Adding one requires an
explicit product and distribution decision, native-path verification, and its own signing story.
