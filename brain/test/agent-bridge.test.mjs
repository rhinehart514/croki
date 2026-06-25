import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAgentPrompt, createProviderAgentInvoker, loadAgentDefinition, loadSkillGuidance, parseAgentItems } from "../src/agent-bridge.mjs";
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

describe("loadAgentDefinition — agent doctrine from disk (symmetric with loadSkillGuidance)", () => {
  it("reads ~/.claude/agents/<ref>.md when present", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-agents-"));
    fs.writeFileSync(path.join(root, "gtm-enrich.md"), "# Enrich\nResearch only. Never send.");
    const def = loadAgentDefinition("gtm-enrich", { root });
    assert.match(def, /Research only/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reads ~/.claude/agents/<ref>/AGENT.md as a fallback", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-agents-"));
    fs.mkdirSync(path.join(root, "scout"));
    fs.writeFileSync(path.join(root, "scout", "AGENT.md"), "# Scout\nDirectory-form definition.");
    const def = loadAgentDefinition("scout", { root });
    assert.match(def, /Directory-form/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("prefers an explicit artifactPath over the ref-derived location", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-agents-"));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-agents-root-"));
    fs.writeFileSync(path.join(root, "proof.md"), "ref-derived");
    const artifactPath = path.join(dir, "instance-definition.md");
    fs.writeFileSync(artifactPath, "instance-specific definition");
    const def = loadAgentDefinition("proof", { artifactPath, root });
    assert.equal(def, "instance-specific definition");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns null for a missing definition rather than throwing", () => {
    assert.equal(loadAgentDefinition("does-not-exist", { root: "/tmp/none-here" }), null);
    assert.equal(loadAgentDefinition("", {}), null);
    assert.equal(loadAgentDefinition("x", { artifactPath: "/tmp/none-here/missing.md", root: "/tmp/none-here" }), null);
  });
});

describe("buildAgentPrompt — merges a loaded definition, no-ops cleanly when absent", () => {
  it("merges the on-disk definition into the prompt when one is found", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-agents-"));
    fs.writeFileSync(path.join(root, "gtm-enrich.md"), "DOCTRINE: free-tier waterfall, read-only.");
    const built = buildAgentPrompt({ ref: "gtm-enrich", prompt: "Enrich these.", items: [{ id: "1" }], agentDefinitionRoot: root });
    assert.equal(built.definitionLoaded, true);
    assert.match(built.prompt, /Follow this agent definition/);
    assert.match(built.prompt, /free-tier waterfall/);
    // the ref is still named so the task stays anchored to the agent
    assert.match(built.prompt, /gtm-enrich/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("is a clean no-op with the same shape when no definition loads", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-agents-empty-"));
    const built = buildAgentPrompt({ ref: "gtm-enrich", prompt: "Enrich these.", items: [{ id: "1" }], agentDefinitionRoot: root });
    assert.equal(built.definitionLoaded, false);
    // identical to the pre-wiring behavior: the original one-line label, no definition block
    assert.match(built.prompt, /You are doing the work of the "gtm-enrich" GTM subagent\./);
    assert.doesNotMatch(built.prompt, /Follow this agent definition/);
    // shape preserved: prompt + manifest still present
    assert.equal(typeof built.prompt, "string");
    assert.ok("manifest" in built);
    fs.rmSync(root, { recursive: true, force: true });
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
