const assert = require("node:assert/strict");
const test = require("node:test");
const { makePreviewKeySequence } = require("./preview-keyboard.cjs");

test("Enter carries its text so the page receives a real keypress", () => {
  const { keyDown, keyUp } = makePreviewKeySequence({ key: "Enter" });
  assert.equal(keyDown.type, "keyDown");
  assert.equal(keyDown.text, "\r");
  assert.equal(keyDown.unmodifiedText, "\r");
  assert.equal(keyDown.windowsVirtualKeyCode, 13);
  assert.equal(keyUp.type, "keyUp");
  assert.equal(keyUp.key, "Enter");
});

test("non-printable keys dispatch rawKeyDown without text", () => {
  const { keyDown } = makePreviewKeySequence({ key: "ArrowLeft" });
  assert.equal(keyDown.type, "rawKeyDown");
  assert.equal("text" in keyDown, false);
  assert.equal(keyDown.code, "ArrowLeft");
});

test("letters resolve code, keyCode, and shifted casing", () => {
  const plain = makePreviewKeySequence({ key: "a" }).keyDown;
  assert.equal(plain.code, "KeyA");
  assert.equal(plain.windowsVirtualKeyCode, 65);
  assert.equal(plain.text, "a");

  const shifted = makePreviewKeySequence({ key: "a", modifiers: ["Shift"] }).keyDown;
  assert.equal(shifted.key, "A");
  assert.equal(shifted.text, "A");
  assert.equal(shifted.modifiers, 8);
});

test("shifted punctuation resolves through its physical key", () => {
  const { keyDown } = makePreviewKeySequence({ key: "!" });
  assert.equal(keyDown.code, "Digit1");
  assert.equal(keyDown.key, "!");
  assert.equal(keyDown.text, "!");
});

test("non-Shift modifiers suppress text and set the CDP modifier mask", () => {
  const { keyDown } = makePreviewKeySequence({ key: "a", modifiers: ["Control"] });
  assert.equal(keyDown.type, "rawKeyDown");
  assert.equal("text" in keyDown, false);
  assert.equal(keyDown.modifiers, 2);
});

test("Meta chords carry explicit macOS editing commands only on mac", () => {
  const mac = makePreviewKeySequence({ key: "a", modifiers: ["Meta"] }, { isMac: true }).keyDown;
  assert.deepEqual(mac.commands, ["selectAll"]);
  assert.equal(mac.modifiers, 4);

  const linux = makePreviewKeySequence({ key: "a", modifiers: ["Meta"] }, { isMac: false }).keyDown;
  assert.equal("commands" in linux, false);
});

test("function keys and unknown keys still produce a coherent packet", () => {
  assert.equal(makePreviewKeySequence({ key: "F5" }).keyDown.windowsVirtualKeyCode, 116);
  const unknown = makePreviewKeySequence({ key: "MediaPlayPause" }).keyDown;
  assert.equal(unknown.key, "MediaPlayPause");
  assert.equal(unknown.windowsVirtualKeyCode, 0);
});
