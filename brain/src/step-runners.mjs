// Open workflow step runtimes — the un-caging.
//
// A workflow node used to be one thing: a connector picked from a frozen 9-category
// registry. That capped what a GTM system could be. Here a node can instead be an
// open `kind` the frontier agent composes:
//
//   agent  — invoke a subagent (by `ref`) on the upstream items
//   skill  — apply a skill's judgment (by `ref`) to the run context
//   code   — run a bounded deterministic transform (by `ref`)
//
// The host owns none of the intelligence here. The defaults below are HONEST blanks —
// no agent runtime, no skill loader — so a cold run reports the gap instead of faking a
// result. Live runs build a real runtime with createStepRuntime (see agent-bridge.mjs);
// tests inject fakes with makeStepRuntime. Step result shape matches connectors:
// { ok, items, meta?, error? }.

export const STEP_KINDS = new Set(["agent", "skill", "code", "mcp", "switch"]);

export const defaultStepRuntime = {
  async agent(node) {
    return {
      ok: false,
      items: [],
      error: `Agent step "${node.ref}" needs an agent runtime. None is attached to this run.`,
    };
  },
  async skill(node, upstream) {
    return { ok: true, items: upstream, meta: { kind: "skill", ref: node.ref, applied: false, guidance: null } };
  },
  async code(node) {
    return { ok: false, items: [], error: `Code step "${node.ref}" has no registered transform.` };
  },
  // MCP tool step — the connect/classify surface adds these, but calling out to the server
  // (read runs free, write stages behind the gate) is the run-path slice, not yet wired here.
  async mcp(node) {
    return { ok: false, items: [], error: `MCP tool step "${node.ref}" needs an MCP runtime. None is attached to this run.` };
  },
  // Switch — a conditional router. It owns no intelligence and needs no live dependency, so the
  // default IS the real behavior: pass every upstream item through unchanged. The routing itself
  // happens downstream — each of the switch's outgoing data edges carries a predicate, and
  // resolveUpstream (graph.mjs) filters this node's items per edge. A switch never sends.
  async switch(node, upstream) {
    const items = Array.isArray(upstream) ? upstream : [];
    return { ok: true, items, meta: { kind: "switch", routed: items.length } };
  },
};

// Override individual kinds (a real invoker in the server, a fake in a test) while
// keeping honest defaults for the rest.
export function makeStepRuntime(overrides = {}) {
  return { ...defaultStepRuntime, ...overrides };
}

// Normalize whatever an external MCP tool returns into the run-path item shape. MCP
// `tools/call` results are { content: [{ type, text|...}], structuredContent?, isError? }.
// We keep this lenient: structured content wins, then text blocks, then the raw result —
// the founder reviews everything at the gate, so we never drop the payload on the floor.
function mcpResultToItems(result) {
  if (result == null) return [];
  if (result.structuredContent != null) {
    const sc = result.structuredContent;
    return Array.isArray(sc) ? sc : [sc];
  }
  if (Array.isArray(result.content)) {
    return result.content
      .map((block) => {
        if (block == null) return null;
        if (typeof block.text === "string") return { kind: block.type ?? "text", text: block.text };
        return block;
      })
      .filter(Boolean);
  }
  return [result];
}

// The live MCP step runner — the run-path slice of connectors-as-MCP.
//
// THE WALL: this only RUNS read-classified tools. A write-classified tool (per
// mcp-classifier / the founder override stored in mcp-store) is REFUSED here, not
// executed — anything outward-facing crosses the founder gate, never a silent
// run-path call. "vibe up to the gate, never past it." The refusal is honest (ok:false
// with a reason), so a composed graph that points a step at a writer fails loudly
// instead of quietly sending.
//
// Both seams are injectable so the host owns neither the registry nor the transport:
//   resolveTool(node) → { server, tool, effectiveClass }   (lookup; default reads mcp-store)
//   callTool({ server, tool, args }) → MCP tools/call result (transport; default connects stdio)
// With either absent the runner reports the gap honestly rather than fabricating.
export function createMcpStepRunner({ resolveTool, callTool } = {}) {
  return async function mcp(node, upstream, context) {
    const ref = node?.ref ?? node?.config?.ref ?? "";
    if (typeof resolveTool !== "function" || typeof callTool !== "function") {
      return defaultStepRuntime.mcp(node);
    }

    let resolved;
    try {
      resolved = await resolveTool(node, context);
    } catch (err) {
      return { ok: false, items: [], error: `MCP tool step "${ref}" lookup failed: ${err?.message ?? err}` };
    }
    if (!resolved || !resolved.tool) {
      return { ok: false, items: [], error: `MCP tool step "${ref}" names no registered server+tool.` };
    }

    const toolName = resolved.tool.name ?? resolved.tool;
    const klass = resolved.effectiveClass ?? resolved.class ?? null;

    // The wall. Only "read" runs free here; anything else (write, or unknown/unclassified)
    // is refused — it belongs behind the founder gate, not in the run path.
    if (klass !== "read") {
      return {
        ok: false,
        blocked: true,
        items: [],
        error: `MCP tool "${toolName}" is classified "${klass ?? "unclassified"}" — it acts on the world and must cross the founder gate, so the run path refuses to call it.`,
        meta: { kind: "mcp", ref, tool: toolName, class: klass, blocked: true },
      };
    }

    const args = node?.config?.args ?? node?.args ?? {};
    let result;
    try {
      result = await callTool({ server: resolved.server, tool: resolved.tool, name: toolName, args, upstream, context });
    } catch (err) {
      return { ok: false, items: [], error: `MCP tool "${toolName}" call failed: ${err?.message ?? err}`, meta: { kind: "mcp", ref, tool: toolName, class: klass } };
    }
    if (result?.isError) {
      return { ok: false, items: mcpResultToItems(result), error: `MCP tool "${toolName}" returned an error result.`, meta: { kind: "mcp", ref, tool: toolName, class: klass } };
    }
    return {
      ok: true,
      items: mcpResultToItems(result),
      meta: { kind: "mcp", ref, tool: toolName, class: klass, server: resolved.server?.id ?? resolved.server?.name ?? null },
    };
  };
}

// ── Built-in deterministic code transforms (the `code` step's spine) ─────────
// A `code` step is the deterministic part of a GTM system — the part that must NOT be a
// model call: dedupe a list, filter by a field, cap the count, sort, rename fields. These
// are pure functions keyed by `ref`; a node picks one with config.ref and parameterizes it
// through config. NO arbitrary eval / Function() — only this fixed, auditable set runs, so a
// `code` node can never become a back door for model-authored logic. A ref with no transform
// here is an honest no-op (handled by the runner: applied:false), never a wall.

// Stable identity for a value, used by dedupe and field comparisons. Objects compare by
// their JSON shape; primitives by typed value so 1 and "1" never collide.
function stableKey(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "object") {
    try { return `obj:${JSON.stringify(value)}`; } catch { return `obj:${String(value)}`; }
  }
  return `${typeof value}:${value}`;
}

// Deterministic ordering: numbers numerically, everything else by string order. Used by sort.
function compareValues(a, b) {
  if (typeof a === "number" && typeof b === "number") return a === b ? 0 : a < b ? -1 : 1;
  const as = a == null ? "" : String(a);
  const bs = b == null ? "" : String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

// The one predicate filter understands: field <op> value. No expressions, no code — a fixed
// op vocabulary. An unknown op keeps the item (a safe, deterministic no-op).
function applyPredicate(left, op, right) {
  switch (op) {
    case "exists": return left != null && left !== "";
    case "missing": return left == null || left === "";
    case "eq": return left === right;
    case "ne": return left !== right;
    case "gt": return Number(left) > Number(right);
    case "gte": return Number(left) >= Number(right);
    case "lt": return Number(left) < Number(right);
    case "lte": return Number(left) <= Number(right);
    case "contains":
      if (Array.isArray(left)) return left.includes(right);
      return typeof left === "string" && left.includes(String(right));
    case "in": return Array.isArray(right) && right.includes(left);
    default: return true;
  }
}

// Evaluate a switch/edge predicate { field, op?, value? } against one item. Reuses the one
// predicate vocabulary above so a switch can never route on logic a `code` filter couldn't express.
// A null/empty predicate matches everything (an unconditional branch).
export function evaluateSwitchPredicate(item, predicate) {
  if (!predicate || typeof predicate !== "object") return true;
  const { field, op = "exists", value } = predicate;
  if (!field) return true;
  return applyPredicate(item?.[field], op, value);
}

export const BUILTIN_CODE_TRANSFORMS = {
  // Drop duplicates. config.by = a field name (or array of field names) to key on; absent =
  // the whole item's identity. First occurrence wins, input order preserved.
  dedupe(items, config = {}) {
    const list = Array.isArray(items) ? items : [];
    const by = config.by ?? config.field ?? null;
    const fields = by == null ? null : (Array.isArray(by) ? by : [by]);
    const keyOf = (item) => fields == null
      ? stableKey(item)
      : fields.map((f) => stableKey(item?.[f])).join(" ");
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const k = keyOf(item);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(item);
    }
    return out;
  },
  // Keep only items where field <op> value holds. config: { field, op, value }. With no field
  // the list passes through unchanged.
  filter(items, config = {}) {
    const list = Array.isArray(items) ? items : [];
    const { field, op = "exists", value } = config;
    if (!field) return list;
    return list.filter((item) => applyPredicate(item?.[field], op, value));
  },
  // Cap the list length. config.count (or config.limit). Absent/negative = unchanged.
  limit(items, config = {}) {
    const list = Array.isArray(items) ? items : [];
    const n = Number(config.count ?? config.limit);
    if (!Number.isFinite(n) || n < 0) return list;
    return list.slice(0, n);
  },
  // Sort by a field (config.by/field) ascending or descending (config.direction). Stable; a
  // tie keeps input order. No field sorts the items themselves.
  sort(items, config = {}) {
    const list = Array.isArray(items) ? items : [];
    const field = config.by ?? config.field ?? null;
    const dir = String(config.direction ?? config.order ?? "asc").toLowerCase() === "desc" ? -1 : 1;
    const valueOf = (item) => (field == null ? item : item?.[field]);
    return list
      .map((item, index) => [item, index])
      .sort(([a, ai], [b, bi]) => {
        const cmp = compareValues(valueOf(a), valueOf(b));
        return cmp !== 0 ? cmp * dir : ai - bi;
      })
      .map(([item]) => item);
  },
  // Rename fields. config.map = { oldName: newName }. Unmapped fields pass through; non-object
  // items are untouched.
  "rename-fields"(items, config = {}) {
    const list = Array.isArray(items) ? items : [];
    const map = config.map && typeof config.map === "object" && !Array.isArray(config.map) ? config.map : {};
    return list.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const out = {};
      for (const [k, v] of Object.entries(item)) {
        out[Object.prototype.hasOwnProperty.call(map, k) ? map[k] : k] = v;
      }
      return out;
    });
  },
};

// The live step runtime: a real agent invoker (the rented frontier model) and skill
// loader (judgment from disk), both passed in so the host hardcodes neither. With a
// dependency absent, the kind falls back to its honest default rather than pretending.
export function createStepRuntime({ agentInvoker, skillLoader, codeTransforms = {}, mcpRunner } = {}) {
  return {
    // The mcp runner is its own injectable seam (registry + transport). With it absent
    // the kind falls back to the honest blank default rather than pretending a tool ran.
    mcp: typeof mcpRunner === "function" ? mcpRunner : defaultStepRuntime.mcp,
    // A switch owns no intelligence — the deterministic pass-through default is always correct.
    switch: defaultStepRuntime.switch,
    async agent(node, upstream, context) {
      if (typeof agentInvoker !== "function") return defaultStepRuntime.agent(node);
      // Prefer the instance's own on-disk definition when the node carries a path to it (set by
      // the program compiler from AgentInstance.artifactPath). The invoker's loader uses this to
      // run the real agent doctrine; ref-only nodes still work — artifactPath is just undefined.
      const out = await agentInvoker({
        ref: node.ref,
        prompt: node.agentPrompt ?? "",
        items: upstream,
        config: node.config ?? {},
        context: context ?? {},
        artifactPath: node.config?.artifactPath ?? node.artifactPath,
      });
      return {
        ok: out?.ok !== false,
        items: out?.items ?? [],
        meta: { kind: "agent", ref: node.ref, ...(out?.meta ?? {}) },
        ...(out?.error ? { error: out.error } : {}),
      };
    },
    async skill(node, upstream, context) {
      const guidance = typeof skillLoader === "function" ? await skillLoader(node.ref) : null;
      // The loaded judgment only MATTERS if it can reach a downstream consumer. graph.mjs threads
      // a shared run accumulator (context.__skillGuidance); a later `agent` step folds it into its
      // prompt and acts under it. Append-and-dedupe by ref. Without the accumulator the guidance has
      // nowhere to go this run, so `applied` stays honestly false rather than dead-ending in metadata.
      const sink = Array.isArray(context?.__skillGuidance) ? context.__skillGuidance : null;
      let applied = false;
      if (guidance && sink) {
        if (!sink.some((entry) => entry?.ref === node.ref)) sink.push({ ref: node.ref, guidance });
        applied = true;
      }
      return { ok: true, items: upstream, meta: { kind: "skill", ref: node.ref, applied, guidance: guidance ?? null } };
    },
    async code(node, upstream) {
      const fn = node.ref && typeof codeTransforms[node.ref] === "function" ? codeTransforms[node.ref] : null;
      // No registered transform — pass items through unchanged (an honest no-op, applied:false)
      // rather than dead-ending the loop. A code step is a deterministic filter/transform; when one
      // isn't implemented it must not be a wall, since the founder reviews everything at the gate.
      if (!fn) return { ok: true, items: upstream ?? [], meta: { kind: "code", ref: node.ref, applied: false } };
      try {
        const out = fn(upstream ?? [], node.config ?? {});
        return { ok: true, items: Array.isArray(out) ? out : (upstream ?? []), meta: { kind: "code", ref: node.ref, applied: true } };
      } catch (err) {
        return { ok: true, items: upstream ?? [], meta: { kind: "code", ref: node.ref, applied: false, error: err?.message } };
      }
    },
    // A terminal is a human-operated source: the founder runs a real shell on the canvas and commits
    // its captured output (config.output) as the dataset the graph consumes. The runner owns no
    // intelligence and never re-runs the shell during an automated pass — it only emits what the
    // founder already produced. Uncommitted → an honest empty result (applied:false), never a failure.
    async terminal(node) {
      const output = node.config?.output;
      if (Array.isArray(output)) {
        return { ok: true, items: output, meta: { kind: "terminal", applied: true, source: "committed" } };
      }
      if (typeof output === "string" && output.trim()) {
        return { ok: true, items: [{ output }], meta: { kind: "terminal", applied: true, source: "committed" } };
      }
      return { ok: true, items: [], meta: { kind: "terminal", applied: false, source: "uncommitted" } };
    },
    // Workbench surfaces — human-operated, never auto-execute. A query node can emit a committed result
    // set (config.output); a web node produces nothing into the graph. Both are honest no-ops at run time.
    async query(node) {
      const output = node.config?.output;
      if (Array.isArray(output)) return { ok: true, items: output, meta: { kind: "query", applied: true } };
      return { ok: true, items: [], meta: { kind: "query", applied: false } };
    },
    async web() {
      return { ok: true, items: [], meta: { kind: "web", applied: false } };
    },
  };
}
