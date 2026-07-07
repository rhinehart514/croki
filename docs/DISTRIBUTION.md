# Distribution — how a stranger gets Drover today

_Honest, dated snapshot. Last updated 2026-07-07. Stage: alpha._

Short version: **there is no download link yet.** Drover ships as source you clone and
build yourself, or as an **unsigned, arm64-only macOS `.dmg` you build on your own machine.**
Turning that into a real, click-to-download product is a founder decision that needs an
Apple Developer identity and a hosting call — see "What real distribution still needs" below.

---

## What exists right now

| Path | Who it works for | State |
|------|------------------|-------|
| Clone the repo and run `npm start` | Anyone on macOS/Linux with Node + a `claude` CLI login | Works |
| Build the desktop app locally (`npm run app:dist`) | Apple-silicon (arm64) macOS only | Works, but the artifact is **unsigned** |
| Download a signed, notarized app | — | **Does not exist yet** |

Drover is not self-contained intelligence. The desktop app is a thin shell around a local
Node engine that **shells out to the founder's own `claude` CLI subscription** for the
operator. So any path below assumes the person already has `claude` and `git` on their PATH.
There is no bundled model and no API key to ship.

State lives in `~/.gtm-ide` and `~/.claude`, shared with the `npm start` dev server. (The
`~/.gtm-ide` path and other `gtm-ide` identifiers are the product's historical code name and
are intentionally kept — the app's display name is Drover.)

---

## Path A — run from source (works today, all-in-one)

```sh
git clone <repo> drover && cd drover
npm install          # installs root, brain/, and ui/ deps
npm start             # builds the UI, serves API + client on http://localhost:4317
```

Requirements: Node, `git`, and a working `claude` CLI login (the operator runtime needs it).
This is the surest way for a stranger to see Drover today — no packaging, no Gatekeeper.

## Path B — build the macOS desktop app locally (arm64 only)

```sh
npm install
npm run app:rebuild   # one-time: rebuild + ad-hoc-sign the native SQLite module for Electron's ABI
npm run app           # run it windowed (no .dmg), OR:
npm run app:dist      # build the unsigned .dmg into release/
```

The `.dmg` lands in `release/` as `Drover-0.3.1-arm64.dmg`. Because it is **unsigned**,
macOS Gatekeeper blocks the first launch: the user must **right-click the app and choose
Open** once to clear it. After that it launches normally.

`release/` is git-ignored — the binary is never committed. Each person builds their own.

> **Gotcha:** `app:dist` (via `app:rebuild`) rebuilds the native SQLite module against
> Electron's ABI. That breaks `npm test`, which runs under Node — the persistence-backend and
> migration tests fail to load the binding. After building a `.dmg`, restore the Node build with
> `npm --prefix brain rebuild better-sqlite3` before running the test suite.

---

## Branding and version, as they stand

- The packaged app is **Drover** end to end: app name, window title, menu-bar name, DMG
  volume, and DMG filename all read Drover. (`electron-builder.yml` `productName: Drover`,
  `ui/index.html` `<title>Drover</title>`.)
- Internal identifiers stay on the historical code name on purpose and are **not** branding
  bugs: the bundle id `com.gtmide.desktop`, the storage path `~/.gtm-ide`, and the npm
  package name `gtm-ide`. Do not "fix" these.
- Version is a coherent **0.3.1** across `package.json`, `package-lock.json`, `README.md`,
  and `docs/STATE.md`. Pre-1.0 by design.

## Auto-update: intentionally off

There is **no auto-updater**. The app bundles no `electron-updater` and runs no update
check on launch, and `electron-builder.yml` sets `publish: null` so the build emits **no
update manifest** (`latest-mac.yml`). This is deliberate: a local, unsigned build has
nowhere to update _from_, and a manifest that points nowhere is worse than none. When real
distribution exists, wiring an updater is part of that same decision (below).

---

## What real distribution still needs — founder-only actions

These are **outward, irreversible, or account-bound** steps that require the founder's Apple
identity and a hosting decision. They are intentionally _not_ done here.

### 1. Code signing + notarization (Apple)

Required so a downloaded app opens without the right-click-to-Open workaround, and so
Gatekeeper trusts it at all on other people's machines.

- **Apple Developer Program membership** — $99/year, and a **Developer ID Application**
  certificate created in that account.
- An **app-specific password** (or an App Store Connect API key) for the notarization
  service.
- Then `electron-builder.yml` changes from the current unsigned config
  (`mac.identity: null`) to signing + notarizing, roughly:

  ```yaml
  mac:
    identity: "Developer ID Application: <NAME> (<TEAMID>)"
    hardenedRuntime: true
    gatekeeperAssess: false
    notarize:
      teamId: "<TEAMID>"
  # credentials via env: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
  ```

  Note: the current `build/after-pack.cjs` ad-hoc-signs the whole bundle so the native
  SQLite binding survives Library Validation on an **unsigned** build. Under real Developer
  ID signing, that hook is replaced by proper signing of the binding, not ad-hoc `-s -`.

### 2. Hosting the download + updates

- Decide **where the `.dmg` lives** (a download page, GitHub Releases, S3/R2, etc.).
- If auto-update is wanted, add `electron-updater` to the app, set a `publish` provider in
  `electron-builder.yml` (which then emits `latest-mac.yml`), and host that manifest beside
  the artifact. Until then, `publish: null` stays and there is no updater.

### 3. Cross-platform (currently macOS arm64 only)

- The build targets **arm64 mac only** (`mac.target: dmg, arch: [arm64]`). Intel macs need
  an `x64` (or `universal`) arch; Windows and Linux need their own targets, icons, and —
  for signing — their own certificates.
- **Folder picker:** choosing a product folder uses macOS `osascript` (`choose folder`) in
  `brain/src/server.mjs`. On non-mac it already **degrades gracefully** — the endpoint
  returns `{ unsupported: true }` so the UI can fall back to a typed path — so this is a
  missing convenience on other platforms, not a hard break. A real Windows/Linux release
  would want a native picker there.

---

## Bottom line for the alpha bet

For getting Drover in front of a stranger _now_, **Path A (run from source)** is the honest
recommendation — it sidesteps signing and Gatekeeper entirely. The local `.dmg` is real and
useful for a mac the founder controls, but its unsigned status makes it a rough hand-off to
someone else until the Apple steps above are done.
