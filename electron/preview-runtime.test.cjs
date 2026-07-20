const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { createPreviewRuntime, previewBounds, previewUrl } = require("./preview-runtime.cjs");

class FakeWebContents extends EventEmitter {
  constructor() { super(); this.url = ""; this.closed = false; }
  setWindowOpenHandler(handler) { this.windowOpenHandler = handler; }
  getURL() { return this.url; }
  async loadURL(url) {
    this.url = url;
    this.emit("did-start-loading");
    this.emit("did-navigate", {}, url);
    this.emit("did-stop-loading");
  }
  reload() { this.emit("did-start-loading"); this.emit("did-stop-loading"); }
  close() { this.closed = true; }
}

class FakeView {
  constructor(options) { this.options = options; this.webContents = new FakeWebContents(); }
  setBounds(bounds) { this.bounds = bounds; }
}

test("preview runtime owns one sandboxed native view and externalizes cross-origin navigation", async () => {
  const children = [];
  const external = [];
  const states = [];
  const window = {
    isDestroyed: () => false,
    contentView: {
      addChildView: (view) => { if (!children.includes(view)) children.push(view); },
      removeChildView: (view) => { const index = children.indexOf(view); if (index >= 0) children.splice(index, 1); },
    },
  };
  const runtime = createPreviewRuntime({
    WebContentsView: FakeView,
    getWindow: (ownerId) => ownerId === 3 ? window : null,
    shell: { openExternal: async (url) => { external.push(url); } },
    send: (_ownerId, channel, payload) => states.push({ channel, payload }),
  });

  await runtime.show(3, { workspaceId: "workspace-1", url: "http://127.0.0.1:3000", bounds: { x: 10, y: 20, width: 640, height: 480 } });
  assert.equal(children.length, 1);
  const view = children[0];
  assert.equal(view.options.webPreferences.sandbox, true);
  assert.deepEqual(view.bounds, { x: 10, y: 20, width: 640, height: 480 });
  assert.ok(states.some((event) => event.channel === "preview-state" && event.payload.status === "ready"));

  let prevented = false;
  view.webContents.emit("will-navigate", { preventDefault: () => { prevented = true; } }, "https://example.com/docs");
  assert.equal(prevented, true);
  assert.deepEqual(external, ["https://example.com/docs"]);
  runtime.hide(3);
  assert.equal(children.length, 0);
  runtime.stopAll();
  assert.equal(view.webContents.closed, true);
});

test("preview validation rejects privileged schemes and invalid geometry", () => {
  assert.throws(() => previewUrl("file:///tmp/index.html"), /HTTP or HTTPS/);
  assert.throws(() => previewUrl("https://user:secret@example.com"), /credentials/);
  assert.throws(() => previewBounds({ x: -1, y: 0, width: 10, height: 10 }), /bounds/);
});
