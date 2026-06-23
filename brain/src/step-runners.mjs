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

export const STEP_KINDS = new Set(["agent", "skill", "code"]);

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
};

// Override individual kinds (a real invoker in the server, a fake in a test) while
// keeping honest defaults for the rest.
export function makeStepRuntime(overrides = {}) {
  return { ...defaultStepRuntime, ...overrides };
}

// The live step runtime: a real agent invoker (the rented frontier model) and skill
// loader (judgment from disk), both passed in so the host hardcodes neither. With a
// dependency absent, the kind falls back to its honest default rather than pretending.
export function createStepRuntime({ agentInvoker, skillLoader } = {}) {
  return {
    async agent(node, upstream, context) {
      if (typeof agentInvoker !== "function") return defaultStepRuntime.agent(node);
      const out = await agentInvoker({
        ref: node.ref,
        prompt: node.agentPrompt ?? "",
        items: upstream,
        config: node.config ?? {},
        context: context ?? {},
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
    async code(node) {
      return defaultStepRuntime.code(node);
    },
  };
}
