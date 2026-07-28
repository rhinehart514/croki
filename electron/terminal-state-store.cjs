const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SCHEMA_VERSION = 1;

// PTY continuity belongs beside the Electron-owned process boundary. A small bounded private JSON
// record was chosen deliberately: renderer localStorage has the wrong trust/ownership boundary,
// xterm serialization preserves presentation rather than the native process outcome, and a database
// dependency adds migration and operating cost without improving this exact per-terminal state.
function identity(target) {
  return {
    ventureId: String(target?.ventureId ?? ""),
    workspaceId: String(target?.workspaceId ?? ""),
    terminalId: String(target?.terminalId ?? ""),
  };
}

function keyFor(target) {
  const exact = identity(target);
  return crypto.createHash("sha256")
    .update(`${exact.ventureId}\0${exact.workspaceId}\0${exact.terminalId}`)
    .digest("hex");
}

function sameIdentity(left, right) {
  return left.ventureId === right.ventureId
    && left.workspaceId === right.workspaceId
    && left.terminalId === right.terminalId;
}

function createTerminalStateStore(root, { delayMs = 75 } = {}) {
  const pending = new Map();
  const timers = new Map();

  function fileFor(target) {
    return path.join(root, `${keyFor(target)}.json`);
  }

  function write(target, state) {
    const file = fileFor(target);
    const temporary = `${file}.${process.pid}.tmp`;
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    fs.writeFileSync(temporary, `${JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      identity: identity(target),
      savedAt: new Date().toISOString(),
      state,
    })}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, file);
    try { fs.chmodSync(file, 0o600); } catch { /* best effort on non-POSIX hosts */ }
  }

  function flushKey(key) {
    const queued = pending.get(key);
    if (!queued) return;
    pending.delete(key);
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    timers.delete(key);
    write(queued.target, queued.state);
  }

  function save(target, state) {
    const key = keyFor(target);
    pending.set(key, { target: identity(target), state });
    if (timers.has(key)) return;
    const timer = setTimeout(() => flushKey(key), delayMs);
    timer.unref?.();
    timers.set(key, timer);
  }

  function load(target) {
    const key = keyFor(target);
    if (pending.has(key)) return pending.get(key).state;
    try {
      const record = JSON.parse(fs.readFileSync(fileFor(target), "utf8"));
      if (record?.schemaVersion !== SCHEMA_VERSION || !sameIdentity(record.identity ?? {}, identity(target))) return null;
      return record.state && typeof record.state === "object" ? record.state : null;
    } catch {
      return null;
    }
  }

  function remove(target) {
    const key = keyFor(target);
    pending.delete(key);
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    timers.delete(key);
    try { fs.unlinkSync(fileFor(target)); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  function flush() {
    for (const key of [...pending.keys()]) flushKey(key);
  }

  return { load, save, remove, flush };
}

module.exports = { SCHEMA_VERSION, createTerminalStateStore, keyFor };
