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

const sessions = new Map(); // id -> { term, ring, sockets:Set }

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
  const session = { term, ring: [], sockets: new Set() };
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
        // Keep the pty alive when the last socket drops so the session survives a remount; reap it on
        // an explicit kill or shell exit only. (A future idle-reaper can sweep orphans.)
      });
    });
  });

  return wss;
}
