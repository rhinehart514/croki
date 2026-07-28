const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  CHECK_INTERVAL_MS,
  RELEASE_API_URL,
  compareVersions,
  createUpdateChecker,
  parseRelease,
} = require("./update-check.cjs");

function release(version = "0.3.5", extra = {}) {
  const tag = `v${version}`;
  const name = `Croki-${version}-arm64.dmg`;
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [{
      name,
      state: "uploaded",
      digest: `sha256:${"a".repeat(64)}`,
      browser_download_url: `https://github.com/rhinehart514/drover/releases/download/${tag}/${name}`,
    }],
    ...extra,
  };
}

function response(value, { ok = true, status = 200 } = {}) {
  return { ok, status, text: async () => JSON.stringify(value) };
}

test("semantic release versions compare without lexical mistakes", () => {
  assert.equal(compareVersions("0.3.10", "0.3.9"), 1);
  assert.equal(compareVersions("v0.4.0", "0.4.0"), 0);
  assert.equal(compareVersions("0.2.9", "0.3.0"), -1);
  assert.throws(() => compareVersions("latest", "0.3.4"));
});

test("release parsing requires the exact production DMG, digest, and GitHub destination", () => {
  assert.deepEqual(parseRelease(release()), {
    version: "0.3.5",
    tag: "v0.3.5",
    assetName: "Croki-0.3.5-arm64.dmg",
    artifactSha256: "a".repeat(64),
    downloadUrl: "https://github.com/rhinehart514/drover/releases/download/v0.3.5/Croki-0.3.5-arm64.dmg",
  });
  assert.throws(() => parseRelease(release("0.3.5", { prerelease: true })));
  assert.throws(() => parseRelease(release("0.3.5", { assets: [] })));
  assert.throws(() => parseRelease(release("0.3.5", {
    assets: [{ ...release().assets[0], digest: null }],
  })));
  assert.throws(() => parseRelease(release("0.3.5", {
    assets: [{ ...release().assets[0], browser_download_url: "https://evil.example/Croki.dmg" }],
  })));
});

test("development builds stay source-only and never contact production releases", async () => {
  let requests = 0;
  const checker = createUpdateChecker({
    packaged: false,
    currentVersion: "0.3.4",
    fetchImpl: async () => { requests += 1; },
  });
  assert.deepEqual(checker.status(), {
    mode: "source",
    channel: "development",
    currentVersion: "0.3.4",
    canCheck: false,
    automaticCheck: false,
    automaticInstall: false,
    configured: false,
    reason: "Development builds update from source and never contact the production release feed.",
    lastCheckedAt: null,
    requiresDeveloperIdForAutomaticInstall: true,
    requiresHttpsFeed: true,
    installBoundary: "durable-quiescence-or-explicit-founder-drain",
  });
  assert.equal((await checker.check()).state, "unavailable");
  assert.equal(requests, 0);
});

test("production checks the fixed endpoint and opens only a newer validated DMG", async () => {
  const requests = [];
  const messages = [];
  const opened = [];
  const checker = createUpdateChecker({
    packaged: true,
    platform: "darwin",
    arch: "arm64",
    currentVersion: "0.3.4",
    fetchImpl: async (url, options) => {
      requests.push([url, options]);
      return response(release());
    },
    showMessage: async (message) => {
      messages.push(message);
      return { response: 0 };
    },
    openExternal: async (url) => { opened.push(url); },
    now: () => Date.parse("2026-07-27T18:00:00.000Z"),
  });
  const result = await checker.check();
  assert.equal(result.state, "available");
  assert.equal(result.downloadOpened, true);
  assert.equal(requests[0][0], RELEASE_API_URL);
  assert.equal(requests[0][1].headers["User-Agent"], "Croki/0.3.4");
  assert.match(messages[0].detail, new RegExp("a{64}"));
  assert.deepEqual(opened, [
    "https://github.com/rhinehart514/drover/releases/download/v0.3.5/Croki-0.3.5-arm64.dmg",
  ]);
});

test("up-to-date and failed manual checks report honestly without opening a download", async () => {
  const currentMessages = [];
  const current = createUpdateChecker({
    packaged: true,
    platform: "darwin",
    arch: "arm64",
    currentVersion: "0.3.5",
    fetchImpl: async () => response(release()),
    showMessage: async (message) => { currentMessages.push(message); return { response: 0 }; },
  });
  assert.equal((await current.check()).state, "current");
  assert.equal(currentMessages[0].title, "Croki is up to date");

  const errorMessages = [];
  const failed = createUpdateChecker({
    packaged: true,
    platform: "darwin",
    arch: "arm64",
    currentVersion: "0.3.4",
    fetchImpl: async () => response({}, { ok: false, status: 503 }),
    showMessage: async (message) => { errorMessages.push(message); return { response: 0 }; },
  });
  const result = await failed.check();
  assert.equal(result.state, "error");
  assert.equal(errorMessages[0].title, "Croki couldn’t check for updates");
});

test("quiet checks run daily and notify only once per release", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "croki-update-check-"));
  const statePath = path.join(root, "state.json");
  let currentTime = Date.parse("2026-07-27T18:00:00.000Z");
  let requests = 0;
  let messages = 0;
  const checker = createUpdateChecker({
    packaged: true,
    platform: "darwin",
    arch: "arm64",
    currentVersion: "0.3.4",
    statePath,
    fetchImpl: async () => { requests += 1; return response(release()); },
    showMessage: async () => { messages += 1; return { response: 1 }; },
    now: () => currentTime,
  });
  assert.equal((await checker.check({ interactive: false })).state, "available");
  assert.equal((await checker.check({ interactive: false })).state, "skipped");
  assert.equal(requests, 1);
  assert.equal(messages, 1);
  currentTime += CHECK_INTERVAL_MS + 1;
  assert.equal((await checker.check({ interactive: false })).state, "available");
  assert.equal(requests, 2);
  assert.equal(messages, 1, "the same release stays quiet after Later");
  assert.equal(fs.statSync(statePath).mode & 0o777, 0o600);
  fs.rmSync(root, { recursive: true, force: true });
});
