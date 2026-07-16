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

const { app, BrowserWindow, shell, utilityProcess, dialog, ipcMain, screen } = require("electron");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const crypto = require("node:crypto");
const { execSync } = require("node:child_process");
const windowState = require("./window-state.cjs");

const HOST = "127.0.0.1";

let brainProcess = null;
let mainWindow = null;
let brainPort = 0;
let founderCapability = null;

function signFounderRequest(method, rawUrl) {
  const url = new URL(rawUrl);
  const requestPath = `${url.pathname}${url.search}`;
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(18).toString("base64url");
  const signature = crypto
    .createHmac("sha256", founderCapability)
    .update(`${String(method).toUpperCase()}\n${requestPath}\n${issuedAt}\n${nonce}`)
    .digest("base64url");
  return `v1.${issuedAt}.${nonce}.${signature}`;
}

// Repository binding is a filesystem choice, so the desktop host owns it. The renderer receives
// only the path the founder explicitly picked plus a human name for the onboarding form.
ipcMain.handle("drover:select-repository", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose a product repository",
    buttonLabel: "Choose repository",
    defaultPath: app.getPath("home"),
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const repository = result.filePaths[0];
  return { path: repository, name: path.basename(repository) };
});

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

// Stop the brain and don't leave it orphaned. SIGTERM lets server.mjs drain (it has its own
// force-exit fail-safe); a short SIGKILL backstop covers a brain that ignores the term. Idempotent:
// repeated calls (before-quit + quit, or an error path) are safe.
function stopBrain() {
  const child = brainProcess;
  if (!child) return;
  brainProcess = null;
  try {
    child.kill(); // SIGTERM → graceful shutdown in server.mjs
  } catch {
    return; // already gone
  }
  // Backstop: if the utility process is still alive shortly after, force it down so quitting the app
  // never leaves an orphaned engine holding the loopback port.
  const backstop = setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already exited */
    }
  }, 2000);
  backstop.unref?.();
}

function startBrain(port, capability) {
  const entry = brainEntry();
  const child = utilityProcess.fork(entry, [], {
    stdio: "pipe",
    env: {
      ...process.env,
      PORT: String(port),
      GTM_IDE_DESKTOP: "1",
      GTM_IDE_FOUNDER_CAPABILITY: capability,
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

async function createWindow(port) {
  // Restore the founder's last window placement (contract §2.8). Falls back to 1440x900, and only
  // uses saved coordinates that still land on a connected display.
  const initial = windowState.resolveInitialBounds({ app, screen });
  mainWindow = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    ...(Number.isFinite(initial.x) && Number.isFinite(initial.y)
      ? { x: initial.x, y: initial.y }
      : {}),
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0a0a0a",
    titleBarStyle: "hiddenInset",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // Persist bounds/maximized on move, resize, and close, so the next launch opens where we left off.
  windowState.track({ app, window: mainWindow });

  // A window saved while maximized reopens maximized; unmaximizing restores the tracked normal size.
  if (initial.maximized) mainWindow.maximize();

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Founder authority stays below the renderer. Electron signs a fresh method + path claim for each
  // request returning to this exact brain process. The page cannot read, persist, or mint the root
  // capability; a copied claim expires quickly and the brain accepts its nonce only once.
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: [`http://${HOST}:${port}/api/*`] },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      requestHeaders["x-drover-founder-capability"] = signFounderRequest(details.method, details.url);
      callback({ requestHeaders });
    },
  );

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
    founderCapability = crypto.randomBytes(32).toString("base64url");
    brainProcess = startBrain(brainPort, founderCapability);
    await waitForHealth(brainPort);
    await createWindow(brainPort);
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

  // Route OS termination signals through the app-quit lifecycle so the brain is always torn down.
  // `npm run app` runs Electron in the foreground, so a dev's Ctrl-C sends SIGINT to the whole group;
  // a `kill` sends SIGTERM. Neither runs before-quit on its own — without this, the utility-process
  // brain orphans and keeps the loopback port. app.quit() drives before-quit → stopBrain; the guard
  // makes a repeated/again signal a hard exit so a wedged shutdown can't pin the terminal.
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.on(signal, () => {
      if (app.isQuiting) {
        stopBrain();
        process.exit(0);
        return;
      }
      app.quit();
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && brainPort) void createWindow(brainPort);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  // Begin brain teardown as soon as a quit is requested (before the window tears down), so the engine
  // has the drain window while Electron closes the UI. isQuiting suppresses the "Drover stopped" alert
  // for this expected exit.
  app.on("before-quit", () => {
    app.isQuiting = true;
    stopBrain();
  });

  // Final backstop: quit fires even on paths that skip before-quit; stopBrain is idempotent.
  app.on("quit", () => {
    stopBrain();
  });
}
