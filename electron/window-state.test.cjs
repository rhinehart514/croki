// Unit tests for the window-state restore logic (contract §2.8, Phase 9).
//
// Pure-logic coverage that needs no running Electron: bounds resolution, the min-size floor, the
// maximized flag round-trip, and the off-screen clamp (a rectangle saved on a now-gone display must
// not be reused). track() is exercised for its file-write side effect against a temp userData dir.
//
// Run: node --test electron/window-state.test.cjs

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { resolveInitialBounds, track } = require("./window-state.cjs");

function makeApp(userData) {
  return { getPath: (key) => (key === "userData" ? userData : os.tmpdir()) };
}

// One 1920x1080 display at the origin, work area inset for a menu bar.
function makeScreen(displays) {
  return {
    getAllDisplays: () => displays,
  };
}

const PRIMARY = [{ workArea: { x: 0, y: 25, width: 1920, height: 1055 } }];

function tempUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "drover-winstate-"));
}

function writeState(userData, state) {
  fs.writeFileSync(path.join(userData, "window-state.json"), JSON.stringify(state), "utf8");
}

test("no saved state falls back to the 1440x900 default with no position", () => {
  const userData = tempUserData();
  const bounds = resolveInitialBounds({ app: makeApp(userData), screen: makeScreen(PRIMARY) });
  assert.equal(bounds.width, 1440);
  assert.equal(bounds.height, 900);
  assert.equal(bounds.x, undefined);
  assert.equal(bounds.y, undefined);
});

test("a valid on-screen saved rectangle is restored verbatim", () => {
  const userData = tempUserData();
  writeState(userData, { x: 100, y: 120, width: 1600, height: 1000, maximized: false });
  const bounds = resolveInitialBounds({ app: makeApp(userData), screen: makeScreen(PRIMARY) });
  assert.equal(bounds.x, 100);
  assert.equal(bounds.y, 120);
  assert.equal(bounds.width, 1600);
  assert.equal(bounds.height, 1000);
  assert.equal(bounds.maximized, false);
});

test("the maximized flag round-trips", () => {
  const userData = tempUserData();
  writeState(userData, { x: 0, y: 25, width: 1440, height: 900, maximized: true });
  const bounds = resolveInitialBounds({ app: makeApp(userData), screen: makeScreen(PRIMARY) });
  assert.equal(bounds.maximized, true);
});

test("a rectangle on a now-gone display keeps the saved size but drops the off-screen position", () => {
  const userData = tempUserData();
  // Saved on a second monitor to the right (x=2200) that is no longer connected.
  writeState(userData, { x: 2200, y: 200, width: 1500, height: 950, maximized: false });
  const bounds = resolveInitialBounds({ app: makeApp(userData), screen: makeScreen(PRIMARY) });
  assert.equal(bounds.width, 1500);
  assert.equal(bounds.height, 950);
  assert.equal(bounds.x, undefined, "off-screen x must be dropped so the window opens visibly");
  assert.equal(bounds.y, undefined);
});

test("sizes below the minimum are floored to the window minimums", () => {
  const userData = tempUserData();
  writeState(userData, { x: 10, y: 30, width: 300, height: 200, maximized: false });
  const bounds = resolveInitialBounds({ app: makeApp(userData), screen: makeScreen(PRIMARY) });
  assert.equal(bounds.width, 960);
  assert.equal(bounds.height, 640);
});

test("corrupt state file falls back to the default", () => {
  const userData = tempUserData();
  fs.writeFileSync(path.join(userData, "window-state.json"), "{ not json", "utf8");
  const bounds = resolveInitialBounds({ app: makeApp(userData), screen: makeScreen(PRIMARY) });
  assert.equal(bounds.width, 1440);
  assert.equal(bounds.height, 900);
});

test("track() writes the window's normal bounds and maximized flag on close", () => {
  const userData = tempUserData();
  const handlers = {};
  const fakeWindow = {
    isDestroyed: () => false,
    isMaximized: () => true,
    getNormalBounds: () => ({ x: 42, y: 64, width: 1700, height: 1010 }),
    on: (event, cb) => {
      handlers[event] = cb;
    },
  };
  track({ app: makeApp(userData), window: fakeWindow });
  assert.equal(typeof handlers.close, "function", "close handler is registered");
  handlers.close();
  const saved = JSON.parse(fs.readFileSync(path.join(userData, "window-state.json"), "utf8"));
  assert.deepEqual(saved, { x: 42, y: 64, width: 1700, height: 1010, maximized: true });

  // And that saved state round-trips back through resolveInitialBounds on the next launch.
  const restored = resolveInitialBounds({ app: makeApp(userData), screen: makeScreen(PRIMARY) });
  assert.equal(restored.x, 42);
  assert.equal(restored.maximized, true);
});
