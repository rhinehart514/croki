import assert from "node:assert/strict";
import { test } from "node:test";

import { createFirmTools } from "../../src/firm/mcp-tools.mjs";

test("architecture MCP tools expose qualified reads and proposal-only writes", async () => {
  const calls = [];
  const tools = createFirmTools({
    brainGet: async (path) => { calls.push(["GET", path]); return { ok: true }; },
    brainPost: async (path, body) => { calls.push(["POST", path, body]); return { ok: true }; },
  });
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  await byName.get("read_venture_architecture").handler({ ventureId: "venture-a" });
  await byName.get("read_architecture_context").handler({ ventureId: "venture-a", architectureId: "motion-one", stepId: "entry" });
  await byName.get("propose_architecture_change").handler({ ventureId: "venture-a", baseRevision: 3, intent: "Clarify entry", operations: [{ op: "update-element", elementId: "motion-one", value: { entry: "Useful work" } }], evidenceRefs: ["repository:src/product.ts#L4"], expectedExecutionEffect: "Bounds the next drive", unresolvedAssumptions: ["Founder has not confirmed audience"] });
  await byName.get("list_architecture_proposals").handler({ ventureId: "venture-a" });
  await byName.get("explain_architecture_pressure").handler({ ventureId: "venture-a", architectureId: "motion-one" });
  assert.deepEqual(calls, [
    ["GET", "/api/ventures/venture-a/architecture"],
    ["GET", "/api/ventures/venture-a/architecture/context?id=motion-one&stepId=entry"],
    ["POST", "/api/ventures/venture-a/architecture/proposals", {
      baseRevision: 3,
      intent: "Clarify entry",
      operations: [{ op: "update-element", elementId: "motion-one", value: { entry: "Useful work" } }],
      evidenceRefs: ["repository:src/product.ts#L4"],
      expectedExecutionEffect: "Bounds the next drive",
      unresolvedAssumptions: ["Founder has not confirmed audience"],
    }],
    ["GET", "/api/ventures/venture-a/architecture/proposals"],
    ["GET", "/api/ventures/venture-a/architecture/pressure?subjectId=motion-one"],
  ]);
  assert.equal(byName.has("apply_architecture_change"), false);
  assert.equal(tools.some((tool) => /decide|release|approve|deploy/i.test(tool.name)), false);
});
