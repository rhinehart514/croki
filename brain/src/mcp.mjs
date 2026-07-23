#!/usr/bin/env node
/**
 * Croki MCP server — firm + surviving product-work stdio transport.
 *
 * Every tool delegates directly to the venture, wall, and product-change routes in this stdio
 * process. MCP does not require the desktop app and does not discover or call a web server.
 */

import { fileURLToPath } from "node:url";
import { invokeBrain } from "./desktop-runtime.mjs";
import { createFirmTools } from "./firm/mcp-tools.mjs";

async function brainGet(routePath) {
  const response = await invokeBrain({ path: routePath, method: "GET", headers: { "x-gtm-actor": "agent" } });
  if (response.status < 200 || response.status >= 300) throw new Error("Brain " + routePath + " → " + response.status);
  return JSON.parse(response.body || "{}");
}

async function brainPost(routePath, body) {
  const response = await invokeBrain({
    path: routePath,
    method: "POST",
    headers: { "content-type": "application/json", "x-gtm-actor": "agent" },
    body: JSON.stringify(body),
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error("Brain " + routePath + " → " + response.status + ": " + response.body);
  }
  return JSON.parse(response.body || "{}");
}

const FIRM_TOOLS = createFirmTools({ brainGet, brainPost });
const SURVIVING_TOOLS = [
  {
    name: "report_friction",
    description: "File a dogfood report about Croki itself. The report enters the local review queue; this tool cannot approve, publish, deploy, or release anything.",
    inputSchema: {
      type: "object",
      properties: {
        report: { type: "string" },
        kind: { type: "string", enum: ["friction", "bug", "wish"] },
        context: { type: "string" },
        ventureId: { type: "string" },
      },
      required: ["report"],
    },
    handler: (args) => brainPost("/api/friction", { ...args, source: "mcp" }),
  },
  {
    name: "request_feature",
    description: "Ask Croki to build a capability in an isolated review worktree. This file-only builder cannot run shell commands, test, commit, merge, push, deploy, or publish.",
    inputSchema: {
      type: "object",
      properties: {
        report: { type: "string" },
        context: { type: "string" },
        ventureId: { type: "string" },
        provider: { type: "string", enum: ["claude", "claude-code", "codex"] },
        model: { type: "string" },
      },
      required: ["report"],
    },
    handler: (args) => brainPost("/api/feature-request", { ...args, source: "mcp" }),
  },
  {
    name: "get_dogfood_queue",
    description: "Read Croki's local dogfood queue and product-change review status. Read-only.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: () => brainGet("/api/friction"),
  },
];
const TOOLS = [...FIRM_TOOLS, ...SURVIVING_TOOLS];
const TOOL_MAP = new Map(TOOLS.map((tool) => [tool.name, tool]));

export { TOOLS, TOOL_MAP, FIRM_TOOLS, brainGet, brainPost };

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function respondError(id, code, message, data) {
  const payload = { jsonrpc: "2.0", id, error: { code, message } };
  if (data !== undefined) payload.error.data = data;
  process.stdout.write(JSON.stringify(payload) + "\n");
}

async function dispatch(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    respond(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "gtm-ide", version: "0.1.0" },
    });
    return;
  }

  if (method === "notifications/initialized") return;

  if (method === "tools/list") {
    respond(id, {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    });
    return;
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const tool = TOOL_MAP.get(toolName);
    if (!tool) {
      respond(id, {
        content: [{ type: "text", text: "Unknown tool: " + toolName }],
        isError: true,
      });
      return;
    }
    try {
      const result = await tool.handler(params?.arguments ?? {});
      respond(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    } catch (error) {
      const messageText = String(error?.message ?? error);
      respond(id, {
        content: [{ type: "text", text: messageText }],
        isError: true,
      });
    }
    return;
  }

  if (method === "ping") {
    respond(id, {});
    return;
  }

  if (id !== undefined && id !== null) {
    respondError(id, -32601, "Method not found: " + method);
  }
}

export { dispatch };

function main() {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let message;
      try {
        message = JSON.parse(trimmed);
      } catch {
        respondError(null, -32700, "Parse error");
        continue;
      }
      dispatch(message).catch((error) => {
        respondError(message?.id ?? null, -32603, "Internal error", String(error));
      });
    }
  });
  process.stdin.on("end", () => {
    if (!buffer.trim()) return;
    let message;
    try {
      message = JSON.parse(buffer.trim());
    } catch {
      return;
    }
    dispatch(message).catch(() => {});
  });
  process.stderr.write("Croki MCP server ready (stdio)\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
