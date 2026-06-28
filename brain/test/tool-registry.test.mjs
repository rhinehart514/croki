import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createRegistry,
  registerTool,
  recordToolUse,
  findReferences,
  pruneUnused,
} from "../src/tool-registry.mjs";

const scorer = {
  id: "tool-score-lead",
  name: "score-lead",
  provenance: "self-built",
  references: [{ type: "agent", id: "gtm-enrich" }],
};

test("register then record use tracks telemetry", () => {
  let reg = createRegistry();
  reg = registerTool(reg, scorer);
  assert.equal(reg.tools["tool-score-lead"].uses, 0);
  reg = recordToolUse(reg, "tool-score-lead");
  reg = recordToolUse(reg, "tool-score-lead");
  assert.equal(reg.tools["tool-score-lead"].uses, 2);
  assert.ok(reg.tools["tool-score-lead"].lastUsedAt);
});

test("re-registering merges and preserves the use count", () => {
  let reg = createRegistry();
  reg = registerTool(reg, scorer);
  reg = recordToolUse(reg, "tool-score-lead");
  reg = registerTool(reg, { ...scorer, references: [{ type: "channel", id: "outbound" }] });
  assert.equal(reg.tools["tool-score-lead"].uses, 1); // not reset
  assert.equal(findReferences(reg, "tool-score-lead").length, 2); // deduped union
});

test("findReferences returns referencing agents/channels", () => {
  let reg = createRegistry();
  reg = registerTool(reg, scorer);
  const refs = findReferences(reg, "tool-score-lead");
  assert.deepEqual(refs, [{ type: "agent", id: "gtm-enrich" }]);
});

test("pruneUnused drops unused self-built tools with a note, never silently", () => {
  let reg = createRegistry();
  reg = registerTool(reg, scorer); // 0 uses, self-built
  reg = registerTool(reg, { id: "tool-used", name: "used", provenance: "self-built" });
  reg = recordToolUse(reg, "tool-used");
  const { registry, dropped } = pruneUnused(reg, { minUses: 1 });
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].id, "tool-score-lead");
  assert.match(dropped[0].note, /Pruned/);
  assert.ok(!registry.tools["tool-score-lead"]); // gone
  assert.ok(registry.tools["tool-used"]); // kept
});

test("founder-shipped tools are never pruned even with zero uses", () => {
  let reg = createRegistry();
  reg = registerTool(reg, { id: "tool-founder", name: "shipped", provenance: "founder-shipped" });
  const { registry, dropped } = pruneUnused(reg, { minUses: 1 });
  assert.equal(dropped.length, 0);
  assert.ok(registry.tools["tool-founder"]);
});

test("operations on unknown tools throw", () => {
  const reg = createRegistry();
  assert.throws(() => recordToolUse(reg, "nope"));
  assert.throws(() => findReferences(reg, "nope"));
  assert.throws(() => registerTool(reg, { name: "no id" }));
});
