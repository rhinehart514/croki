import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MCPClient } from "../src/mcp-client.mjs";

// A fake transport that answers requests like a tiny MCP server, so the client
// is exercised end-to-end without spawning a process.
function fakeTransport(responder) {
  let onMessage = () => {};
  const closeHandlers = [];
  return {
    transport: {
      send(message) {
        if (message.id == null) return; // notification — nothing to answer
        const result = responder(message);
        // reply asynchronously, like a real pipe
        queueMicrotask(() => onMessage({ jsonrpc: "2.0", id: message.id, ...result }));
      },
      onMessage(handler) { onMessage = handler; },
      onClose(handler) { closeHandlers.push(handler); },
      close() { for (const h of closeHandlers) h(); },
    },
    fireClose() { for (const h of closeHandlers) h(); },
  };
}

describe("MCP client — connecting OUT to a server", () => {
  it("completes the initialize handshake and captures serverInfo", async () => {
    const { transport } = fakeTransport((msg) => {
      if (msg.method === "initialize") {
        return { result: { serverInfo: { name: "clay", version: "1.0" }, capabilities: { tools: {} } } };
      }
      return { result: {} };
    });
    const client = new MCPClient(transport);
    await client.initialize();
    assert.equal(client.initialized, true);
    assert.equal(client.serverInfo.name, "clay");
  });

  it("lists tools", async () => {
    const { transport } = fakeTransport((msg) => {
      if (msg.method === "initialize") return { result: {} };
      if (msg.method === "tools/list") {
        return { result: { tools: [{ name: "find_companies" }, { name: "update_record" }] } };
      }
      return { result: {} };
    });
    const client = new MCPClient(transport);
    await client.initialize();
    const tools = await client.listTools();
    assert.equal(tools.length, 2);
    assert.equal(tools[0].name, "find_companies");
  });

  it("calls a tool and returns its result", async () => {
    const { transport } = fakeTransport((msg) => {
      if (msg.method === "initialize") return { result: {} };
      if (msg.method === "tools/call") {
        return { result: { content: [{ type: "text", text: `called ${msg.params.name}` }] } };
      }
      return { result: {} };
    });
    const client = new MCPClient(transport);
    await client.initialize();
    const out = await client.callTool("get_table", { id: 7 });
    assert.match(out.content[0].text, /called get_table/);
  });

  it("surfaces a server error as a rejection", async () => {
    const { transport } = fakeTransport((msg) => {
      if (msg.method === "initialize") return { result: {} };
      return { error: { code: -32601, message: "Method not found" } };
    });
    const client = new MCPClient(transport);
    await client.initialize();
    await assert.rejects(() => client.listTools(), /Method not found/);
  });

  it("rejects pending requests when the transport closes", async () => {
    // a transport that never answers, so the request stays pending until close
    let onMessage = () => {};
    const closeHandlers = [];
    const transport = {
      send() {},
      onMessage(h) { onMessage = h; },
      onClose(h) { closeHandlers.push(h); },
      close() {},
    };
    const client = new MCPClient(transport);
    const pending = client.request("tools/list", {}, { timeoutMs: 5000 });
    for (const h of closeHandlers) h(); // simulate the pipe dying
    await assert.rejects(() => pending, /transport closed/);
  });
});
