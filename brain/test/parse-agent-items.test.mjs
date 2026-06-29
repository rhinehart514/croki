import { test } from "node:test";
import assert from "node:assert/strict";

import { parseAgentItems } from "../src/agent-bridge.mjs";

test("a bare JSON array is the items", () => {
  assert.deepEqual(parseAgentItems('[{"a":1},{"a":2}]'), [{ a: 1 }, { a: 2 }]);
});

test("a fenced ```json array is unwrapped", () => {
  const r = parseAgentItems("Here you go:\n```json\n[{\"name\":\"X\"}]\n```\n");
  assert.deepEqual(r, [{ name: "X" }]);
});

test("an object that WRAPS the list yields the inner array (the dropped-data bug)", () => {
  assert.deepEqual(parseAgentItems('{"prospects":[{"name":"A"},{"name":"B"}]}'), [{ name: "A" }, { name: "B" }]);
  assert.deepEqual(parseAgentItems('{"summary":"found 1","items":[{"x":9}],"note":"ok"}'), [{ x: 9 }]);
});

test("a single object (the agent found exactly one) becomes a one-item array", () => {
  assert.deepEqual(parseAgentItems('{"name":"Solo Op","company":"Acme"}'), [{ name: "Solo Op", company: "Acme" }]);
});

test("prose with an embedded array still extracts the array", () => {
  assert.deepEqual(parseAgentItems('I found these:\n[{"name":"A"}]\nThat\'s all.'), [{ name: "A" }]);
});

test("genuinely empty or non-JSON returns []", () => {
  assert.deepEqual(parseAgentItems(""), []);
  assert.deepEqual(parseAgentItems("I could not find any operators."), []);
});

test("the exact live output that was being dropped now parses to 2 items", () => {
  const live = `[
  { "name": "Advanced Exterminating", "company": "Advanced Exterminating, Queens / NYC", "why_now": "seasonal roach/fly surge + hiring" },
  { "name": "Standard Pest Management", "company": "Standard Pest Management, NYC", "why_now": "DOH inspection season + active hiring" }
]`;
  assert.equal(parseAgentItems(live).length, 2);
});
