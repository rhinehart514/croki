import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANONICAL_TOOLS, LEGACY_TOOLS, TOOLS, TOOL_MAP } from "../src/mcp.mjs";
import { createOperatorCapabilityRegistry } from "../src/operator-capabilities.mjs";

const names = TOOLS.map((tool) => tool.name);
const canonicalNames = CANONICAL_TOOLS.map((tool) => tool.name);

describe("MCP canonical verb surface", () => {
  it("uses the shared provider-neutral policy for all six canonical verbs", () => {
    const registry = createOperatorCapabilityRegistry(CANONICAL_TOOLS);
    assert.deepEqual(
      registry.viewForActor("model", "publicMcp").map((item) => item.id),
      ["ask", "focus", "inspect", "propose", "record", "run"],
    );
    assert.equal(registry.get("inspect").lane, "read-only");
    assert.equal(registry.get("run").lane, "reversible-local");
  });
  it("advertises the six preferred verbs first while keeping legacy capabilities discoverable", () => {
    assert.deepEqual(names.slice(0, 6), ["inspect", "focus", "ask", "propose", "record", "run"]);
    assert.deepEqual(canonicalNames, names.slice(0, 6));
    assert.equal(new Set(names).size, names.length);
    for (const legacy of ["get_product_model", "get_workflow", "run_workflow", "get_outcome", "start_operator_session"]) {
      assert.ok(names.includes(legacy), `${legacy} remains in tools/list`);
    }
  });

  it("uses open {type,id} references and states each safety boundary", () => {
    for (const tool of CANONICAL_TOOLS) {
      assert.equal(tool.inputSchema.type, "object");
      assert.ok(tool.description.length > 40);
      const ref = tool.inputSchema.properties.ref;
      if (!ref) continue;
      assert.deepEqual(ref.required, ["type", "id"]);
      assert.equal(ref.properties.type.enum, undefined, "reference types stay open");
    }
    assert.match(TOOL_MAP.get("run").description, /founder gate/i);
    assert.match(TOOL_MAP.get("record").description, /shared canvas/i);
    assert.deepEqual(TOOL_MAP.get("record").inputSchema.properties.kind.enum, ["session_note", "model_artifact", "work_artifact", "goal", "goal_relation", "work_relationship", "question_proposal"]);
  });

  it("keeps prior direct compose/run capabilities as advertised compatibility adapters", () => {
    assert.ok(LEGACY_TOOLS.length > CANONICAL_TOOLS.length);
    for (const name of ["start_operator_session", "run_workflow", "get_workflow", "get_outcome", "get_product_model"]) {
      assert.ok(TOOL_MAP.has(name), `${name} remains dispatchable`);
      assert.ok(names.includes(name), `${name} remains advertised for backward compatibility`);
    }
  });

  it("keeps outbound and approval verbs off the preferred canonical set", () => {
    assert.ok(canonicalNames.every((name) => !/approve|send|publish|deploy|charge/i.test(name)));
  });

  it("routes all six verbs to distinct deterministic operator services", async () => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
      return { ok: true, async json() { return { ok: true }; } };
    };
    const hypothesisRef = { type: "terrain-hypothesis", id: "hypothesis-ui-1", projectId: "p-1" };
    const readRef = { type: "terrain-read", id: "read-ui-1", projectId: "p-1" };
    try {
      await TOOL_MAP.get("inspect").handler({ projectId: "p-1", sessionId: "s-1", ref: hypothesisRef, refs: [readRef] });
      await TOOL_MAP.get("focus").handler({ projectId: "p-1", sessionId: "s-1", ref: hypothesisRef, refs: [readRef] });
      await TOOL_MAP.get("ask").handler({ projectId: "p-1", sessionId: "s-1", prompt: "Who is this for?", ref: hypothesisRef, refs: [readRef] });
      await TOOL_MAP.get("propose").handler({ projectId: "p-1", sessionId: "s-1", prompt: "Show two moves.", ref: hypothesisRef, refs: [readRef] });
      await TOOL_MAP.get("record").handler({ projectId: "p-1", sessionId: "s-1", kind: "session_note", value: "Keep this local.", ref: hypothesisRef, refs: [readRef] });
      await TOOL_MAP.get("run").handler({ projectId: "p-1", sessionId: "s-1", goal: "Run the focused pipeline.", ref: hypothesisRef, refs: [readRef] });
    } finally {
      global.fetch = originalFetch;
    }
    assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
      "/api/operator/sessions/s-1/verbs/inspect",
      "/api/operator/sessions/s-1/verbs/focus",
      "/api/operator/sessions/s-1/verbs/ask",
      "/api/operator/sessions/s-1/verbs/propose",
      "/api/operator/sessions/s-1/verbs/record",
      "/api/operator/sessions/s-1/verbs/run",
    ]);
    assert.equal(calls[2].body.prompt, "Who is this for?");
    assert.equal(calls[3].body.prompt, "Show two moves.");
    assert.equal(calls[5].body.goal, "Run the focused pipeline.");
    for (const call of calls) {
      assert.deepEqual(call.body.ref, { type: "terrain-hypothesis", id: "hypothesis-ui-1" });
      assert.ok(call.body.refs.some((ref) => ref.type === "terrain-read" && ref.id === "read-ui-1"));
    }
  });

  it("rejects a terrain projection ref that names another project before making an HTTP request", async () => {
    const originalFetch = global.fetch;
    let fetched = false;
    global.fetch = async () => { fetched = true; throw new Error("must not fetch"); };
    try {
      await assert.rejects(
        () => TOOL_MAP.get("focus").handler({ projectId: "p-1", sessionId: "s-1", ref: { type: "terrain-hypothesis", id: "foreign", projectId: "p-2" } }),
        /belongs to project p-2, not p-1/,
      );
      assert.equal(fetched, false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
