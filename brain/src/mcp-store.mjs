/**
 * mcp-store.mjs — durable connected MCP servers and their tool classifications.
 *
 * One file per server under ~/.gtm-ide/capabilities/, atomic temp+rename like
 * flow-store. Each server records its tools already split into lanes by
 * mcp-classifier, plus any founder OVERRIDE (the deliberate act of moving a tool
 * across the wall) and a trust level. The effective lane is `override ?? class` —
 * the host never loses the machine's classification, it just respects the founder's.
 *
 * The wall is the invariant this store protects: a write-class tool may only become
 * "runs free" through an explicit, recorded override. Unknown stays gated. Nothing
 * here ever sends — it stores what each tool IS allowed to do, not does it.
 */

import { classifyTool, READ_CLASS, WRITE_CLASS } from "./mcp-classifier.mjs";
import { persistence } from "./persistence.mjs";

const TRUST_LEVELS = new Set(["verified", "community", "untrusted"]);
const COLLECTION = "capabilities";

function safeId(value) {
  return String(value || "server").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}
function now() {
  return new Date().toISOString();
}

/** A raw MCP tool descriptor → a stored tool record carrying its machine class. */
function classifyRecord(tool, prior) {
  const verdict = classifyTool(tool);
  return {
    name: tool.name,
    description: tool.description ?? "",
    class: verdict.class,         // the machine's verdict — never lost
    reason: verdict.reason,
    source: verdict.source,        // annotation | name | default
    declaredReadOnly: verdict.declaredReadOnly,
    declaredDestructive: verdict.declaredDestructive,
    // preserve a founder override across a re-scan of the same tool
    override: prior?.override ?? null, // null | "read" | "write"
  };
}

/** The lane a tool actually sits in, honoring a founder override. */
export function effectiveClass(tool) {
  return tool.override ?? tool.class;
}

/**
 * Record (create or refresh) a connected server from raw MCP tools.
 * Classifies every tool, preserving any prior override for tools that still exist.
 * An untrusted server is hard-gated: every tool is forced write-class regardless of name.
 */
export function recordServer(input, options = {}) {
  const id = safeId(input.id || input.name);
  const prior = getServer(id, options);
  const priorByName = new Map((prior?.tools ?? []).map((t) => [t.name, t]));
  const trust = TRUST_LEVELS.has(input.trust) ? input.trust : "community";

  let tools = (input.tools ?? []).map((tool) => classifyRecord(tool, priorByName.get(tool.name)));
  if (trust === "untrusted") {
    // quarantine: nothing from an untrusted server may ever run free
    tools = tools.map((t) => ({ ...t, class: WRITE_CLASS, override: null, reason: "untrusted server — hard-gated", source: "quarantine" }));
  }

  const server = {
    id,
    name: input.name || id,
    url: input.url ?? "",
    transport: input.transport ?? "stdio",
    command: input.command ?? null,
    args: input.args ?? [],
    trust,
    auth: input.auth ?? prior?.auth ?? { status: "none", method: null },
    tools,
    connectedAt: prior?.connectedAt ?? now(),
    updatedAt: now(),
  };
  persistence(options).set(COLLECTION, safeId(id), server);
  return server;
}

export function getServer(id, options = {}) {
  return persistence(options).get(COLLECTION, safeId(id));
}

export function listServers(options = {}) {
  return persistence(options).list(COLLECTION)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export function removeServer(id, options = {}) {
  persistence(options).delete(COLLECTION, safeId(id));
  return true;
}

/**
 * Move a tool across the wall. `lane` is "read" or "write".
 * Loosening (write→read) is the weighty act — the API layer requires explicit
 * confirmation before calling this; the store records WHETHER it loosened the wall
 * so the act is auditable. An untrusted server refuses to loosen at all.
 */
export function reclassifyTool(serverId, toolName, lane, options = {}) {
  if (lane !== READ_CLASS && lane !== WRITE_CLASS) {
    throw new Error(`reclassifyTool: lane must be "read" or "write", got "${lane}"`);
  }
  const server = getServer(serverId, options);
  if (!server) throw new Error(`reclassifyTool: no server "${serverId}"`);
  const tool = server.tools.find((t) => t.name === toolName);
  if (!tool) throw new Error(`reclassifyTool: no tool "${toolName}" on "${serverId}"`);

  const loosening = lane === READ_CLASS && tool.class === WRITE_CLASS;
  if (loosening && server.trust === "untrusted") {
    throw new Error("reclassifyTool: an untrusted server's tools cannot be loosened");
  }
  // an override only persists when it disagrees with the machine; agreeing clears it
  tool.override = lane === tool.class ? null : lane;
  server.updatedAt = now();
  persistence(options).set(COLLECTION, safeId(serverId), server);
  return { server, tool, loosenedWall: loosening };
}

/** A view-model for the UI: the two lanes (honoring overrides) + the defaulted count. */
export function serverView(server) {
  const withEffective = server.tools.map((t) => ({ ...t, effectiveClass: effectiveClass(t) }));
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    trust: server.trust,
    auth: server.auth,
    connectedAt: server.connectedAt,
    updatedAt: server.updatedAt,
    read: withEffective.filter((t) => t.effectiveClass === READ_CLASS),
    write: withEffective.filter((t) => t.effectiveClass === WRITE_CLASS),
    defaultedCount: withEffective.filter((t) => t.source === "default" && t.effectiveClass === WRITE_CLASS).length,
    overrideCount: withEffective.filter((t) => t.override).length,
    toolCount: server.tools.length,
  };
}
