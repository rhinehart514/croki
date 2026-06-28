/**
 * mcp-client.mjs — GTM IDE as an MCP CLIENT.
 *
 * Until now GTM IDE was only an MCP *server* (mcp.mjs, operator-mcp.mjs): Claude
 * connected IN to drive the engine. This is the other direction — GTM IDE connecting
 * OUT to an external MCP server (Clay, Google Drive, Gmail, …) to list and call its
 * tools. It is the substrate for connectors-as-MCP: the host reaches the tool, the
 * classifier (mcp-classifier.mjs) decides the lane, and the gate holds the writes.
 *
 * Hand-rolled JSON-RPC 2.0 over the stdio transport (newline-delimited), matching the
 * house style of mcp.mjs — no new dependency. The transport is injectable so tests run
 * against a fake and never spawn a process; `stdioTransport` is the real one.
 */

import { spawn } from "node:child_process";

const PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = { name: "gtm-ide", version: "0.1.0" };

/**
 * A transport is { send(message), onMessage(handler), onClose(handler), close() }.
 * The client never touches process details — only frames JSON-RPC over the transport.
 */
export class MCPClient {
  constructor(transport) {
    this.transport = transport;
    this.nextId = 1;
    this.pending = new Map();
    this.initialized = false;
    transport.onMessage((message) => this.#receive(message));
    transport.onClose?.(() => this.#failAll(new Error("MCP transport closed")));
  }

  #receive(message) {
    if (message == null || message.id == null) return; // notification or noise
    const waiter = this.pending.get(message.id);
    if (!waiter) return;
    this.pending.delete(message.id);
    if (message.error) {
      waiter.reject(new Error(message.error.message || `MCP error ${message.error.code}`));
    } else {
      waiter.resolve(message.result);
    }
  }

  #failAll(error) {
    for (const waiter of this.pending.values()) waiter.reject(error);
    this.pending.clear();
  }

  request(method, params = {}, { timeoutMs = 15000 } = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request "${method}" timed out`));
        }
      }, timeoutMs);
      const settle = (fn) => (value) => { clearTimeout(timer); fn(value); };
      this.pending.set(id, { resolve: settle(resolve), reject: settle(reject) });
      this.transport.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method, params = {}) {
    this.transport.send({ jsonrpc: "2.0", method, params });
  }

  /** Handshake: initialize, then the required initialized notification. */
  async initialize() {
    const result = await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
    this.notify("notifications/initialized");
    this.initialized = true;
    this.serverInfo = result?.serverInfo ?? null;
    this.serverCapabilities = result?.capabilities ?? {};
    return result;
  }

  /** List the server's tools (raw MCP descriptors — classify them with mcp-classifier). */
  async listTools() {
    const result = await this.request("tools/list", {});
    return result?.tools ?? [];
  }

  /** Call a tool. The HOST decides whether a call is allowed (gate) — this only transports. */
  async callTool(name, args = {}) {
    return this.request("tools/call", { name, arguments: args });
  }

  close() {
    this.#failAll(new Error("MCP client closed"));
    this.transport.close?.();
  }
}

/**
 * Real stdio transport — spawns the server process and frames newline-delimited JSON.
 * Used for local (stdio) MCP servers. Remote (HTTP/SSE) transport + OAuth is follow-on.
 */
export function stdioTransport({ command, args = [], env = {}, cwd } = {}) {
  if (!command) throw new Error("stdioTransport requires a command");
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const messageHandlers = [];
  const closeHandlers = [];
  let buffer = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; } // ignore non-JSON log lines
      for (const handler of messageHandlers) handler(message);
    }
  });
  child.on("close", () => { for (const handler of closeHandlers) handler(); });
  child.on("error", () => { for (const handler of closeHandlers) handler(); });

  return {
    send(message) { child.stdin.write(`${JSON.stringify(message)}\n`); },
    onMessage(handler) { messageHandlers.push(handler); },
    onClose(handler) { closeHandlers.push(handler); },
    close() { child.kill(); },
  };
}

/**
 * Connect to a stdio MCP server and return an initialized client plus its tools.
 * One call does the whole connect → handshake → discover sequence.
 */
export async function connectStdioServer(config) {
  const client = new MCPClient(stdioTransport(config));
  await client.initialize();
  const tools = await client.listTools();
  return { client, tools, serverInfo: client.serverInfo };
}
