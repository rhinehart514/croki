// Preview sessions for agent-drivable worktree previews. Each coding workspace gets one sandboxed
// <webview> guest in its own non-persistent partition; the renderer registers the guest here and
// the work-loop's preview tools drive it over CDP. Guests can only reach loopback dev servers and
// never share state with the founder's browser session or any other workspace.

const path = require("node:path");
const fs = require("node:fs");
const { createPreviewDriver } = require("./preview-driver.cjs");
const { playwrightInstallExpression, INJECTED_GLOBAL } = require("./preview-playwright.cjs");
const previewNet = require("./preview-net.cjs");

const PARTITION_PREFIX = "drover-preview:";
const ATTACH_WAIT_MS = 12_000;
const MAX_SNAPSHOT_WIDTH = 1280;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const partitionFor = (workspaceId) => `${PARTITION_PREFIX}${workspaceId}`;

/** Preview pages may only be a worktree's own loopback dev server. */
function loopbackPreviewUrl(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || "")); }
  catch { throw new Error("Enter a valid preview URL."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Preview URLs must use HTTP or HTTPS.");
  if (url.username || url.password) throw new Error("Preview URLs cannot contain credentials.");
  if (!LOOPBACK_HOSTS.has(url.hostname)) throw new Error("The preview only opens local dev servers (127.0.0.1 or localhost).");
  return url;
}

/**
 * The will-attach-webview boundary: only workspace preview partitions may attach, and the host
 * forces every security-relevant preference regardless of what the renderer requested. Returns
 * false when the attachment must be prevented.
 */
function hardenPreviewWebview(webPreferences, params, pickPreloadPath) {
  const partition = String(params?.partition ?? "");
  if (!partition.startsWith(PARTITION_PREFIX) || partition.length <= PARTITION_PREFIX.length) return false;
  const src = String(params?.src ?? "");
  if (src && src !== "about:blank") {
    try { loopbackPreviewUrl(src); } catch { return false; }
  }
  delete webPreferences.preloadURL;
  delete params?.preload;
  webPreferences.preload = pickPreloadPath;
  webPreferences.nodeIntegration = false;
  webPreferences.nodeIntegrationInSubFrames = false;
  webPreferences.contextIsolation = true;
  webPreferences.sandbox = true;
  webPreferences.webSecurity = true;
  webPreferences.allowRunningInsecureContent = false;
  webPreferences.experimentalFeatures = false;
  return true;
}

function createPreviewSessions({ electronSession, webContentsById, getFocusedWebContents, broadcast, net = previewNet, platform = process.platform, installExpression = playwrightInstallExpression, writeFile = null }) {
  const guests = new Map(); // workspaceId -> { guest, ownerId, driver }
  const attachWaiters = new Map(); // workspaceId -> [{ resolve, reject, timer }]

  function entryFor(workspaceId) {
    const entry = guests.get(workspaceId);
    if (!entry || entry.guest.isDestroyed()) {
      guests.delete(workspaceId);
      throw new Error("The preview pane for this Thread is not open. Open the Thread's Preview tab in Croki first.");
    }
    return entry;
  }

  function attach(ownerId, input = {}) {
    const workspaceId = String(input.workspaceId ?? "").trim();
    const webContentsId = Number(input.webContentsId);
    if (!workspaceId || !Number.isInteger(webContentsId)) throw new Error("Preview attachment needs a workspace and its webview.");
    const guest = webContentsById(webContentsId);
    if (!guest || guest.isDestroyed()) throw new Error("That preview webview no longer exists.");
    if (guest.hostWebContents?.id !== ownerId) throw new Error("Preview webviews must belong to the Croki window.");
    if (guest.session !== electronSession.fromPartition(partitionFor(workspaceId))) {
      throw new Error("Preview webviews must use their own workspace partition.");
    }
    const previous = guests.get(workspaceId);
    if (previous?.guest === guest) return { attached: true };
    previous?.driver.detach();

    // The guest never opens windows and never leaves loopback; anything else is refused.
    guest.setWindowOpenHandler(() => ({ action: "deny" }));
    guest.on("will-navigate", (event, url) => {
      try { loopbackPreviewUrl(url); } catch { event.preventDefault(); }
    });
    guest.once("destroyed", () => {
      const current = guests.get(workspaceId);
      if (current?.guest === guest) guests.delete(workspaceId);
    });
    const driver = createPreviewDriver({
      webContents: guest,
      installExpression,
      injectedGlobal: INJECTED_GLOBAL,
      platform,
      getFocusedWebContents,
    });
    guests.set(workspaceId, { guest, ownerId, driver });
    for (const waiter of attachWaiters.get(workspaceId) ?? []) {
      clearTimeout(waiter.timer);
      waiter.resolve(guests.get(workspaceId));
    }
    attachWaiters.delete(workspaceId);
    return { attached: true };
  }

  function detach(ownerId, workspaceId) {
    const entry = guests.get(String(workspaceId ?? ""));
    if (!entry || entry.ownerId !== ownerId) return { detached: false };
    entry.driver.detach();
    guests.delete(String(workspaceId));
    return { detached: true };
  }

  function waitForAttach(workspaceId) {
    const existing = guests.get(workspaceId);
    if (existing && !existing.guest.isDestroyed()) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = attachWaiters.get(workspaceId) ?? [];
        attachWaiters.set(workspaceId, waiters.filter((waiter) => waiter.timer !== timer));
        reject(new Error("The preview pane did not open. Open this Thread's Preview tab in Croki, then retry."));
      }, ATTACH_WAIT_MS);
      const waiters = attachWaiters.get(workspaceId) ?? [];
      waiters.push({ resolve, reject, timer });
      attachWaiters.set(workspaceId, waiters);
    });
  }

  async function loadInGuest(entry, url) {
    if (entry.guest.getURL() === url) return;
    // loadURL rejects on main-frame failures (ERR_ABORTED -3 excepted); surface honest errors.
    await entry.guest.loadURL(url).catch((cause) => {
      if (cause && cause.errno === -3) return;
      throw new Error(`The preview could not load ${url}: ${cause?.message || cause}`);
    });
  }

  async function open(workspaceId, input = {}) {
    const port = Number(input.port);
    if (!Number.isInteger(port) || port <= 0 || port >= 65_536) {
      throw new Error("preview_open needs the dev server port your run started (for example 5173).");
    }
    const pathname = typeof input.path === "string" && input.path.startsWith("/") ? input.path : "/";
    const url = loopbackPreviewUrl(`http://127.0.0.1:${port}${pathname}`).toString();
    if (!(await net.hasLoopbackListener(port))) {
      throw new Error(`Nothing is listening on port ${port}. Start the dev server in the worktree first.`);
    }
    await net.waitForHttpReady({ baseUrl: url, timeoutMs: Number(input.timeoutMs) || 30_000 });
    broadcast("preview-open", { workspaceId, url });
    const entry = await waitForAttach(workspaceId);
    await loadInGuest(entry, url);
    return { opened: true, url, title: entry.guest.getTitle() || null };
  }

  async function navigate(workspaceId, input = {}) {
    const entry = entryFor(workspaceId);
    const current = new URL(entry.guest.getURL() || "http://127.0.0.1/");
    const url = loopbackPreviewUrl(input.url ?? new URL(String(input.path ?? "/"), current.origin).toString());
    await loadInGuest(entry, url.toString());
    broadcast("preview-open", { workspaceId, url: url.toString() });
    return { navigated: true, url: url.toString() };
  }

  async function snapshot(workspaceId, worktree) {
    const entry = entryFor(workspaceId);
    const page = await entry.driver.snapshot();
    let screenshotFile = null;
    if (typeof worktree === "string" && worktree) {
      const source = await entry.guest.capturePage();
      const image = source.getSize().width > MAX_SNAPSHOT_WIDTH ? source.resize({ width: MAX_SNAPSHOT_WIDTH }) : source;
      const directory = path.join(worktree, ".drover-preview");
      const file = path.join(directory, `snapshot-${Date.now()}.png`);
      if (path.relative(worktree, file).startsWith("..")) throw new Error("Snapshot files stay inside the worktree.");
      const write = writeFile ?? ((target, data) => { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(target, data); });
      await write(file, image.toPNG());
      screenshotFile = file;
    }
    return { ...page, screenshotFile };
  }

  /** The work-loop broker's host executor: one operation against one workspace's own preview. */
  async function execute({ operation, workspaceId, worktree = null, input = {} }) {
    switch (operation) {
      case "status": {
        const entry = guests.get(workspaceId);
        return entry && !entry.guest.isDestroyed()
          ? { open: true, url: entry.guest.getURL() || null, title: entry.guest.getTitle() || null, loading: entry.guest.isLoading() }
          : { open: false };
      }
      case "open": return open(workspaceId, input);
      case "navigate": return navigate(workspaceId, input);
      case "click": return entryFor(workspaceId).driver.click(input);
      case "type": return entryFor(workspaceId).driver.type(input);
      case "press": return entryFor(workspaceId).driver.press(input);
      case "scroll": return entryFor(workspaceId).driver.scroll(input);
      case "evaluate": return entryFor(workspaceId).driver.evaluateExpression(input);
      case "wait_for": return entryFor(workspaceId).driver.waitFor(input);
      case "snapshot": return snapshot(workspaceId, worktree);
      default: throw new Error(`Unknown preview operation: ${operation}`);
    }
  }

  // --- Element pick -----------------------------------------------------------------------------
  function startPick(ownerId, workspaceId) {
    const entry = entryFor(String(workspaceId ?? ""));
    if (entry.ownerId !== ownerId) throw new Error("This preview belongs to another window.");
    entry.guest.send("drover-preview:start-pick");
    return { picking: true };
  }

  function cancelPick(ownerId, workspaceId) {
    const entry = guests.get(String(workspaceId ?? ""));
    if (!entry || entry.ownerId !== ownerId || entry.guest.isDestroyed()) return { picking: false };
    entry.guest.send("drover-preview:cancel-pick");
    return { picking: false };
  }

  async function handleElementPicked(senderId, annotation, screenshotRect) {
    for (const [workspaceId, entry] of guests) {
      if (entry.guest.isDestroyed() || entry.guest.id !== senderId) continue;
      let screenshot = null;
      if (screenshotRect && Number.isFinite(screenshotRect.width) && screenshotRect.width > 0 && screenshotRect.height > 0) {
        const rect = {
          x: Math.max(0, Math.floor(screenshotRect.x)),
          y: Math.max(0, Math.floor(screenshotRect.y)),
          width: Math.ceil(screenshotRect.width),
          height: Math.ceil(screenshotRect.height),
        };
        const image = await entry.guest.capturePage(rect).catch(() => null);
        if (image && !image.isEmpty()) {
          const png = image.toPNG();
          screenshot = { mimeType: "image/png", data: png.toString("base64"), size: png.length };
        }
      }
      broadcast("preview-annotation", { workspaceId, annotation, screenshot });
      return;
    }
  }

  function stopAll() {
    for (const entry of guests.values()) entry.driver.detach();
    guests.clear();
    for (const waiters of attachWaiters.values()) {
      for (const waiter of waiters) { clearTimeout(waiter.timer); waiter.reject(new Error("Croki is quitting.")); }
    }
    attachWaiters.clear();
  }

  return { attach, detach, execute, startPick, cancelPick, handleElementPicked, stopAll, partitionFor };
}

module.exports = { createPreviewSessions, hardenPreviewWebview, loopbackPreviewUrl, partitionFor, PARTITION_PREFIX };
