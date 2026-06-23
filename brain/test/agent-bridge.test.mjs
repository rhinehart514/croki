import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProviderAgentInvoker, loadSkillGuidance, parseAgentItems } from "../src/agent-bridge.mjs";
import { createStepRuntime } from "../src/step-runners.mjs";

describe("loadSkillGuidance — judgment from disk", () => {
  it("reads a skill's SKILL.md when present", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-skills-"));
    fs.mkdirSync(path.join(root, "positioning"));
    fs.writeFileSync(path.join(root, "positioning", "SKILL.md"), "Lead with the now-you-can line.");
    const guidance = loadSkillGuidance("positioning", { root });
    assert.match(guidance, /now-you-can/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns null for an unknown skill rather than throwing", () => {
    assert.equal(loadSkillGuidance("does-not-exist", { root: "/tmp/none" }), null);
    assert.equal(loadSkillGuidance("", {}), null);
  });
});

describe("parseAgentItems — pull a JSON array out of model prose", () => {
  it("parses a fenced json array", () => {
    const out = parseAgentItems('Here you go:\n```json\n[{"id":"1"},{"id":"2"}]\n```');
    assert.equal(out.length, 2);
    assert.equal(out[0].id, "1");
  });
  it("parses an inline array embedded in prose", () => {
    const out = parseAgentItems('Result: [{"name":"Ada"}] — done.');
    assert.equal(out[0].name, "Ada");
  });
  it("parses a bare array", () => {
    assert.deepEqual(parseAgentItems('[1,2,3]'), [1, 2, 3]);
  });
  it("returns [] for unparseable or empty text", () => {
    assert.deepEqual(parseAgentItems("no array here"), []);
    assert.deepEqual(parseAgentItems(""), []);
    assert.deepEqual(parseAgentItems(null), []);
  });
});

describe("createStepRuntime — real deps wired into the step runtime", () => {
  it("a skill step marks applied:true when the loader finds guidance", async () => {
    const runtime = createStepRuntime({ skillLoader: (ref) => (ref === "positioning" ? "guidance text" : null) });
    const out = await runtime.skill({ ref: "positioning" }, [{ id: "x" }], {});
    assert.equal(out.ok, true);
    assert.equal(out.meta.applied, true);
    assert.equal(out.items.length, 1);
  });

  it("an agent step uses the injected invoker and tags its meta", async () => {
    const runtime = createStepRuntime({
      agentInvoker: async ({ ref, items }) => ({ ok: true, items: items.map((i) => ({ ...i, by: ref })) }),
    });
    const out = await runtime.agent({ ref: "gtm-enrich" }, [{ id: "p1" }], {});
    assert.equal(out.ok, true);
    assert.equal(out.items[0].by, "gtm-enrich");
    assert.equal(out.meta.ref, "gtm-enrich");
  });

  it("falls back to honest-blocked when no invoker is attached", async () => {
    const runtime = createStepRuntime({});
    const out = await runtime.agent({ ref: "gtm-enrich" }, [], {});
    assert.equal(out.ok, false);
    assert.match(out.error, /needs an agent runtime/);
  });
});

describe("provider-aware agent invocation", () => {
  it("routes each agent step to its selected Claude or Codex runtime", async () => {
    const invoke = createProviderAgentInvoker({
      claudeInvoker: async () => ({ ok: true, items: [{ provider: "claude" }] }),
      codexInvoker: async () => ({ ok: true, items: [{ provider: "codex" }] }),
    });
    assert.equal((await invoke({ config: { provider: "claude" } })).items[0].provider, "claude");
    assert.equal((await invoke({ config: { provider: "codex" } })).items[0].provider, "codex");
    const unknown = await invoke({ config: { provider: "other" } });
    assert.equal(unknown.ok, false);
    assert.match(unknown.error, /Unknown agent provider/);
  });
});
