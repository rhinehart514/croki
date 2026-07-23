const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { createPreviewSessions, hardenPreviewWebview, loopbackPreviewUrl, partitionFor } = require("./preview-sessions.cjs");

const PICK_PRELOAD = "/app/electron/preview-pick-preload.cjs";

test("preview URLs are loopback dev servers only", () => {
  assert.equal(loopbackPreviewUrl("http://127.0.0.1:5173/app").hostname, "127.0.0.1");
  assert.equal(loopbackPreviewUrl("http://localhost:3000").hostname, "localhost");
  assert.equal(loopbackPreviewUrl("https://127.0.0.1:8443/").protocol, "https:");
  assert.throws(() => loopbackPreviewUrl("http://example.com"), /only opens local dev servers/);
  assert.throws(() => loopbackPreviewUrl("http://user:pw@127.0.0.1:5173/"), /credentials/);
  assert.throws(() => loopbackPreviewUrl("file:///etc/passwd"), /HTTP or HTTPS/);
  assert.throws(() => loopbackPreviewUrl("not a url"), /valid preview URL/);
});

test("will-attach-webview forces every security preference and refuses foreign partitions", () => {
  const webPreferences = { preload: "/evil.js", preloadURL: "file:///evil.js", nodeIntegration: true, contextIsolation: false, sandbox: false, webSecurity: false };
  const params = { partition: partitionFor("workspace-1"), src: "http://127.0.0.1:5173/", preload: "/evil.js" };
  assert.equal(hardenPreviewWebview(webPreferences, params, PICK_PRELOAD), true);
  assert.equal(webPreferences.preload, PICK_PRELOAD);
  assert.equal("preloadURL" in webPreferences, false);
  assert.equal("preload" in params, false);
  assert.equal(webPreferences.nodeIntegration, false);
  assert.equal(webPreferences.contextIsolation, true);
  assert.equal(webPreferences.sandbox, true);
  assert.equal(webPreferences.webSecurity, true);
  assert.equal(webPreferences.allowRunningInsecureContent, false);

  assert.equal(hardenPreviewWebview({}, { partition: "persist:founder" }, PICK_PRELOAD), false, "non-preview partitions never attach");
  assert.equal(hardenPreviewWebview({}, { partition: "drover-preview:" }, PICK_PRELOAD), false, "a bare prefix names no workspace");
  assert.equal(hardenPreviewWebview({}, {}, PICK_PRELOAD), false, "a missing partition never attaches");
  assert.equal(hardenPreviewWebview({}, { partition: partitionFor("w"), src: "https://example.com" }, PICK_PRELOAD), false, "non-loopback src never attaches");
  assert.equal(hardenPreviewWebview({}, { partition: partitionFor("w"), src: "about:blank" }, PICK_PRELOAD), true, "the empty guest may attach before its first load");
});

// --- Harness -------------------------------------------------------------------------------------

function makeImage({ width = 640 } = {}) {
  return {
    isEmpty: () => false,
    getSize: () => ({ width, height: 480 }),
    resize: () => makeImage({ width: 1280 }),
    toPNG: () => Buffer.from("png-bytes"),
  };
}

function makeGuest({ id, ownerId, session, evaluate = () => null }) {
  let attached = false;
  const guest = {
    id,
    destroyed: false,
    url: "",
    sent: [],
    loaded: [],
    hostWebContents: { id: ownerId },
    session,
    windowOpenHandler: null,
    listeners: new Map(),
    isDestroyed: () => guest.destroyed,
    setWindowOpenHandler: (handler) => { guest.windowOpenHandler = handler; },
    on: (event, listener) => { guest.listeners.set(event, listener); },
    once: (event, listener) => { guest.listeners.set(event, listener); },
    getURL: () => guest.url,
    getTitle: () => "Dev app",
    isLoading: () => false,
    loadURL: async (url) => { guest.loaded.push(url); guest.url = url; },
    send: (channel) => guest.sent.push(channel),
    capturePage: async () => makeImage(),
    focus: () => undefined,
    debugger: {
      isAttached: () => attached,
      attach: () => { attached = true; },
      detach: () => { attached = false; },
      sendCommand: async (method, params) => (method === "Runtime.evaluate" ? { result: { value: evaluate(params.expression) } } : {}),
    },
  };
  return guest;
}

function makeHarness({ evaluate, net } = {}) {
  const partitions = new Map();
  const electronSession = { fromPartition: (name) => { if (!partitions.has(name)) partitions.set(name, { name }); return partitions.get(name); } };
  const guest = makeGuest({ id: 11, ownerId: 7, session: electronSession.fromPartition(partitionFor("workspace-1")), evaluate });
  const broadcasts = [];
  const writes = [];
  const sessions = createPreviewSessions({
    electronSession,
    webContentsById: (id) => (id === guest.id ? guest : null),
    getFocusedWebContents: () => null,
    broadcast: (channel, payload) => broadcasts.push({ channel, payload }),
    net: { hasLoopbackListener: async () => true, waitForHttpReady: async () => ({ ready: true, status: 200 }), ...net },
    platform: "darwin",
    installExpression: () => "INSTALL_PLAYWRIGHT",
    writeFile: async (file, data) => writes.push({ file, data }),
  });
  return { sessions, guest, electronSession, broadcasts, writes };
}

test("attach validates owner and partition; operations without a pane fail honestly", async () => {
  const { sessions, guest, electronSession } = makeHarness();
  await assert.rejects(sessions.execute({ operation: "click", workspaceId: "workspace-1", input: { x: 1, y: 1 } }), /Preview tab in Drover first/);
  assert.throws(() => sessions.attach(999, { workspaceId: "workspace-1", webContentsId: guest.id }), /belong to the Drover window/);
  assert.throws(() => sessions.attach(7, { workspaceId: "workspace-2", webContentsId: guest.id }), /own workspace partition/);
  assert.throws(() => sessions.attach(7, { workspaceId: "workspace-1", webContentsId: 404 }), /no longer exists/);
  assert.deepEqual(sessions.attach(7, { workspaceId: "workspace-1", webContentsId: guest.id }), { attached: true });
  assert.deepEqual(sessions.attach(7, { workspaceId: "workspace-1", webContentsId: guest.id }), { attached: true }, "re-registration after navigation is idempotent");
  assert.equal(typeof guest.windowOpenHandler, "function");
  assert.deepEqual(guest.windowOpenHandler(), { action: "deny" }, "the guest never opens windows");
  assert.equal(electronSession.fromPartition(partitionFor("workspace-1")), guest.session);
});

test("an attached guest refuses navigation away from loopback", () => {
  const { sessions, guest } = makeHarness();
  sessions.attach(7, { workspaceId: "workspace-1", webContentsId: guest.id });
  let prevented = false;
  guest.listeners.get("will-navigate")({ preventDefault: () => { prevented = true; } }, "https://example.com/exfil");
  assert.equal(prevented, true);
  prevented = false;
  guest.listeners.get("will-navigate")({ preventDefault: () => { prevented = true; } }, "http://127.0.0.1:5173/next");
  assert.equal(prevented, false);
});

test("open waits for a live listener, tells the renderer, and loads the attached guest", async () => {
  const { sessions, guest, broadcasts } = makeHarness();
  sessions.attach(7, { workspaceId: "workspace-1", webContentsId: guest.id });
  const result = await sessions.execute({ operation: "open", workspaceId: "workspace-1", input: { port: 5173, path: "/app" } });
  assert.deepEqual(result, { opened: true, url: "http://127.0.0.1:5173/app", title: "Dev app" });
  assert.deepEqual(broadcasts, [{ channel: "preview-open", payload: { workspaceId: "workspace-1", url: "http://127.0.0.1:5173/app" } }]);
  assert.deepEqual(guest.loaded, ["http://127.0.0.1:5173/app"]);

  const status = await sessions.execute({ operation: "status", workspaceId: "workspace-1" });
  assert.deepEqual(status, { open: true, url: "http://127.0.0.1:5173/app", title: "Dev app", loading: false });
});

test("open resolves once the renderer attaches its pane, in either order", async () => {
  const { sessions, guest } = makeHarness();
  const pending = sessions.execute({ operation: "open", workspaceId: "workspace-1", input: { port: 5173 } });
  await new Promise((resolve) => setImmediate(resolve));
  sessions.attach(7, { workspaceId: "workspace-1", webContentsId: guest.id });
  assert.deepEqual((await pending).url, "http://127.0.0.1:5173/");
});

test("open refuses a dead port before touching the pane", async () => {
  const { sessions } = makeHarness({ net: { hasLoopbackListener: async () => false } });
  await assert.rejects(
    sessions.execute({ operation: "open", workspaceId: "workspace-1", input: { port: 5199 } }),
    /Nothing is listening on port 5199/,
  );
  await assert.rejects(sessions.execute({ operation: "open", workspaceId: "workspace-1", input: {} }), /needs the dev server port/);
});

test("navigate stays on loopback and unknown operations are refused", async () => {
  const { sessions, guest } = makeHarness();
  sessions.attach(7, { workspaceId: "workspace-1", webContentsId: guest.id });
  guest.url = "http://127.0.0.1:5173/";
  const result = await sessions.execute({ operation: "navigate", workspaceId: "workspace-1", input: { path: "/settings" } });
  assert.equal(result.url, "http://127.0.0.1:5173/settings");
  await assert.rejects(
    sessions.execute({ operation: "navigate", workspaceId: "workspace-1", input: { url: "https://example.com" } }),
    /only opens local dev servers/,
  );
  await assert.rejects(sessions.execute({ operation: "nuke", workspaceId: "workspace-1" }), /Unknown preview operation/);
});

test("snapshot projects the page and keeps its screenshot inside the worktree", async () => {
  const page = { url: "http://127.0.0.1:5173/", title: "Dev app", loading: false, visibleText: "hello", interactiveElements: [] };
  const { sessions, guest, writes } = makeHarness({ evaluate: (expression) => (expression.includes("interactiveElements") ? page : null) });
  sessions.attach(7, { workspaceId: "workspace-1", webContentsId: guest.id });
  const worktree = path.join("/tmp", "drover-worktree");
  const result = await sessions.execute({ operation: "snapshot", workspaceId: "workspace-1", worktree });
  assert.equal(result.title, "Dev app");
  assert.equal(writes.length, 1);
  assert.ok(writes[0].file.startsWith(path.join(worktree, ".drover-preview")), "screenshots live under .drover-preview in the worktree");
  assert.equal(result.screenshotFile, writes[0].file);
});

test("element pick round-trips from the guest to a renderer annotation with a screenshot", async () => {
  const { sessions, guest, broadcasts } = makeHarness();
  sessions.attach(7, { workspaceId: "workspace-1", webContentsId: guest.id });
  assert.deepEqual(sessions.startPick(7, "workspace-1"), { picking: true });
  assert.throws(() => sessions.startPick(999, "workspace-1"), /another window/);
  assert.deepEqual(guest.sent, ["drover-preview:start-pick"]);

  await sessions.handleElementPicked(guest.id, { selector: "#save", comment: "make it green" }, { x: 3.2, y: 4.7, width: 20, height: 10 });
  const annotation = broadcasts.find((event) => event.channel === "preview-annotation");
  assert.equal(annotation.payload.workspaceId, "workspace-1");
  assert.equal(annotation.payload.annotation.selector, "#save");
  assert.equal(annotation.payload.screenshot.mimeType, "image/png");
  assert.equal(annotation.payload.screenshot.data, Buffer.from("png-bytes").toString("base64"));

  await sessions.handleElementPicked(12345, { selector: "#other" }, null);
  assert.equal(broadcasts.filter((event) => event.channel === "preview-annotation").length, 1, "unknown senders never become annotations");

  assert.deepEqual(sessions.cancelPick(7, "workspace-1"), { picking: false });
  assert.deepEqual(guest.sent, ["drover-preview:start-pick", "drover-preview:cancel-pick"]);
});

test("detach and stopAll leave no live guests behind", async () => {
  const { sessions, guest } = makeHarness();
  sessions.attach(7, { workspaceId: "workspace-1", webContentsId: guest.id });
  assert.deepEqual(sessions.detach(999, "workspace-1"), { detached: false }, "another window cannot detach this pane");
  assert.deepEqual(sessions.detach(7, "workspace-1"), { detached: true });
  assert.deepEqual(await sessions.execute({ operation: "status", workspaceId: "workspace-1" }), { open: false });

  sessions.attach(7, { workspaceId: "workspace-1", webContentsId: guest.id });
  sessions.stopAll();
  assert.deepEqual(await sessions.execute({ operation: "status", workspaceId: "workspace-1" }), { open: false });
});
