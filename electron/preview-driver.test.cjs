const assert = require("node:assert/strict");
const test = require("node:test");
const { createPreviewDriver, MAX_EVALUATION_BYTES } = require("./preview-driver.cjs");

// A fake guest WebContents whose debugger answers Runtime.evaluate through `respond(expression)`
// and records every CDP command in order.
function fakeGuest(respond) {
  const commands = [];
  let attached = false;
  return {
    id: 11,
    focusCalls: 0,
    commands,
    isDestroyed: () => false,
    focus() { this.focusCalls += 1; commands.push({ method: "guest.focus" }); },
    debugger: {
      isAttached: () => attached,
      attach: () => { attached = true; },
      detach: () => { attached = false; },
      sendCommand: async (method, params) => {
        commands.push({ method, params });
        if (method === "Runtime.evaluate") return { result: { value: respond(params.expression) } };
        return {};
      },
    },
  };
}

const driverFor = (guest, overrides = {}) => createPreviewDriver({
  webContents: guest,
  installExpression: () => "INSTALL_PLAYWRIGHT",
  injectedGlobal: "__droverPlaywrightInjected",
  platform: "darwin",
  sleep: () => Promise.resolve(),
  ...overrides,
});

test("click by coordinates dispatches a mouse press and release inside the viewport", async () => {
  const guest = fakeGuest((expression) => (expression.includes("innerWidth") ? { width: 800, height: 600 } : null));
  const result = await driverFor(guest).click({ x: 40, y: 50 });
  assert.deepEqual(result, { clicked: true, x: 40, y: 50 });
  const mouse = guest.commands.filter((c) => c.method === "Input.dispatchMouseEvent");
  assert.deepEqual(mouse.map((c) => c.params.type), ["mousePressed", "mouseReleased"]);
  assert.equal(mouse[0].params.x, 40);
  await assert.rejects(driverFor(guest).click({ x: 900, y: 50 }), /outside the 800x600 viewport/);
});

test("click by selector resolves the element center through the injected selector engine", async () => {
  const guest = fakeGuest((expression) => {
    if (expression.startsWith("Boolean(globalThis.")) return false; // forces installation
    if (expression === "INSTALL_PLAYWRIGHT") return true;
    if (expression.includes("parseSelector")) return { x: 12, y: 34 };
    if (expression.includes("innerWidth")) return { width: 800, height: 600 };
    return null;
  });
  const result = await driverFor(guest).click({ selector: "button.save" });
  assert.deepEqual(result, { clicked: true, x: 12, y: 34 });
  assert.ok(guest.commands.some((c) => c.method === "Runtime.evaluate" && c.params.expression === "INSTALL_PLAYWRIGHT"));
});

test("click reports a missing or hidden element instead of clicking nothing", async () => {
  const guest = fakeGuest((expression) => {
    if (expression.startsWith("Boolean(globalThis.")) return true;
    if (expression.includes("parseSelector")) return { notFound: true };
    return null;
  });
  await assert.rejects(driverFor(guest).click({ selector: "#gone" }), /No visible, enabled element matched/);
});

test("type surfaces the page-side verdicts as honest errors", async () => {
  const outcomes = [{ ok: true }, { notEditable: true }, { notFound: true }];
  const guest = fakeGuest((expression) => {
    if (expression.startsWith("Boolean(globalThis.")) return true;
    if (expression.includes("insertText")) return outcomes.shift();
    return null;
  });
  const driver = driverFor(guest);
  assert.deepEqual(await driver.type({ text: "hello" }), { typed: true });
  await assert.rejects(driver.type({ text: "x", selector: "#readonly" }), /not an editable text field/);
  await assert.rejects(driver.type({ text: "x", selector: "#gone" }), /No element matched/);
});

test("press focuses the guest, dispatches down then up, and always restores prior focus", async () => {
  const previous = { id: 99, focused: 0, isDestroyed: () => false, focus() { this.focused += 1; } };
  const guest = fakeGuest(() => null);
  const result = await driverFor(guest, { getFocusedWebContents: () => previous }).press({ key: "Enter" });
  assert.deepEqual(result, { pressed: "Enter" });
  const methods = guest.commands.map((c) => c.method);
  const downIndex = guest.commands.findIndex((c) => c.method === "Input.dispatchKeyEvent" && c.params.type === "keyDown");
  const upIndex = guest.commands.findIndex((c) => c.method === "Input.dispatchKeyEvent" && c.params.type === "keyUp");
  assert.ok(methods.indexOf("guest.focus") < downIndex, "guest is focused before the key goes down");
  assert.ok(methods.indexOf("Page.bringToFront") < downIndex);
  assert.ok(downIndex < upIndex, "keyUp always follows keyDown");
  assert.equal(previous.focused, 1, "the previously focused renderer gets focus back");
  const emulation = guest.commands.filter((c) => c.method === "Emulation.setFocusEmulationEnabled");
  assert.deepEqual(emulation.map((c) => c.params.enabled), [true, false]);
});

test("evaluate returns the value and refuses oversized results", async () => {
  const answers = new Map([["1 + 1", 2], ["big", "x".repeat(MAX_EVALUATION_BYTES + 10)]]);
  const guest = fakeGuest((expression) => answers.get(expression));
  const driver = driverFor(guest);
  assert.deepEqual(await driver.evaluateExpression({ expression: "1 + 1" }), { value: 2 });
  await assert.rejects(driver.evaluateExpression({ expression: "big" }), /keep results under/);
});

test("evaluate surfaces page exceptions instead of returning undefined", async () => {
  const guest = fakeGuest(() => null);
  guest.debugger.sendCommand = async (method) => {
    if (method === "Runtime.evaluate") return { exceptionDetails: { text: "ReferenceError: nope" } };
    return {};
  };
  await assert.rejects(driverFor(guest).evaluateExpression({ expression: "nope" }), /ReferenceError: nope/);
});

test("waitFor polls until the condition holds and times out honestly", async () => {
  let polls = 0;
  const guest = fakeGuest(() => ({ matched: ++polls >= 3 }));
  assert.deepEqual(await driverFor(guest).waitFor({ text: "Saved", timeoutMs: 5_000 }), { matched: true });
  assert.equal(polls, 3);

  const never = fakeGuest(() => ({ matched: false }));
  await assert.rejects(driverFor(never).waitFor({ text: "Never", timeoutMs: 1 }), /did not hold within 1ms/);
});

test("a failed operation does not poison the queue for the next one", async () => {
  const guest = fakeGuest((expression) => (expression.includes("innerWidth") ? { width: 800, height: 600 } : null));
  const driver = driverFor(guest);
  await assert.rejects(driver.click({ x: -5, y: 0 }));
  assert.deepEqual(await driver.click({ x: 1, y: 1 }), { clicked: true, x: 1, y: 1 });
});

test("snapshot returns the page projection from the guest", async () => {
  const page = { url: "http://127.0.0.1:5173/", title: "App", loading: false, visibleText: "hi", interactiveElements: [] };
  const guest = fakeGuest((expression) => (expression.includes("interactiveElements") ? page : null));
  assert.deepEqual(await driverFor(guest).snapshot(), page);
});
