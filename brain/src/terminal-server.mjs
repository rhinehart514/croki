// Live terminal sessions for the canvas.
//
// A terminal is a first-class canvas node, but the real shell lives HERE in the brain — not in the
// Electron main process — so it works identically in the dev browser (`npm start`) and the packaged
// desktop app, and the Electron preload stays locked down (no privileged renderer bridge). The UI
// (xterm.js) connects over a WebSocket on the same loopback port it already uses for the API.
//
// Wire protocol (deliberately tiny):
//   server → client : raw pty output, as binary frames (written straight into xterm)
//   client → server : JSON control frames — {t:"i",d} input · {t:"r",c,r} resize · {t:"k"} kill
//
// Each session keeps a bounded ring buffer of recent output so a downstream "pipe output" can capture
// what the founder ran without the client having to scrape the xterm scrollback (slice 2).

import os from "node:os";
import { WebSocketServer } from "ws";
import pty from "node-pty";

const MAX_SESSIONS = 24;        // a runaway-tabs backstop, not a real limit
const RING_BYTES = 256 * 1024;  // recent output kept per session for output capture

// Idle-reaper bounds. A pty is intentionally kept alive after its last client drops so a remount
// (pan/zoom, lens switch, page reload) reconnects to its history — but without a reaper those orphaned
// shells accumulate up to MAX_SESSIONS on reconnect churn. So a client-less session is reaped once it
// has had no connected socket for IDLE_REAP_MS. Overridable via env for ops; the sweep runs on an
// interval armed by attachTerminalServer.
const IDLE_REAP_MS = Number(process.env.GTM_TERMINAL_IDLE_MS) || 15 * 60 * 1000;
const REAP_SWEEP_MS = 60 * 1000;

const sessions = new Map(); // id -> { term, ring, sockets:Set, lastEmptyAt:number|null }

function defaultShell() {
  if (process.platform === "win32") return process.env.COMSPEC || "powershell.exe";
  return process.env.SHELL || "/bin/zsh";
}

// Login-interactive shell so the founder's real PATH/aliases/prompt are present — same reasoning as
// the desktop PATH repair: this should feel exactly like their own terminal.
function shellArgs() {
  if (process.platform === "win32") return [];
  return ["-il"];
}

function pushRing(session, data) {
  session.ring.push(Buffer.from(data, "utf8"));
  let total = session.ring.reduce((n, b) => n + b.length, 0);
  while (total > RING_BYTES && session.ring.length > 1) {
    total -= session.ring.shift().length;
  }
}

function spawnSession(id, { cwd, cols, rows }) {
  const term = pty.spawn(defaultShell(), shellArgs(), {
    name: "xterm-color",
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd || os.homedir(),
    env: process.env,
  });
  // lastEmptyAt: when the session last dropped to zero clients (null while a client is attached). The
  // reaper reads it to decide when an orphaned shell has been idle long enough to kill.
  const session = { term, ring: [], sockets: new Set(), lastEmptyAt: null };
  term.onData((data) => {
    pushRing(session, data);
    const frame = Buffer.from(data, "utf8");
    for (const ws of session.sockets) {
      if (ws.readyState === ws.OPEN) ws.send(frame);
    }
  });
  term.onExit(() => {
    for (const ws of session.sockets) {
      try { ws.close(1000, "shell exited"); } catch { /* already closing */ }
    }
    sessions.delete(id);
  });
  sessions.set(id, session);
  return session;
}

// Reap sessions that have had no connected client for at least idleMs. A client-less pty otherwise
// lingers (by design, for reconnect) until MAX_SESSIONS, so reconnect/reload churn slowly fills the cap
// with dead shells. Killing the pty triggers its onExit, which also removes it; the synchronous delete
// here keeps the map correct immediately. Exported so a test can drive it deterministically rather than
// waiting real minutes. Returns the ids reaped.
export function reapIdleSessions(now = Date.now(), idleMs = IDLE_REAP_MS) {
  const reaped = [];
  for (const [id, session] of sessions) {
    if (session.sockets.size > 0) continue;      // a client is attached — not idle
    if (session.lastEmptyAt == null) continue;   // never went client-less — nothing to reap
    if (now - session.lastEmptyAt < idleMs) continue;
    try { session.term.kill(); } catch { /* already gone */ }
    sessions.delete(id);
    reaped.push(id);
  }
  return reaped;
}

// The captured recent output for a session, as one string. Used by the terminal step runner and the
// "pipe output" action so the graph consumes what the founder actually ran.
export function readSessionBuffer(id) {
  const session = sessions.get(id);
  if (!session) return "";
  return Buffer.concat(session.ring).toString("utf8");
}

// Attach the WebSocket terminal endpoint to the existing http server. Loopback-only by construction
// (the server binds 127.0.0.1); we still scope it to the /api/terminal path and reject anything else
// so we never steal upgrades a future endpoint wants.
export function attachTerminalServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  // Sweep for orphaned (client-less, idle) shells on an interval so they don't pile up to MAX_SESSIONS.
  // Unref'd so this timer never keeps the process alive by itself.
  const sweep = setInterval(() => reapIdleSessions(), REAP_SWEEP_MS);
  if (typeof sweep.unref === "function") sweep.unref();

  httpServer.on("upgrade", (req, socket, head) => {
    let url;
    try { url = new URL(req.url || "/", "http://127.0.0.1"); }
    catch { socket.destroy(); return; }
    if (url.pathname !== "/api/terminal") return; // not ours — leave it for another handler

    if (sessions.size >= MAX_SESSIONS && !sessions.has(url.searchParams.get("id"))) {
      socket.write("HTTP/1.1 503 Too Many Sessions\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const id = url.searchParams.get("id") || `term_${Date.now()}`;
      const cwd = url.searchParams.get("cwd") || undefined;
      const cols = Number(url.searchParams.get("cols")) || 80;
      const rows = Number(url.searchParams.get("rows")) || 24;

      // Reconnect to a live session if one exists for this id, else spawn fresh. Reconnecting replays
      // the ring buffer so a remounted node (pan/zoom, lens switch) shows its history, not a blank box.
      let session = sessions.get(id);
      const fresh = !session;
      if (!session) session = spawnSession(id, { cwd, cols, rows });
      session.sockets.add(ws);
      session.lastEmptyAt = null; // a client is attached again — cancel any pending idle reap
      if (!fresh && session.ring.length) ws.send(Buffer.concat(session.ring));

      ws.on("message", (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString("utf8")); } catch { return; }
        if (msg.t === "i" && typeof msg.d === "string") session.term.write(msg.d);
        else if (msg.t === "r") session.term.resize(Math.max(1, msg.c | 0), Math.max(1, msg.r | 0));
        else if (msg.t === "k") { try { session.term.kill(); } catch { /* gone */ } }
      });
      ws.on("close", () => {
        session.sockets.delete(ws);
        // Keep the pty alive when the last socket drops so the session survives a remount — but stamp
        // the moment it went client-less so the idle-reaper can sweep it if no one reconnects in time.
        if (session.sockets.size === 0) session.lastEmptyAt = Date.now();
      });
    });
  });

  return wss;
}

// ─── Test seams ──────────────────────────────────────────────────────────────
// The sessions map is module-private on purpose (it holds live ptys). These let a test seed a fake
// session and inspect the map to exercise the idle-reaper without spawning a real shell. Names are
// underscore-prefixed to mark them as not part of the runtime surface.
export function __registerTestSession(id, session) {
  sessions.set(id, { ring: [], sockets: new Set(), lastEmptyAt: null, ...session });
}
export function __hasSession(id) {
  return sessions.has(id);
}
export function __clearTestSessions() {
  sessions.clear();
}
