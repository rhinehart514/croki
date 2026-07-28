// Production release discovery without automatic installation. Croki's current macOS package is
// ad-hoc signed, so Electron's autoUpdater cannot safely replace it. This checker reads one fixed
// public GitHub release endpoint, validates the exact arm64 DMG and SHA-256, and hands the founder
// to the browser. Development builds never make the request.

const fs = require("node:fs");
const path = require("node:path");

const RELEASE_API_URL = "https://api.github.com/repos/rhinehart514/drover/releases/latest";
const RELEASE_DOWNLOAD_PREFIX = "/rhinehart514/drover/releases/download/";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const MAX_RESPONSE_BYTES = 1_000_000;

function versionParts(value) {
  const match = String(value ?? "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) throw new Error("Croki update versions must use X.Y.Z.");
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function safeDownloadUrl(value, tag, assetName) {
  const url = new URL(String(value ?? ""));
  const expectedPath = `${RELEASE_DOWNLOAD_PREFIX}${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
  if (
    url.protocol !== "https:"
    || url.hostname !== "github.com"
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== expectedPath
  ) {
    throw new Error("The Croki release points to an unexpected download.");
  }
  return url.toString();
}

function parseRelease(value, { arch = "arm64" } = {}) {
  if (!value || typeof value !== "object") throw new Error("GitHub returned an invalid Croki release.");
  if (value.draft === true || value.prerelease === true) throw new Error("The latest Croki release is not production-ready.");
  const tag = String(value.tag_name ?? "").trim();
  const parts = versionParts(tag);
  if (!parts) throw new Error("The latest Croki release has an invalid version.");
  const version = parts.join(".");
  const assetName = `Croki-${version}-${arch}.dmg`;
  const asset = Array.isArray(value.assets)
    ? value.assets.find((entry) => entry?.name === assetName && entry?.state === "uploaded")
    : null;
  if (!asset) throw new Error(`The latest Croki release has no ${arch} DMG.`);
  const digest = String(asset.digest ?? "").trim().toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error("The latest Croki DMG has no valid SHA-256 digest.");
  }
  return {
    version,
    tag,
    assetName,
    artifactSha256: digest.slice("sha256:".length),
    downloadUrl: safeDownloadUrl(asset.browser_download_url, tag, assetName),
  };
}

function readState(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function writeState(file, value) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function createUpdateChecker({
  packaged = false,
  platform = process.platform,
  arch = process.arch,
  currentVersion,
  statePath = null,
  fetchImpl = globalThis.fetch,
  openExternal = async () => {},
  showMessage = async () => ({ response: 1 }),
  now = () => Date.now(),
  automaticCheck = true,
} = {}) {
  const supported = packaged && platform === "darwin" && arch === "arm64";
  let state = readState(statePath);
  let pending = null;

  function status() {
    return {
      mode: packaged ? "manual-download" : "source",
      channel: packaged ? "production" : "development",
      currentVersion: String(currentVersion ?? "0.0.0"),
      canCheck: supported,
      automaticCheck: supported && automaticCheck,
      automaticInstall: false,
      configured: supported,
      reason: packaged
        ? supported
          ? "Automatic installation is unavailable without a Developer ID; Croki opens the verified release download instead."
          : "This build has no supported Croki release channel."
        : "Development builds update from source and never contact the production release feed.",
      lastCheckedAt: typeof state.lastCheckedAt === "string" ? state.lastCheckedAt : null,
      requiresDeveloperIdForAutomaticInstall: true,
      requiresHttpsFeed: true,
      installBoundary: "durable-quiescence-or-explicit-founder-drain",
    };
  }

  async function run({ interactive }) {
    if (!supported) return { ...status(), state: "unavailable" };
    const checkedAt = new Date(now()).toISOString();
    let response;
    try {
      response = await fetchImpl(RELEASE_API_URL, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `Croki/${currentVersion}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!response?.ok) throw new Error(`GitHub release check failed (${response?.status ?? "no response"}).`);
      const raw = await response.text();
      if (raw.length > MAX_RESPONSE_BYTES) throw new Error("GitHub returned an oversized Croki release.");
      const release = parseRelease(JSON.parse(raw), { arch });
      state = { ...state, lastCheckedAt: checkedAt, latestVersion: release.version };
      writeState(statePath, state);
      if (compareVersions(release.version, currentVersion) <= 0) {
        if (interactive) {
          await showMessage({
            type: "info",
            title: "Croki is up to date",
            message: `Croki ${currentVersion} is the newest production release.`,
            buttons: ["OK"],
          });
        }
        return { ...status(), state: "current", latestVersion: release.version };
      }

      if (!interactive && state.notifiedVersion === release.version) {
        return { ...status(), state: "available", latestVersion: release.version };
      }
      const choice = await showMessage({
        type: "info",
        title: "A Croki update is available",
        message: `Croki ${release.version} is ready to download.`,
        detail: `This build cannot install itself without a Developer ID. Download the DMG, replace Croki in Applications, then use the one-time right-click Open path.\n\nSHA-256: ${release.artifactSha256}`,
        buttons: ["Open download", "Later"],
        defaultId: 0,
        cancelId: 1,
      });
      state = { ...state, notifiedVersion: release.version };
      writeState(statePath, state);
      if (choice?.response === 0) await openExternal(release.downloadUrl);
      return {
        ...status(),
        state: "available",
        latestVersion: release.version,
        downloadOpened: choice?.response === 0,
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      state = { ...state, lastCheckedAt: checkedAt };
      writeState(statePath, state);
      if (interactive) {
        await showMessage({
          type: "error",
          title: "Croki couldn’t check for updates",
          message,
          detail: "Your current app and work are unchanged.",
          buttons: ["OK"],
        });
      }
      return { ...status(), state: "error", error: message };
    }
  }

  function check({ interactive = true, force = interactive } = {}) {
    if (!supported) return Promise.resolve({ ...status(), state: "unavailable" });
    const lastChecked = Date.parse(String(state.lastCheckedAt ?? ""));
    if (!force && Number.isFinite(lastChecked) && now() - lastChecked < CHECK_INTERVAL_MS) {
      return Promise.resolve({ ...status(), state: "skipped" });
    }
    if (!pending) pending = run({ interactive }).finally(() => { pending = null; });
    return pending;
  }

  return Object.freeze({ check, status });
}

module.exports = {
  CHECK_INTERVAL_MS,
  RELEASE_API_URL,
  compareVersions,
  createUpdateChecker,
  parseRelease,
};
