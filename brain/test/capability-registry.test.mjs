import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CAPABILITY_LANES,
  CapabilityRegistry,
  classifyCapabilityEffects,
  createCapabilityRegistry,
} from "../src/capability-registry.mjs";

function definition(overrides = {}) {
  return {
    id: "repo.inspect",
    description: "Read repository evidence.",
    inputSchema: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] },
    outputSchema: { type: "object", properties: { found: { type: "boolean" } }, required: ["found"] },
    handler: async () => ({ found: true }),
    source: { kind: "host", ref: "repository" },
    allowedActors: ["claude", "codex"],
    exposure: { operator: true, http: false, publicMcp: true },
    effects: { readTargets: ["repository"] },
    approvalPolicy: { required: false },
    ...overrides,
  };
}

describe("provider-neutral capability registry", () => {
  it("gives Claude and Codex identical inventory and invocation behavior", async () => {
    const registry = createCapabilityRegistry([definition()]);
    assert.deepEqual(registry.viewForActor("claude"), registry.viewForActor("codex"));
    assert.deepEqual(await registry.invoke("repo.inspect", { ref: "app.ts" }, { actor: "claude", exposure: "operator" }), { found: true });
    assert.deepEqual(await registry.invoke("repo.inspect", { ref: "app.ts" }, { actor: "codex", exposure: "operator" }), { found: true });
  });

  it("requires the founder wall for an external effect and never trusts a model approval", async () => {
    let calls = 0;
    const registry = createCapabilityRegistry([definition({
      id: "transport.anything",
      allowedActors: ["claude", "codex", "founder"],
      effects: { external: true, writeTargets: ["remote-service"] },
      approvalPolicy: { required: true, approvers: ["founder"] },
      handler: async () => { calls += 1; return { found: true }; },
    })]);
    assert.equal(registry.get("transport.anything").lane, CAPABILITY_LANES.FOUNDER_WALL);
    await assert.rejects(
      registry.invoke("transport.anything", { ref: "x" }, { actor: "claude", approval: { approved: true, actor: "claude" } }),
      (error) => error.code === "capability_founder_wall",
    );
    assert.equal(calls, 0);
    await registry.invoke("transport.anything", { ref: "x" }, { actor: "founder", approval: { approved: true, actor: "founder" } });
    assert.equal(calls, 1);
  });

  it("explicitly refuses approval and release authority to model actors without name matching", async () => {
    const registry = createCapabilityRegistry([definition({
      id: "innocuous.identifier",
      approvalPolicy: { operation: "release", required: false },
    })]);
    await assert.rejects(
      registry.invoke("innocuous.identifier", { ref: "x" }, { actor: "codex" }),
      (error) => error.code === "capability_model_authority_forbidden",
    );
  });

  it("runs reversible local work without founder approval and forwards context/idempotency", async () => {
    let received;
    const registry = createCapabilityRegistry([definition({
      id: "worktree.edit",
      effects: { readTargets: ["repository"], writeTargets: ["isolated-worktree"] },
      handler: async (input, context) => { received = { input, context }; return { found: true }; },
    })]);
    await registry.invoke("worktree.edit", { ref: "app.ts" }, {
      actor: "codex", exposure: "operator", idempotencyKey: "edit-1", sessionId: "session-1",
    });
    assert.equal(registry.get("worktree.edit").lane, CAPABILITY_LANES.REVERSIBLE_LOCAL);
    assert.equal(received.context.idempotencyKey, "edit-1");
    assert.equal(received.context.sessionId, "session-1");
    assert.equal(received.context.capability.id, "worktree.edit");
  });

  it("refuses unknown capabilities, duplicate registration, wrong exposure, and malformed input", async () => {
    const registry = new CapabilityRegistry([definition()]);
    assert.throws(() => registry.register(definition()), (error) => error.code === "capability_collision");
    await assert.rejects(registry.invoke("missing", {}, { actor: "claude" }), (error) => error.code === "capability_unknown");
    await assert.rejects(registry.invoke("repo.inspect", { ref: "x" }, { actor: "claude", exposure: "http" }), (error) => error.code === "capability_exposure_forbidden");
    await assert.rejects(registry.invoke("repo.inspect", {}, { actor: "claude" }), (error) => error.code === "capability_schema_invalid");
  });

  it("returns sorted immutable views which cannot mutate registered state", () => {
    const registry = createCapabilityRegistry([definition({ id: "z" }), definition({ id: "a" })]);
    const list = registry.list();
    assert.deepEqual(list.map((item) => item.id), ["a", "z"]);
    assert.equal(Object.isFrozen(list), true);
    assert.equal(Object.isFrozen(list[0].effects), true);
    assert.throws(() => { list[0].effects.external = true; }, TypeError);
    assert.equal(registry.get("a").effects.external, false);
    assert.equal("handler" in registry.get("a"), false);
  });

  it("classifies effects without consulting capability names or model claims", () => {
    assert.equal(classifyCapabilityEffects({ readTargets: ["repo"] }), CAPABILITY_LANES.READ_ONLY);
    assert.equal(classifyCapabilityEffects({ writeTargets: ["worktree"] }), CAPABILITY_LANES.REVERSIBLE_LOCAL);
    assert.equal(classifyCapabilityEffects({ external: true }), CAPABILITY_LANES.FOUNDER_WALL);
    assert.equal(classifyCapabilityEffects({ irreversible: true }), CAPABILITY_LANES.FOUNDER_WALL);
    assert.equal(classifyCapabilityEffects({ financial: true }), CAPABILITY_LANES.FOUNDER_WALL);
    assert.equal(classifyCapabilityEffects({ readTargets: ["send_publish_charge"] }), CAPABILITY_LANES.READ_ONLY);
  });
});
