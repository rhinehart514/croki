// E7.3 — The tool registry as a first-class object.
//
// Self-built and founder-shipped tools are shared objects with telemetry, exactly like People,
// Claims, and Experiments on the canvas. The registry tracks who references each tool (find-
// references), how often it is actually used (telemetry), and where it came from (provenance), so an
// unused self-built tool can be pruned — visibly, with a note, never silently.
//
// Pure data structure: no I/O, no clock-dependent logic beyond a recorded timestamp. The registry is
// returned as a plain object so a caller can persist it however it persists everything else.

function clone(value) {
  return structuredClone(value);
}

export function createRegistry() {
  return { schemaVersion: 1, tools: {} };
}

// Register a tool into the registry. A tool keeps its provenance ("founder-shipped" vs "self-built")
// and its references (which agents/channels point at it). Telemetry (uses) starts at zero. Re-
// registering the same id MERGES — it does not reset the use count, so re-proposing a tool never
// erases its track record.
export function registerTool(registry, tool) {
  if (!registry || typeof registry !== "object") throw new Error("registerTool requires a registry.");
  if (!tool?.id || typeof tool.id !== "string") throw new Error("A tool needs a string id to register.");
  const existing = registry.tools[tool.id];
  const next = clone(registry);
  next.tools[tool.id] = {
    ...(existing ?? {}),
    ...clone(tool),
    provenance: tool.provenance === "founder-shipped" ? "founder-shipped" : (tool.provenance ?? existing?.provenance ?? "self-built"),
    references: dedupeRefs([...(existing?.references ?? []), ...(tool.references ?? [])]),
    uses: existing?.uses ?? 0,
    registeredAt: existing?.registeredAt ?? new Date().toISOString(),
  };
  return next;
}

function refKey(ref) {
  if (typeof ref === "string") return `id:${ref}`;
  return `${ref?.type ?? "ref"}:${ref?.id ?? JSON.stringify(ref)}`;
}

function dedupeRefs(refs) {
  const seen = new Map();
  for (const ref of refs) {
    if (ref == null) continue;
    seen.set(refKey(ref), typeof ref === "string" ? { type: "ref", id: ref } : ref);
  }
  return [...seen.values()];
}

// Record one use of a tool (telemetry). Increments the use count and stamps the last-used time.
export function recordToolUse(registry, toolId) {
  const tool = registry?.tools?.[toolId];
  if (!tool) throw new Error(`Cannot record use of unknown tool: ${toolId}`);
  const next = clone(registry);
  next.tools[toolId] = {
    ...next.tools[toolId],
    uses: (next.tools[toolId].uses ?? 0) + 1,
    lastUsedAt: new Date().toISOString(),
  };
  return next;
}

// Find-references: which agents/channels reference this tool. Mirrors the canvas find-references
// query on People/Claims — the same intertwining that makes the registry a shared object, not a list.
export function findReferences(registry, toolId) {
  const tool = registry?.tools?.[toolId];
  if (!tool) throw new Error(`Cannot find references for unknown tool: ${toolId}`);
  return clone(tool.references ?? []);
}

// Prune tools that were never (or rarely) used. Returns the pruned registry AND the dropped tools,
// each carrying a plain-language note — a tool is never dropped silently. Founder-shipped tools are
// kept regardless of use count: the founder put them there on purpose, low telemetry is not a reason
// to remove them. Only self-built tools that failed to earn their use are pruned.
export function pruneUnused(registry, { minUses = 1 } = {}) {
  if (!registry || typeof registry !== "object") throw new Error("pruneUnused requires a registry.");
  const next = createRegistry();
  next.schemaVersion = registry.schemaVersion ?? 1;
  const dropped = [];
  for (const [id, tool] of Object.entries(registry.tools ?? {})) {
    const uses = tool.uses ?? 0;
    const keep = tool.provenance === "founder-shipped" || uses >= minUses;
    if (keep) {
      next.tools[id] = clone(tool);
    } else {
      dropped.push({
        id,
        tool: clone(tool),
        note: `Pruned self-built tool "${tool.name ?? id}" — ${uses} use(s), below the ${minUses}-use floor.`,
      });
    }
  }
  return { registry: next, dropped };
}
