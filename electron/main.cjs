// Drover desktop shell (code identifier: gtm-ide).
//
// The product is a thin host: a Node "brain" (brain/src/server.mjs) that serves the API and the
// built React client on a loopback port, plus the operator runtime that shells out to the founder's
// `claude` subscription. This file does the smallest possible thing to put that behind a window the
// founder double-clicks instead of a terminal:
//   1. repair PATH, because Finder-launched apps inherit a stripped PATH and the operator must be
//      able to find `claude` and `git`;
//   2. boot the existing brain unchanged as a child Node process on a free loopback port;
//   3. wait for its health endpoint, then load that URL in a BrowserWindow.
// No brain code changes — the desktop app talks to the same local API the dev server already serves.

const { app, BrowserWindow, shell, utilityProcess, dialog } = require("electron");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const { execSync } = require("node:child_process");

const isDev = !app.isPackaged;
const HOST = "127.0.0.1";

let brainProcess = null;
let mainWindow = null;
let brainPort = 0;

// --- PATH repair ------------------------------------------------------------------------------
// A macOS app launched from Finder gets a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin). The operator
// runtime spawns `claude` (often in ~/.claude/local or a Homebrew/npm prefix) and uses `git`. Capture
// the founder's real login-shell PATH once and merge it in, so those resolve exactly as they do in
// their terminal. Best-effort: a failure here just leaves the inherited PATH untouched.
function repairPath() {
  if (process.platform === "win32") return;
  try {
    const shellBin = process.env.SHELL || "/bin/zsh";
    const out = execSync(`${shellBin} -ilc 'printf "%s" "$PATH"'`, {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    if (!out) return;
    const merged = new Set(out.split(":").filter(Boolean));
    for (const p of (process.env.PATH || "").split(":").filter(Boolean)) merged.add(p);
    // Common locations the login shell may still miss.
    for (const p of [
      path.join(app.getPath("home"), ".claude", "local"),
      path.join(app.getPath("home"), ".local", "bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ]) merged.add(p);
    process.env.PATH = Array.from(merged).join(":");
  } catch {
    // keep the inherited PATH
  }
}

// --- free port --------------------------------------------------------------------------------
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, HOST, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// --- brain lifecycle --------------------------------------------------------------------------
function brainEntry() {
  // dev:      <repo>/electron/main.cjs       -> <repo>/brain/src/server.mjs
  // packaged: Resources/app/electron/main.cjs -> Resources/app/brain/src/server.mjs
  return path.join(__dirname, "..", "brain", "src", "server.mjs");
}

function startBrain(port) {
  const entry = brainEntry();
  const child = utilityProcess.fork(entry, [], {
    stdio: "pipe",
    env: {
      ...process.env,
      PORT: String(port),
      HOST,
      GTM_IDE_DESKTOP: "1",
    },
  });
  child.stdout?.on("data", (d) => process.stdout.write(`[brain] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[brain] ${d}`));
  child.on("exit", (code) => {
    brainProcess = null;
    // If the brain dies while the app is up (and we're not already quitting), surface it rather
    // than leaving a blank window.
    if (!app.isQuiting && mainWindow) {
      dialog.showErrorBox(
        "Drover stopped",
        `The local engine exited (code ${code}). Quit and relaunch the app.`
      );
    }
  });
  return child;
}

function waitForHealth(port, { timeoutMs = 30000, intervalMs = 250 } = {}) {
  const url = `http://${HOST}:${port}/api/health`;
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error("brain did not become healthy in time"));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0a0a0a",
    titleBarStyle: "hiddenInset",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // External links open in the real browser, not inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const internal = url.startsWith(`http://${HOST}:${port}`);
      if (!internal) {
        shell.openExternal(url);
        return { action: "deny" };
      }
    }
    return { action: "allow" };
  });

  mainWindow.loadURL(`http://${HOST}:${port}/`);
  mainWindow.on("closed", () => { mainWindow = null; });
}

async function boot() {
  repairPath();
  try {
    brainPort = await findFreePort();
    brainProcess = startBrain(brainPort);
    await waitForHealth(brainPort);
    createWindow(brainPort);
  } catch (err) {
    dialog.showErrorBox(
      "Drover failed to start",
      `Could not start the local engine.\n\n${err?.stack || err?.message || err}`
    );
    app.quit();
  }
}

// Single-instance: a second launch focuses the existing window instead of booting a second brain.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(boot);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && brainPort) createWindow(brainPort);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => { app.isQuiting = true; });

  app.on("quit", () => {
    if (brainProcess) {
      try { brainProcess.kill(); } catch { /* already gone */ }
      brainProcess = null;
    }
  });
}
