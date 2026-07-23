// Drover desktop shell (code identifier: gtm-ide). The renderer is a local application asset and
// the Brain runs in this desktop process. Renderer requests cross Electron's isolated IPC bridge;
// normal and packaged app launches never bind a web port.

const { app, BrowserWindow, shell, dialog, ipcMain, safeStorage, screen, session, webContents } = require("electron");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const pty = require("node-pty");
const windowState = require("./window-state.cjs");
const { createTerminalRuntime } = require("./terminal-runtime.cjs");
const { createPreviewSessions, hardenPreviewWebview } = require("./preview-sessions.cjs");
const { externalHttpUrl, resolveLoginShell } = require("./security.cjs");

app.setName("Drover");

let mainWindow = null;
let founderCapability = null;
let brainRuntime = null;
const ventureSubscriptions = new Map();

function rendererWindow(ownerId) {
  return mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.id === ownerId ? mainWindow : null;
}

function sendToRenderer(ownerId, channel, payload) {
  const window = rendererWindow(ownerId);
  if (window && !window.webContents.isDestroyed()) window.webContents.send(`drover:${channel}`, payload);
}

function signFounderRequest(method, requestPath) {
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(18).toString("base64url");
  const signature = crypto
    .createHmac("sha256", founderCapability)
    .update(`${String(method).toUpperCase()}\n${requestPath}\n${issuedAt}\n${nonce}`)
    .digest("base64url");
  return `v1.${issuedAt}.${nonce}.${signature}`;
}

async function resolveCodingWorkspace(ventureId, workspaceId) {
  const requestPath = `/api/ventures/${encodeURIComponent(ventureId)}/coding-workspaces/${encodeURIComponent(workspaceId)}`;
  const response = await brainRuntime.invokeBrain({
    path: requestPath,
    method: "GET",
    headers: { "x-drover-founder-capability": signFounderRequest("GET", requestPath) },
  });
  const body = JSON.parse(response.body || "{}");
  if (response.status !== 200) throw new Error(body?.error || `Coding workspace lookup failed (${response.status}).`);
  return body;
}

const terminalRuntime = createTerminalRuntime({
  pty,
  resolveWorkspace: resolveCodingWorkspace,
  send: sendToRenderer,
});
const previewSessions = createPreviewSessions({
  electronSession: session,
  webContentsById: (id) => webContents.fromId(id),
  getFocusedWebContents: () => webContents.getFocusedWebContents(),
  broadcast: (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(`drover:${channel}`, payload);
  },
});

function owner(event) {
  if (!rendererWindow(event.sender.id)) throw new Error("This desktop capability belongs to the active Drover window.");
  return event.sender.id;
}

ipcMain.handle("drover:terminal-open", (event, target) => terminalRuntime.open(owner(event), target));
ipcMain.handle("drover:terminal-write", (event, sessionId, data) => terminalRuntime.write(owner(event), sessionId, data));
ipcMain.handle("drover:terminal-resize", (event, sessionId, cols, rows) => terminalRuntime.resize(owner(event), sessionId, cols, rows));
ipcMain.handle("drover:terminal-restart", (event, sessionId) => terminalRuntime.restart(owner(event), sessionId));
ipcMain.handle("drover:terminal-close", (event, sessionId) => terminalRuntime.close(owner(event), sessionId));
ipcMain.handle("drover:preview-attach", (event, input) => previewSessions.attach(owner(event), input));
ipcMain.handle("drover:preview-detach", (event, workspaceId) => previewSessions.detach(owner(event), workspaceId));
ipcMain.handle("drover:preview-start-pick", (event, workspaceId) => previewSessions.startPick(owner(event), workspaceId));
ipcMain.handle("drover:preview-cancel-pick", (event, workspaceId) => previewSessions.cancelPick(owner(event), workspaceId));
// Element picks arrive from preview guests, not the main window; the sessions registry matches the
// sender against its own guests and drops anything else.
ipcMain.on("drover-preview:element-picked", (event, annotation, rect) => {
  void previewSessions.handleElementPicked(event.sender.id, annotation, rect);
});

ipcMain.handle("drover:brain-request", async (event, input = {}) => {
  owner(event);
  const requestPath = String(input.path ?? "");
  const method = String(input.method ?? "GET").toUpperCase();
  if (!requestPath.startsWith("/api/") || requestPath.length > 8_192) throw new Error("Invalid Drover request path.");
  if (!["GET", "POST", "PUT", "DELETE"].includes(method)) throw new Error("Invalid Drover request method.");
  const headers = { ...(input.headers ?? {}) };
  headers["x-drover-founder-capability"] = signFounderRequest(method, requestPath);
  return brainRuntime.invokeBrain({ path: requestPath, method, headers, body: String(input.body ?? "") });
});

ipcMain.handle("drover:events-subscribe", (event, ventureId) => {
  const ownerId = owner(event);
  const exactVentureId = String(ventureId ?? "").trim();
  if (!exactVentureId) throw new Error("A venture is required for live updates.");
  ventureSubscriptions.get(ownerId)?.();
  ventureSubscriptions.set(ownerId, brainRuntime.subscribeToVenture(exactVentureId, (payload) => {
    sendToRenderer(ownerId, "venture-event", payload);
  }));
  return { subscribed: true };
});

ipcMain.handle("drover:events-unsubscribe", (event) => {
  const ownerId = owner(event);
  ventureSubscriptions.get(ownerId)?.();
  ventureSubscriptions.delete(ownerId);
  return { subscribed: false };
});

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
    const shellBin = resolveLoginShell(process.env.SHELL);
    const out = execFileSync(shellBin, ["-ilc", 'printf "%s" "$PATH"'], {
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

async function createWindow() {
  // Restore the founder's last window placement (contract §2.8). Falls back to 1440x900, and only
  // uses saved coordinates that still land on a connected display.
  const initial = windowState.resolveInitialBounds({ app, screen });
  mainWindow = new BrowserWindow({
    title: "Drover",
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
      // Workspace previews render as <webview> guests; will-attach-webview below is the boundary
      // that forces every guest into a sandboxed per-workspace preview partition.
      webviewTag: true,
    },
  });

  mainWindow.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    if (!hardenPreviewWebview(webPreferences, params, path.join(__dirname, "preview-pick-preload.cjs"))) {
      event.preventDefault();
    }
  });

  // Persist bounds/maximized on move, resize, and close, so the next launch opens where we left off.
  windowState.track({ app, window: mainWindow });

  // A window saved while maximized reopens maximized; unmaximizing restores the tracked normal size.
  if (initial.maximized) mainWindow.maximize();

  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    process.stderr.write(`[desktop] Renderer failed to load ${url}: ${code} ${description}\n`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    process.stderr.write(`[desktop] Renderer exited: ${details.reason} (${details.exitCode})\n`);
  });

  // External links open in the real browser, not inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      void shell.openExternal(externalHttpUrl(url)).catch(() => undefined);
    } catch {
      // Unexpected schemes and malformed destinations remain closed.
    }
    return { action: "deny" };
  });

  const ownerId = mainWindow.webContents.id;
  await mainWindow.loadFile(path.join(__dirname, "..", "ui", "dist", "index.html"));
  // `ready-to-show` can be missed or withheld by a renderer that paints before this listener's
  // platform notification. A successful load is enough to reveal the founder surface; never leave
  // a healthy Brain behind an indefinitely hidden desktop window.
  if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
  mainWindow.on("closed", () => {
    terminalRuntime.stopOwner(ownerId);
    previewSessions.stopAll();
    const unsubscribe = ventureSubscriptions.get(ownerId);
    unsubscribe?.();
    ventureSubscriptions.delete(ownerId);
    mainWindow = null;
  });
}

async function boot() {
  repairPath();
  try {
    founderCapability = crypto.randomBytes(32).toString("base64url");
    process.env.GTM_IDE_FOUNDER_CAPABILITY = founderCapability;
    const protectionModule = await import(path.join(__dirname, "..", "brain", "src", "credential-protection.mjs"));
    protectionModule.configureCredentialProtection(
      protectionModule.createElectronSafeStorageProtection(safeStorage),
    );
    brainRuntime = await import(path.join(__dirname, "..", "brain", "src", "desktop-runtime.mjs"));
    // The brain runs in this process, so the preview broker and this desktop host share one module
    // instance: work-loop preview tools reach the sessions registry directly, with no port bound.
    const previewBroker = await import(path.join(__dirname, "..", "brain", "src", "firm", "preview-broker.mjs"));
    previewBroker.registerPreviewHost((request) => previewSessions.execute(request));
    await brainRuntime.recoverDesktopWork();
    await createWindow();
  } catch (err) {
    process.stderr.write(`[desktop] Startup failed: ${err?.stack || err?.message || err}\n`);
    dialog.showErrorBox(
      "Drover failed to start",
      `Could not start the desktop engine.\n\n${err?.stack || err?.message || err}`
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

  // Route terminal signals through Electron's ordinary quit lifecycle.
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.on(signal, () => {
      if (app.isQuiting) {
        process.exit(0);
        return;
      }
      app.quit();
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && brainRuntime) void createWindow();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    app.isQuiting = true;
    terminalRuntime.stopAll();
    previewSessions.stopAll();
    for (const unsubscribe of ventureSubscriptions.values()) unsubscribe();
    ventureSubscriptions.clear();
  });
}
