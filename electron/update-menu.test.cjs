const assert = require("node:assert/strict");
const test = require("node:test");

const { installUpdateMenu } = require("./update-menu.cjs");

function harness(posture) {
  const items = [{ id: "about" }];
  const submenu = {
    items,
    insert(index, item) {
      this.items.splice(index, 0, item);
    },
  };
  class MenuItem {
    constructor(options) { Object.assign(this, options); }
  }
  let checks = 0;
  const checker = {
    status: () => posture,
    check: async () => { checks += 1; },
  };
  const item = installUpdateMenu({
    app: { getVersion: () => "0.3.4" },
    Menu: { getApplicationMenu: () => ({ items: [{ submenu }] }) },
    MenuItem,
    checker,
    platform: "darwin",
  });
  return { checker, checks: () => checks, item, items };
}

test("production receives one enabled native check action", async () => {
  const value = harness({ channel: "production", canCheck: true });
  assert.equal(value.item.label, "Check for Updates…");
  assert.equal(value.item.enabled, true);
  await value.item.click();
  assert.equal(value.checks(), 1);
  assert.equal(value.item.enabled, true);
  assert.equal(value.items[1].id, "croki-update");
});

test("development identifies itself without gaining a production check path", () => {
  const value = harness({ channel: "development", canCheck: false });
  assert.equal(value.item.label, "Development Build · 0.3.4");
  assert.equal(value.item.enabled, false);
  assert.equal(value.checks(), 0);
});

test("development can expose its exact source identity", () => {
  const items = [{ id: "about" }];
  const submenu = { items, insert(index, item) { this.items.splice(index, 0, item); } };
  const item = installUpdateMenu({
    app: { getVersion: () => "0.3.4" },
    Menu: { getApplicationMenu: () => ({ items: [{ submenu }] }) },
    MenuItem: class { constructor(options) { Object.assign(this, options); } },
    checker: { status: () => ({ channel: "development", canCheck: false }) },
    developmentIdentity: { label: "Development Build · 0.3.4 · 76ecbeaa · modified" },
    platform: "darwin",
  });
  assert.equal(item.label, "Development Build · 0.3.4 · 76ecbeaa · modified");
  assert.equal(item.enabled, false);
});

test("non-mac builds and duplicate installation stay unchanged", () => {
  const value = harness({ channel: "production", canCheck: true });
  assert.equal(installUpdateMenu({
    app: { getVersion: () => "0.3.4" },
    Menu: { getApplicationMenu: () => ({ items: [{ submenu: { items: [] } }] }) },
    MenuItem: class {},
    checker: value.checker,
    platform: "linux",
  }), null);
  assert.equal(installUpdateMenu({
    app: { getVersion: () => "0.3.4" },
    Menu: { getApplicationMenu: () => ({ items: [{ submenu: { items: [{ id: "croki-update" }] } }] }) },
    MenuItem: class {},
    checker: value.checker,
    platform: "darwin",
  }), null);
});
