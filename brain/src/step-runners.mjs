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

export const STEP_KINDS = new Set(["agent", "skill", "code", "mcp"]);

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
};

// Override individual kinds (a real invoker in the server, a fake in a test) while
// keeping honest defaults for the rest.
export function makeStepRuntime(overrides = {}) {
  return { ...defaultStepRuntime, ...overrides };
}

// The live step runtime: a real agent invoker (the rented frontier model) and skill
// loader (judgment from disk), both passed in so the host hardcodes neither. With a
// dependency absent, the kind falls back to its honest default rather than pretending.
export function createStepRuntime({ agentInvoker, skillLoader, codeTransforms = {} } = {}) {
  return {
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
    async skill(node, upstream) {
      const guidance = typeof skillLoader === "function" ? await skillLoader(node.ref) : null;
      return { ok: true, items: upstream, meta: { kind: "skill", ref: node.ref, applied: !!guidance, guidance: guidance ?? null } };
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
  };
}
