import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { defaultGraphTemplate } from "../src/graph.mjs";
import { saveFlow } from "../src/flow-store.mjs";
import { createOperatorSession, getOperatorSession } from "../src/operator-store.mjs";
import {
  assertSafeTool,
  createDispatcher,
  createOperatorBridge,
  safeOperatorTools,
} from "../src/operator-mcp.mjs";

describe("operator MCP bridge — safety surface", () => {
  it("exposes no outbound or approval tool to the subprocess", () => {
    const forbidden = /approve|send|publish|deploy|charge/i;
    for (const tool of safeOperatorTools()) {
      assert.ok(!forbidden.test(tool.name), `operator tool "${tool.name}" must not be exposed`);
    }
  });

  it("refuses to expose an outbound-verb tool by name", () => {
    assert.throws(() => assertSafeTool("approve_gate"), /Refusing to expose/);
    assert.throws(() => assertSafeTool("send_email"), /Refusing to expose/);
  });

  it("requires a session id", () => {
    assert.throws(() => createOperatorBridge({}), /GTM_IDE_OPERATOR_SESSION/);
  });
});

describe("operator MCP bridge — tool routing against the durable session", () => {
  let parent;
  let options;
  let session;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-mcp-"));
    options = { root: parent };
    saveFlow(defaultGraphTemplate(), options);
    session = createOperatorSession({ goal: "Inspect the graph.", graphId: defaultGraphTemplate().id }, options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("routes a tool call through executeOperatorTool and persists to the session", async () => {
    const bridge = createOperatorBridge({ sessionId: session.id, options });
    const { result, pause } = await bridge.callTool("inspect_graph", {});
    assert.ok(result.graph, "expected the inspected graph back");
    assert.equal(pause, false);
    const persisted = getOperatorSession(session.id, options);
    assert.ok(persisted.events.some((event) => event.type === "inspection"));
  });

  it("rejects an unknown tool", async () => {
    const bridge = createOperatorBridge({ sessionId: session.id, options });
    await assert.rejects(() => bridge.callTool("delete_everything", {}), /Unknown operator tool/);
  });

  it("serves tools/list and tools/call over JSON-RPC", async () => {
    const bridge = createOperatorBridge({ sessionId: session.id, options });
    const written = [];
    const dispatch = createDispatcher(bridge, (text) => written.push(JSON.parse(text)));

    await dispatch({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    assert.ok(written[0].result.tools.length > 0);
    assert.ok(written[0].result.tools.every((tool) => tool.inputSchema));

    await dispatch({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "inspect_product", arguments: {} } });
    const callResponse = written[1].result;
    assert.ok(callResponse.content[0].text.length > 0);
  });
});
