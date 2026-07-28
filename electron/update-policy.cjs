// Desktop installation safety policy. Production may discover a verified GitHub DMG and hand it to
// the founder's browser, but Croki cannot replace itself without a Developer ID-signed artifact.
// Any future automatic installer must enter through this coordinator: it may install at an
// already-quiescent boundary, or after explicit founder direction drains the existing desktop Brain.

const fs = require("node:fs");
const path = require("node:path");

const DISABLED_REASON = "Automatic installation is unavailable until Croki has a Developer ID-signed artifact.";

function boundedText(value, fallback = null) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 500) : fallback;
}

function exactReadiness(value = {}) {
  return {
    activeDrives: Math.max(0, Number(value.activeDrives) || 0),
    pendingRunLayers: Math.max(0, Number(value.pendingRunLayers) || 0),
    retainedStateRef: boundedText(value.retainedStateRef, "durable-work-journal"),
    detail: boundedText(value.detail, "Thread, Run, Review, and presentation state remain on disk."),
  };
}

function isQuiescent(readiness) {
  return readiness.activeDrives === 0 && readiness.pendingRunLayers === 0;
}

function writeReceipt(file, receipt) {
  if (!file) return receipt;
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const prior = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : { schemaVersion: 1, receipts: [] };
  const next = { schemaVersion: 1, receipts: [...prior.receipts.slice(-49), receipt] };
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  fs.chmodSync(target, 0o600);
  return receipt;
}

function currentUpdatePosture({
  packaged = false,
  supported = packaged,
  currentVersion = "0.0.0",
  lastCheckedAt = null,
} = {}) {
  return Object.freeze({
    mode: packaged ? "manual-download" : "source",
    channel: packaged ? "production" : "development",
    currentVersion,
    canCheck: Boolean(supported),
    automaticCheck: Boolean(supported),
    automaticInstall: false,
    configured: Boolean(supported),
    reason: packaged
      ? supported
        ? "Automatic installation is unavailable without a Developer ID; Croki opens the verified release download instead."
        : "This build has no supported Croki release channel."
      : "Development builds update from source and never contact the production release feed.",
    lastCheckedAt,
    requiresDeveloperIdForAutomaticInstall: true,
    requiresHttpsFeed: true,
    installBoundary: "durable-quiescence-or-explicit-founder-drain",
  });
}

function createUpdateCoordinator({
  enabled = false,
  receiptPath = null,
  inspectReadiness,
  reachSafeBoundary,
  install,
  now = () => new Date().toISOString(),
} = {}) {
  if (enabled && typeof inspectReadiness !== "function") throw new TypeError("An enabled updater needs inspectReadiness().");
  if (enabled && typeof reachSafeBoundary !== "function") throw new TypeError("An enabled updater needs reachSafeBoundary().");
  if (enabled && typeof install !== "function") throw new TypeError("An enabled updater needs install().");
  let available = null;

  function record(kind, fields = {}) {
    return writeReceipt(receiptPath, {
      kind,
      at: now(),
      update: available,
      ...fields,
    });
  }

  return Object.freeze({
    status() {
      return enabled
        ? {
            ...currentUpdatePosture({ packaged: true }),
            mode: "coordinated",
            automaticInstall: true,
            configured: true,
            reason: null,
          }
        : currentUpdatePosture();
    },
    prepare(update = {}) {
      if (!enabled) throw Object.assign(new Error(DISABLED_REASON), { code: "UPDATE_DISABLED" });
      if (update.signed !== true) throw Object.assign(new Error("Croki will not stage an unsigned update."), { code: "UPDATE_UNSIGNED" });
      const version = boundedText(update.version);
      const artifactSha256 = boundedText(update.artifactSha256);
      const feedUrl = boundedText(update.feedUrl);
      let parsedFeed = null;
      try { parsedFeed = new URL(feedUrl); } catch { /* invalid below */ }
      if (
        !version
        || !/^[0-9a-f]{64}$/i.test(artifactSha256 ?? "")
        || parsedFeed?.protocol !== "https:"
        || parsedFeed.username
        || parsedFeed.password
        || parsedFeed.search
        || parsedFeed.hash
      ) {
        throw Object.assign(new Error("A staged update needs an exact version, SHA-256, and HTTPS feed."), { code: "UPDATE_INVALID" });
      }
      available = {
        version,
        artifactSha256: artifactSha256.toLowerCase(),
        feedUrl: `${parsedFeed.origin}${parsedFeed.pathname}`,
        signed: true,
      };
      return record("update-staged");
    },
    async install({ founderConfirmed = false } = {}) {
      if (!enabled) throw Object.assign(new Error(DISABLED_REASON), { code: "UPDATE_DISABLED" });
      if (!available) throw Object.assign(new Error("No verified update is staged."), { code: "UPDATE_MISSING" });
      let readiness = exactReadiness(await inspectReadiness());
      if (!isQuiescent(readiness) && !founderConfirmed) {
        return record("update-deferred", {
          outcome: "waiting-for-safe-boundary",
          readiness,
          retainedState: readiness.detail,
        });
      }
      if (!isQuiescent(readiness)) {
        const boundary = await reachSafeBoundary();
        readiness = exactReadiness(await inspectReadiness());
        if (!isQuiescent(readiness)) {
          return record("update-blocked", {
            outcome: "safe-boundary-not-reached",
            boundary,
            readiness,
            retainedState: readiness.detail,
          });
        }
        record("update-boundary-reached", {
          outcome: "founder-directed-drain",
          boundary,
          readiness,
          retainedState: readiness.detail,
        });
      }
      const ready = record("update-install-ready", {
        outcome: "quiescent",
        readiness,
        retainedState: readiness.detail,
      });
      await install({ update: available, receipt: ready });
      return record("update-install-started", {
        outcome: "installer-invoked-after-receipt",
        readiness,
        retainedState: readiness.detail,
      });
    },
  });
}

module.exports = {
  DISABLED_REASON,
  createUpdateCoordinator,
  currentUpdatePosture,
  exactReadiness,
  isQuiescent,
};
