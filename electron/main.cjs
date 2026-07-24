// Croki desktop shell (code identifier: gtm-ide). The renderer is a local application asset and
// the Brain runs in this desktop process. Renderer requests cross Electron's isolated IPC bridge;
// normal and packaged app launches never bind a web port.

const { app, BrowserWindow, shell, dialog, ipcMain, safeStorage, screen, session, webContents } = require("electron");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const pty = require("node-pty");
const windowState = require("./window-state.cjs");
const { createTerminalRuntime } = require("./terminal-runtime.cjs");
const { createPreviewSessions, hardenPreviewWebview } = require("./preview-sessions.cjs");
const { parseSafeExternalUrl, parseLoopbackDevServerUrl, isAllowedRendererNavigation, resolveLoginShell, mergePathLists } = require("./security.cjs");

app.setName("Croki");

let mainWindow = null;
let founderCapability = null;
let brainRuntime = null;
let windowStateTracker = null;
const ventureSubscriptions = new Map();

function stopVentureSubscription(ownerId, subscriptionId) {
  const subscriptions = ventureSubscriptions.get(ownerId);
  const unsubscribe = subscriptions?.get(subscriptionId);
  unsubscribe?.();
  subscriptions?.delete(subscriptionId);
  if (subscriptions?.size === 0) ventureSubscriptions.delete(ownerId);
}

function stopOwnerVentureSubscriptions(ownerId) {
  const subscriptions = ventureSubscriptions.get(ownerId);
  if (!subscriptions) return;
  for (const unsubscribe of subscriptions.values()) unsubscribe();
  ventureSubscriptions.delete(ownerId);
}

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  if (process.platform === "darwin") app.focus({ steal: true });
  mainWindow.focus();
}

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
  if (!rendererWindow(event.sender.id)) throw new Error("This desktop capability belongs to the active Croki window.");
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
  if (!requestPath.startsWith("/api/") || requestPath.length > 8_192) throw new Error("Invalid Croki request path.");
  if (!["GET", "POST", "PUT", "DELETE"].includes(method)) throw new Error("Invalid Croki request method.");
  const headers = { ...(input.headers ?? {}) };
  headers["x-drover-founder-capability"] = signFounderRequest(method, requestPath);
  return brainRuntime.invokeBrain({ path: requestPath, method, headers, body: String(input.body ?? "") });
});

ipcMain.handle("drover:events-subscribe", (event, input = {}) => {
  const ownerId = owner(event);
  const exactVentureId = String(input.ventureId ?? "").trim();
  const subscriptionId = String(input.subscriptionId ?? "").trim();
  if (!exactVentureId) throw new Error("A venture is required for live updates.");
  if (!/^[a-zA-Z0-9:._-]{1,128}$/.test(subscriptionId)) {
    throw new Error("A valid event subscription is required for live updates.");
  }
  let subscriptions = ventureSubscriptions.get(ownerId);
  if (!subscriptions) {
    subscriptions = new Map();
    ventureSubscriptions.set(ownerId, subscriptions);
  }
  stopVentureSubscription(ownerId, subscriptionId);
  if (!ventureSubscriptions.has(ownerId)) ventureSubscriptions.set(ownerId, subscriptions);
  subscriptions.set(subscriptionId, brainRuntime.subscribeToVenture(exactVentureId, (payload) => {
    sendToRenderer(ownerId, "venture-event", { subscriptionId, event: payload });
  }));
  return { subscribed: true };
});

ipcMain.handle("drover:events-unsubscribe", (event, subscriptionId) => {
  const ownerId = owner(event);
  const exactSubscriptionId = String(subscriptionId ?? "").trim();
  if (exactSubscriptionId) stopVentureSubscription(ownerId, exactSubscriptionId);
  return { subscribed: false };
});

// The drive delta stream. The venture subscription above is data-free by design — it says something
// changed and the renderer re-reads. Tokens cannot ride that: a forming reply would cost one full
// timeline refetch per delta. This channel carries the payload itself, so the desktop transcript
// streams exactly as the browser harness does over SSE. Brain-side isolation refuses a drive that is
// not live in the named venture, so this handler passes the founder's ids straight through.
ipcMain.handle("drover:drive-stream-subscribe", (event, input = {}) => {
  const ownerId = owner(event);
  const exactVentureId = String(input.ventureId ?? "").trim();
  const exactDriveId = String(input.driveId ?? "").trim();
  const subscriptionId = String(input.subscriptionId ?? "").trim();
  if (!exactVentureId || !exactDriveId) throw new Error("A venture and a drive are required for live updates.");
  if (!/^[a-zA-Z0-9:._-]{1,128}$/.test(subscriptionId)) {
    throw new Error("A valid event subscription is required for live updates.");
  }
  let subscriptions = ventureSubscriptions.get(ownerId);
  if (!subscriptions) {
    subscriptions = new Map();
    ventureSubscriptions.set(ownerId, subscriptions);
  }
  stopVentureSubscription(ownerId, subscriptionId);
  if (!ventureSubscriptions.has(ownerId)) ventureSubscriptions.set(ownerId, subscriptions);
  subscriptions.set(subscriptionId, brainRuntime.subscribeToDriveStream(exactVentureId, exactDriveId, (payload) => {
    sendToRenderer(ownerId, "drive-delta", { subscriptionId, frame: payload });
  }));
  return { subscribed: true };
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
    // Common locations the login shell may still miss.
    const extraDirs = [
      path.join(app.getPath("home"), ".claude", "local"),
      path.join(app.getPath("home"), ".local", "bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ];
    process.env.PATH = mergePathLists([out, process.env.PATH, extraDirs.join(":")]);
  } catch {
    // keep the inherited PATH
  }
}

async function createWindow() {
  // Restore the founder's last window placement (contract §2.8). Falls back to 1440x900, and only
  // uses saved coordinates that still land on a connected display.
  const initial = windowState.resolveInitialBounds({ app, screen });
  mainWindow = new BrowserWindow({
    title: "Croki",
    width: initial.width,
    height: initial.height,
    ...(Number.isFinite(initial.x) && Number.isFinite(initial.y)
      ? { x: initial.x, y: initial.y }
      : {}),
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0a0a0a",
    titleBarStyle: "hiddenInset",
    // Keep the native controls in a predictable overlay zone. The renderer reserves
    // vertical chrome space on macOS; the rail no longer bends its content around
    // the traffic lights horizontally.
    trafficLightPosition: { x: 14, y: 14 },
    // Create the native surface immediately. Some packaged macOS launches can finish loading the
    // renderer without delivering Electron's deferred ready-to-show notification, leaving a healthy
    // Croki process with no founder-visible window.
    show: true,
    webPreferences: {
      // Security baseline, stated explicitly so an Electron default change can never widen it:
      // the renderer is an isolated, sandboxed web page with no Node access; preload.cjs is the
      // only bridge and it exposes exactly the typed droverDesktop surface.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
  // The tracker's flush handle also runs in before-quit so a Cmd+Q placement is never lost.
  windowStateTracker = windowState.track({ app, window: mainWindow });

  // A window saved while maximized reopens maximized; unmaximizing restores the tracked normal size.
  if (initial.maximized) mainWindow.maximize();

  mainWindow.once("ready-to-show", revealMainWindow);
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    process.stderr.write(`[desktop] Renderer failed to load ${url}: ${code} ${description}\n`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    process.stderr.write(`[desktop] Renderer exited: ${details.reason} (${details.exitCode})\n`);
  });

  // External links open in the real browser, not inside the app shell. Unsafe schemes and
  // malformed destinations remain closed.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const safeUrl = parseSafeExternalUrl(url);
    if (safeUrl) void shell.openExternal(safeUrl).catch(() => undefined);
    return { action: "deny" };
  });

  // Navigation lockdown: the renderer shows exactly one local document. Anything else is blocked,
  // and safe web links still reach the founder's real browser. The development hatch swaps that
  // document for a loopback Vite dev server (npm run app:dev) so renderer edits go live without a
  // rebuild; packaged launches never read the variable.
  const devServerUrl = app.isPackaged ? null : parseLoopbackDevServerUrl(process.env.DROVER_DEV_SERVER);
  const applicationDocument = path.join(__dirname, "..", "ui", "dist", "index.html");
  const applicationUrl = devServerUrl ?? pathToFileURL(applicationDocument).href;
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedRendererNavigation(applicationUrl, url)) return;
    event.preventDefault();
    const safeUrl = parseSafeExternalUrl(url);
    if (safeUrl) void shell.openExternal(safeUrl).catch(() => undefined);
  });

  const ownerId = mainWindow.webContents.id;
  if (devServerUrl) await mainWindow.loadURL(devServerUrl);
  else await mainWindow.loadFile(applicationDocument);
  // `ready-to-show` can be missed or withheld by a renderer that paints before this listener's
  // platform notification. A successful load is enough to reveal the founder surface; never leave
  // a healthy Brain behind an indefinitely hidden desktop window.
  revealMainWindow();
  mainWindow.on("closed", () => {
    terminalRuntime.stopOwner(ownerId);
    previewSessions.stopAll();
    stopOwnerVentureSubscriptions(ownerId);
    mainWindow = null;
  });
}

function recoverDesktopWorkAfterWindow() {
  // Repository recovery is useful background work, not a condition for showing the founder their
  // last coherent project. Yield once so the loaded renderer can paint before today's in-process
  // Brain performs any synchronous repository inspection. Full responsiveness still requires the
  // planned Brain process boundary.
  setImmediate(() => {
    void brainRuntime.recoverDesktopWork().catch((err) => {
      process.stderr.write(`[desktop] Unfinished-work recovery failed: ${err?.stack || err?.message || err}\n`);
    });
  });
}

async function boot() {
  // The unpackaged development process otherwise inherits Electron's Dock artwork even though the
  // window and packaged application are Croki. Keep the live desktop identity honest too.
  if (process.platform === "darwin" && !app.isPackaged) {
    app.dock.setIcon(path.join(__dirname, "..", "build", "icon.png"));
  }
  repairPath();
  // Name the startup stage that was underway when a failure lands, so the founder-facing error box
  // says what broke instead of only that something did.
  let stage = "preparing founder authority";
  try {
    founderCapability = crypto.randomBytes(32).toString("base64url");
    process.env.GTM_IDE_FOUNDER_CAPABILITY = founderCapability;
    stage = "protecting stored credentials";
    const protectionModule = await import(path.join(__dirname, "..", "brain", "src", "credential-protection.mjs"));
    protectionModule.configureCredentialProtection(
      protectionModule.createElectronSafeStorageProtection(safeStorage),
    );
    stage = "starting the work engine";
    brainRuntime = await import(path.join(__dirname, "..", "brain", "src", "desktop-runtime.mjs"));
    // The brain runs in this process, so the preview broker and this desktop host share one module
    // instance: work-loop preview tools reach the sessions registry directly, with no port bound.
    const previewBroker = await import(path.join(__dirname, "..", "brain", "src", "firm", "preview-broker.mjs"));
    previewBroker.registerPreviewHost((request) => previewSessions.execute(request));
    stage = "opening the window";
    await createWindow();
    recoverDesktopWorkAfterWindow();
  } catch (err) {
    process.stderr.write(`[desktop] Startup failed while ${stage}: ${err?.stack || err?.message || err}\n`);
    dialog.showErrorBox(
      "Croki failed to start",
      `Croki stopped while ${stage}.\n\n${err?.stack || err?.message || err}`
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
    revealMainWindow();
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
    if (BrowserWindow.getAllWindows().length === 0 && brainRuntime) {
      void createWindow();
      return;
    }
    revealMainWindow();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  // Graceful quit handshake: intercept the first quit, flush window placement, tear the desktop
  // runtimes down, ask the brain to stop live provider work, then let the quit proceed. A fail-safe
  // timer guarantees the app still exits if any teardown hangs.
  let teardownComplete = false;
  app.on("before-quit", (event) => {
    if (teardownComplete) return;
    event.preventDefault();
    teardownComplete = true;
    app.isQuiting = true;
    windowStateTracker?.flush();
    terminalRuntime.stopAll();
    previewSessions.stopAll();
    for (const subscriptions of ventureSubscriptions.values()) {
      for (const unsubscribe of subscriptions.values()) unsubscribe();
    }
    ventureSubscriptions.clear();
    const failSafe = setTimeout(() => app.exit(0), 3_000);
    failSafe.unref?.();
    Promise.resolve()
      .then(() => brainRuntime?.shutdownDesktopWork?.())
      .catch(() => undefined)
      .then(() => {
        clearTimeout(failSafe);
        app.quit();
      });
  });
}
