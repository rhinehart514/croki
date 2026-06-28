#!/usr/bin/env node
/**
 * mcp-demo-server.mjs — a minimal, real MCP stdio server used to exercise the
 * connect-capability path locally without installing a third-party server.
 *
 * It speaks newline-delimited JSON-RPC 2.0 (the MCP stdio transport): initialize,
 * tools/list, tools/call. The tools are Clay-shaped so the read/write classifier and
 * the wall can be seen with a live connection — not seeded data. Used by the UI's
 * "local demo" catalog entry and by mcp-client smoke checks.
 */

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    handle(message);
  }
});

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function handle(message) {
  if (message.id == null) return; // a notification — nothing to answer
  switch (message.method) {
    case "initialize":
      return reply(message.id, {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "clay-demo", version: "1.0.0" },
        capabilities: { tools: {} },
      });
    case "tools/list":
      return reply(message.id, {
        tools: [
          { name: "find_companies", description: "Search companies by criteria." },
          { name: "search_people", description: "Find people at a company." },
          { name: "get_table", description: "Read a Clay table." },
          { name: "lookup_domain", description: "Resolve a domain to a company." },
          { name: "list_sources", description: "List enrichment sources." },
          { name: "enrich_table", description: "Run enrichment on a table." },
          { name: "update_record", description: "Change a record." },
          { name: "push_to_crm", description: "Push rows to a CRM." },
          { name: "send_to_webhook", description: "POST rows to a webhook.", annotations: { destructiveHint: true } },
          { name: "run_recipe", description: "Run a saved recipe." },
          { name: "trigger_workflow", description: "Kick off a workflow." },
        ],
      });
    case "tools/call":
      return reply(message.id, { content: [{ type: "text", text: `demo: ${message.params?.name} ok` }] });
    default:
      return reply(message.id, {});
  }
}
