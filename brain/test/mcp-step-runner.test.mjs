// The `mcp` step kind run path: read-classified tools run free, write-classified tools
// are refused (the founder gate, not a silent run-path send), and with no MCP runtime
// attached the kind reports the gap honestly instead of faking a result.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultStepRuntime,
  makeStepRuntime,
  createStepRuntime,
  createMcpStepRunner,
} from "../src/step-runners.mjs";

// A fake registry: two tools on one server, one read, one write — mirroring what
// mcp-store/effectiveClass would hand back.
function fakeResolve(node) {
  const server = { id: "clay", name: "Clay", command: "clay-mcp", args: [] };
  const tools = {
    "search_people": { name: "search_people", class: "read", effectiveClass: "read" },
    "send_message": { name: "send_message", class: "write", effectiveClass: "write" },
  };
  const toolName = node.config?.tool ?? node.ref;
  const tool = tools[toolName];
  if (!tool) return null;
  return { server, tool, effectiveClass: tool.effectiveClass };
}

test("read-classified MCP tool runs and returns items through the step runtime", async () => {
  const calls = [];
  const runner = createMcpStepRunner({
    resolveTool: fakeResolve,
    callTool: async ({ name, args }) => {
      calls.push({ name, args });
      return { content: [{ type: "text", text: "Ada Lovelace" }, { type: "text", text: "Grace Hopper" }] };
    },
  });
  const runtime = createStepRuntime({ mcpRunner: runner });

  const out = await runtime.mcp(
    { kind: "mcp", ref: "search_people", config: { tool: "search_people", args: { q: "founders" } } },
    [],
    {},
  );

  assert.equal(out.ok, true);
  assert.equal(out.items.length, 2);
  assert.deepEqual(out.items.map((i) => i.text), ["Ada Lovelace", "Grace Hopper"]);
  assert.equal(out.meta.kind, "mcp");
  assert.equal(out.meta.class, "read");
  // It actually transported the call (read runs free).
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, { q: "founders" });
});

test("read-classified tool passes structuredContent through verbatim", async () => {
  const runner = createMcpStepRunner({
    resolveTool: fakeResolve,
    callTool: async () => ({ structuredContent: [{ id: 1 }, { id: 2 }] }),
  });
  const out = await runner({ kind: "mcp", ref: "search_people", config: { tool: "search_people" } }, [], {});
  assert.equal(out.ok, true);
  assert.deepEqual(out.items, [{ id: 1 }, { id: 2 }]);
});

test("write-classified MCP tool is REFUSED, never executed", async () => {
  let transported = false;
  const runner = createMcpStepRunner({
    resolveTool: fakeResolve,
    callTool: async () => { transported = true; return { content: [{ type: "text", text: "sent!" }] }; },
  });

  const out = await runner(
    { kind: "mcp", ref: "send_message", config: { tool: "send_message", args: { to: "x" } } },
    [],
    {},
  );

  // The wall held: no transport happened.
  assert.equal(transported, false, "a write-class tool must not be called on the run path");
  assert.equal(out.ok, false);
  assert.equal(out.blocked, true);
  assert.equal(out.items.length, 0);
  assert.match(out.error, /founder gate/);
  assert.equal(out.meta.class, "write");
  assert.equal(out.meta.blocked, true);
});

test("unclassified / unknown tool is also refused (fail-safe toward the gate)", async () => {
  const runner = createMcpStepRunner({
    resolveTool: () => ({ server: { id: "s" }, tool: { name: "mystery" }, effectiveClass: null }),
    callTool: async () => { throw new Error("should not be called"); },
  });
  const out = await runner({ kind: "mcp", ref: "mystery" }, [], {});
  assert.equal(out.ok, false);
  assert.equal(out.blocked, true);
});

test("blank default reports honestly when no MCP runtime is attached", async () => {
  // The honest-blank default kind.
  const blank = await defaultStepRuntime.mcp({ ref: "search_people" });
  assert.equal(blank.ok, false);
  assert.equal(blank.items.length, 0);
  assert.match(blank.error, /needs an MCP runtime/);

  // createStepRuntime with no mcpRunner falls back to that same honest blank.
  const runtime = createStepRuntime({});
  const out = await runtime.mcp({ ref: "search_people" });
  assert.equal(out.ok, false);
  assert.match(out.error, /needs an MCP runtime/);

  // And the runner built with no seams injected also degrades honestly.
  const runnerNoSeams = createMcpStepRunner({});
  const out2 = await runnerNoSeams({ ref: "search_people" }, [], {});
  assert.equal(out2.ok, false);
  assert.match(out2.error, /needs an MCP runtime/);
});

test("makeStepRuntime keeps the honest-blank mcp default among overrides", async () => {
  const runtime = makeStepRuntime({ agent: async () => ({ ok: true, items: [] }) });
  const out = await runtime.mcp({ ref: "x" });
  assert.equal(out.ok, false);
  assert.match(out.error, /needs an MCP runtime/);
});
