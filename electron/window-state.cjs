// Window-state restore across launches (contract §2.8, Phase 9).
//
// The desktop shell used to open at a fixed 1440x900 every time (main.cjs). A founder who sizes and
// places the window expects it back where they left it. This module persists the window bounds and
// maximized flag to a plain JSON file in the app's userData directory and hands them back on the next
// launch, clamped to a currently-connected display so a window saved on an external monitor never
// opens off-screen.
//
// No dependency: this is the smallest honest thing (electron-window-state would be a new dependency,
// and the contract keeps the packaging pipeline unchanged). Best-effort throughout — a read/write
// failure falls back to the default bounds rather than blocking boot.

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_BOUNDS = { width: 1440, height: 900 };
const MIN_WIDTH = 960;
const MIN_HEIGHT = 640;

function stateFile(app) {
  return path.join(app.getPath("userData"), "window-state.json");
}

function readState(app) {
  try {
    const raw = fs.readFileSync(stateFile(app), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

// A saved rectangle is only usable if it still lands on a connected display. Screens change between
// launches (a laptop undocked from an external monitor); a window restored to coordinates on a
// vanished display would open invisibly. Require meaningful overlap with some current work area.
function isVisibleOnSomeDisplay(screen, bounds) {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height)
  ) {
    return false;
  }
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const area = display.workArea;
    const overlapX = Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x));
    const overlapY = Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y));
    // Require at least a 120x80 visible corner so a barely-clipped window still counts, but one on a
    // gone display does not.
    return overlapX >= 120 && overlapY >= 80;
  });
}

// Resolve the bounds to open with. Returns { width, height } always, plus { x, y } and
// { maximized } when a valid saved state exists.
function resolveInitialBounds({ app, screen }) {
  const saved = readState(app);
  if (!saved) return { ...DEFAULT_BOUNDS };

  const width = Math.max(MIN_WIDTH, Number.isFinite(saved.width) ? saved.width : DEFAULT_BOUNDS.width);
  const height = Math.max(MIN_HEIGHT, Number.isFinite(saved.height) ? saved.height : DEFAULT_BOUNDS.height);
  const result = { width, height, maximized: saved.maximized === true };

  if (
    Number.isFinite(saved.x) &&
    Number.isFinite(saved.y) &&
    isVisibleOnSomeDisplay(screen, { x: saved.x, y: saved.y, width, height })
  ) {
    result.x = saved.x;
    result.y = saved.y;
  }
  return result;
}

// Attach persistence to a window: save on move/resize (debounced) and on close. When the window is
// maximized we keep the last normal bounds (getNormalBounds) so unmaximizing restores a real size,
// but record maximized:true so the next launch opens maximized. Returns a flush handle so the quit
// path can force the final synchronous save before teardown begins.
function track({ app, window }) {
  let saveTimer = null;

  const snapshot = () => {
    if (window.isDestroyed()) return;
    const maximized = window.isMaximized();
    // getNormalBounds returns the restored (non-maximized) rectangle even while maximized.
    const bounds = window.getNormalBounds();
    const state = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized,
    };
    try {
      fs.mkdirSync(app.getPath("userData"), { recursive: true });
      fs.writeFileSync(stateFile(app), JSON.stringify(state), "utf8");
    } catch {
      // best-effort: a failed write just loses this session's placement
    }
  };

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(snapshot, 400);
  };

  const flush = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    snapshot();
  };

  window.on("resize", scheduleSave);
  window.on("move", scheduleSave);
  window.on("maximize", scheduleSave);
  window.on("unmaximize", scheduleSave);
  // close fires before the window is destroyed; capture the final state synchronously.
  window.on("close", flush);
  return { flush };
}

module.exports = { resolveInitialBounds, track, DEFAULT_BOUNDS };
