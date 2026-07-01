#!/usr/bin/env node
/**
 * Operator MCP bridge — stdio transport, hand-rolled JSON-RPC 2.0.
 *
 * This is the tool surface a Claude Code subprocess connects to when it drives a
 * resident operator session (see ./runtimes/claude-code.mjs). It exposes GTM
 * IDE's typed operator tools and executes them IN-PROCESS against the durable
 * operator session store, so persistence and safety stay on GTM IDE's side of
 * the line — Claude Code only reasons and calls these tools.
 *
 * Safety by construction: the operator toolset has no approve / send / publish /
 * deploy / charge tool. The only path past a founder gate is the founder
 * resolving it inside GTM IDE. `assertSafeTool` enforces that invariant so a
 * future tool addition can never silently hand outbound power to the subprocess.
 *
 * Note on `compose_microproduct`: it BUILDS a deployable artifact, but it cannot
 * deploy it — it only composes a graph whose deploy step sits behind a founder
 * gate and runs it TO that gate (the artifact stages, deployed:false). Its name
 * carries no outbound verb, so it stays exposed; shipping still happens only when
 * the founder releases the gate inside GTM IDE, exactly like a send. A real
 * `deploy_*`/`publish_*` tool would match FORBIDDEN_TOOL and be refused exposure.
 *
 * The session it may touch is fixed by GTM_IDE_OPERATOR_SESSION; the store root
 * by GTM_IDE_HOME. It cannot reach any other session.
 *
 * Start (normally spawned by the Claude Code adapter, not by hand):
 *   GTM_IDE_OPERATOR_SESSION=<id> node brain/src/operator-mcp.mjs
 */

import { fileURLToPath } from "node:url";
import { getOperatorSession } from "./operator-store.mjs";
import { executeOperatorTool, operatorTools } from "./operator-runtime.mjs";

const FORBIDDEN_TOOL = /approve|send|publish|deploy|charge/i;
// An idea VERDICT — killing or keeping a generated idea — is a founder act, exactly like clearing a
// gate. The operator may `ideate` (generate + pause), but deciding which idea lives or becomes work is
// resolved off the agent surface (resolveOperatorIdeas), never by a tool the subprocess can call. This
// guards against a future kill/keep/verdict tool ever leaking onto the agent door. `ideate` itself does
// not match (it neither kills nor keeps), so the generate-and-pause move stays available.
const FORBIDDEN_IDEA_VERDICT = /idea[_-]?(kill|keep|verdict|decide|pick)|(kill|keep|verdict)[_-]?idea/i;

// Defense in depth: refuse to expose anything that could act on the outside
// world. Gates are the founder's alone; the operator can never approve one.
export function assertSafeTool(name) {
  if (FORBIDDEN_TOOL.test(name)) {
    throw new Error(`Refusing to expose operator tool "${name}" to a subprocess: it matches an outbound/approval verb.`);
  }
  if (FORBIDDEN_IDEA_VERDICT.test(name)) {
    throw new Error(`Refusing to expose operator tool "${name}" to a subprocess: killing or keeping an idea is a founder act, not an agent tool.`);
  }
  return name;
}

export function safeOperatorTools() {
  return operatorTools.filter((tool) => {
    assertSafeTool(tool.name);
    return true;
  });
}

// Build a session-scoped bridge. Pure enough to unit-test: callTool routes a
// tool call through executeOperatorTool against the durable session and returns
// the persisted result plus whether the session paused (e.g. reached a gate).
export function createOperatorBridge({ sessionId, options = {} } = {}) {
  if (!sessionId) throw new Error("GTM_IDE_OPERATOR_SESSION is required for the operator MCP bridge.");
  const tools = safeOperatorTools();
  const toolNames = new Set(tools.map((tool) => tool.name));

  async function callTool(name, input = {}) {
    if (!toolNames.has(name)) throw new Error(`Unknown operator tool: ${name}`);
    assertSafeTool(name);
    const session = getOperatorSession(sessionId, options);
    const execution = await executeOperatorTool(session, { id: `mcp-${Date.now()}`, name, input }, options);
    return {
      result: execution.result,
      pause: execution.pause === true,
      status: execution.session.status,
    };
  }

  return { sessionId, tools, callTool };
}

// ─── JSON-RPC 2.0 stdio transport ──────────────────────────────────────────────

function respond(write, id, result) {
  write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function respondError(write, id, code, message, data) {
  const payload = { jsonrpc: "2.0", id, error: { code, message } };
  if (data !== undefined) payload.error.data = data;
  write(`${JSON.stringify(payload)}\n`);
}

export function createDispatcher(bridge, write) {
  return async function dispatch(message) {
    const { id, method, params } = message;

    if (method === "initialize") {
      return respond(write, id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "gtm-operator", version: "0.1.0" },
      });
    }
    if (method === "notifications/initialized") return;
    if (method === "ping") return respond(write, id, {});

    if (method === "tools/list") {
      return respond(write, id, {
        tools: bridge.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.input_schema,
        })),
      });
    }

    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments ?? {};
      try {
        const { result, pause, status } = await bridge.callTool(name, args);
        // Surface a pause as plain text so the subprocess sees it stopped at a
        // founder gate (or for founder input) and ends its turn.
        const note = pause ? `\n\n[Drover paused: session status is "${status}". The founder owns what happens next; stop here.]` : "";
        return respond(write, id, {
          content: [{ type: "text", text: `${JSON.stringify(result, null, 2)}${note}` }],
        });
      } catch (error) {
        return respond(write, id, {
          content: [{ type: "text", text: String(error?.message ?? error) }],
          isError: true,
        });
      }
    }

    if (id !== undefined && id !== null) {
      respondError(write, id, -32601, `Method not found: ${method}`);
    }
  };
}

function main() {
  const bridge = createOperatorBridge({
    sessionId: process.env.GTM_IDE_OPERATOR_SESSION,
    options: {},
  });
  const write = (text) => process.stdout.write(text);
  const dispatch = createDispatcher(bridge, write);

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
        respondError(write, null, -32700, "Parse error");
        continue;
      }
      dispatch(message).catch((error) => {
        respondError(write, message?.id ?? null, -32603, "Internal error", String(error));
      });
    }
  });
  process.stderr.write("Drover operator MCP bridge ready (stdio)\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
