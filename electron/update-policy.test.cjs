const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createUpdateCoordinator,
  currentUpdatePosture,
} = require("./update-policy.cjs");

const update = {
  version: "0.3.5",
  artifactSha256: "a".repeat(64),
  feedUrl: "https://updates.example.test/croki",
  signed: true,
};

test("the source posture has no production check or silent install path", async () => {
  const policy = createUpdateCoordinator();
  assert.deepEqual(policy.status(), currentUpdatePosture());
  assert.equal(policy.status().mode, "source");
  assert.equal(policy.status().automaticInstall, false);
  assert.equal(policy.status().installBoundary, "durable-quiescence-or-explicit-founder-drain");
  assert.throws(() => policy.prepare(update), (error) => error.code === "UPDATE_DISABLED");
  await assert.rejects(policy.install(), (error) => error.code === "UPDATE_DISABLED");
});

test("the packaged posture permits discovery but still forbids automatic installation", () => {
  const posture = currentUpdatePosture({ packaged: true, supported: true, currentVersion: "0.3.4" });
  assert.equal(posture.mode, "manual-download");
  assert.equal(posture.channel, "production");
  assert.equal(posture.canCheck, true);
  assert.equal(posture.automaticCheck, true);
  assert.equal(posture.automaticInstall, false);
  assert.equal(posture.requiresDeveloperIdForAutomaticInstall, true);
});

test("an enabled updater refuses unsigned or unpinned artifacts", () => {
  const policy = createUpdateCoordinator({
    enabled: true,
    inspectReadiness: () => ({}),
    reachSafeBoundary: () => ({}),
    install: () => {},
  });
  assert.throws(() => policy.prepare({ ...update, signed: false }), (error) => error.code === "UPDATE_UNSIGNED");
  assert.throws(() => policy.prepare({ ...update, artifactSha256: "unknown" }), (error) => error.code === "UPDATE_INVALID");
  assert.throws(() => policy.prepare({ ...update, feedUrl: "http://updates.example.test" }), (error) => error.code === "UPDATE_INVALID");
  assert.throws(() => policy.prepare({ ...update, feedUrl: "https://token@updates.example.test" }), (error) => error.code === "UPDATE_INVALID");
  assert.throws(() => policy.prepare({ ...update, feedUrl: "https://updates.example.test?token=secret" }), (error) => error.code === "UPDATE_INVALID");
});

test("active work defers without founder direction and records exact retained state before install", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "croki-update-policy-"));
  const receiptPath = path.join(root, "update-receipts.json");
  let readiness = {
    activeDrives: 1,
    pendingRunLayers: 3,
    retainedStateRef: "work-journal:venture-one:42",
    detail: "Thread one, Run seven, Review checkpoint nine, and the founder draft remain durable.",
  };
  let installs = 0;
  let drains = 0;
  const policy = createUpdateCoordinator({
    enabled: true,
    receiptPath,
    inspectReadiness: () => readiness,
    reachSafeBoundary: () => {
      drains += 1;
      readiness = { ...readiness, activeDrives: 0, pendingRunLayers: 0 };
      return { abortedDrives: 1, drainedRunWorkers: [{ runId: "run-seven", pending: 0 }] };
    },
    install: () => {
      const beforeInstall = JSON.parse(fs.readFileSync(receiptPath, "utf8")).receipts.at(-1);
      assert.equal(beforeInstall.kind, "update-install-ready", "the retained-state receipt must reach disk before installer invocation");
      installs += 1;
    },
    now: () => "2026-07-27T12:00:00.000Z",
  });
  policy.prepare(update);

  const deferred = await policy.install();
  assert.equal(deferred.outcome, "waiting-for-safe-boundary");
  assert.equal(deferred.readiness.retainedStateRef, "work-journal:venture-one:42");
  assert.equal(installs, 0);
  assert.equal(drains, 0);

  const started = await policy.install({ founderConfirmed: true });
  assert.equal(started.outcome, "installer-invoked-after-receipt");
  assert.equal(installs, 1);
  assert.equal(drains, 1);
  const stored = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  assert.deepEqual(stored.receipts.slice(-3).map((entry) => entry.kind), [
    "update-boundary-reached",
    "update-install-ready",
    "update-install-started",
  ]);
  assert.match(stored.receipts.at(-2).retainedState, /founder draft remain durable/);
  assert.equal(fs.statSync(receiptPath).mode & 0o777, 0o600);
  fs.rmSync(root, { recursive: true, force: true });
});

test("a failed drain blocks replacement and never calls the installer", async () => {
  let installs = 0;
  const policy = createUpdateCoordinator({
    enabled: true,
    inspectReadiness: () => ({ activeDrives: 0, pendingRunLayers: 2, retainedStateRef: "journal:blocked" }),
    reachSafeBoundary: () => ({ drainedRunWorkers: [{ runId: "run-blocked", pending: 2 }] }),
    install: () => { installs += 1; },
  });
  policy.prepare(update);
  const blocked = await policy.install({ founderConfirmed: true });
  assert.equal(blocked.outcome, "safe-boundary-not-reached");
  assert.equal(installs, 0);
});
