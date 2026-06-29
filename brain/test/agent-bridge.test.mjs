import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAgentPrompt, createProviderAgentInvoker, loadAgentDefinition, loadSkillGuidance, parseAgentItems, parseDeclaredTools, resolveAgentTools, DEFAULT_AGENT_TOOLS } from "../src/agent-bridge.mjs";
import { createStepRuntime } from "../src/step-runners.mjs";
import { buildDesignState } from "../src/design-state-store.mjs";

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

describe("per-agent toolsets — the declared set drives the run, the wall still holds", () => {
  it("parses the inline comma-string `tools:` frontmatter shape", () => {
    const def = "---\nname: gtm-enrich\ntools: Read, Bash, WebSearch, WebFetch\nmodel: sonnet\n---\nBody.";
    assert.deepEqual(parseDeclaredTools(def), ["Read", "Bash", "WebSearch", "WebFetch"]);
  });

  it("parses the YAML list `tools:` frontmatter shape", () => {
    const def = "---\nname: scout\ntools:\n  - Read\n  - Grep\n  - Bash\n---\nBody.";
    assert.deepEqual(parseDeclaredTools(def), ["Read", "Grep", "Bash"]);
  });

  it("returns null when no `tools:` is declared (caller keeps the safe default)", () => {
    assert.equal(parseDeclaredTools("---\nname: x\nmodel: sonnet\n---\nBody."), null);
    assert.equal(parseDeclaredTools("no frontmatter here"), null);
    assert.equal(parseDeclaredTools(""), null);
  });

  it("grants the conservative five when nothing is declared", () => {
    const resolved = resolveAgentTools("---\nname: x\n---\nBody.");
    assert.deepEqual(resolved.allowed, DEFAULT_AGENT_TOOLS);
    assert.equal(resolved.declared, null);
    assert.deepEqual(resolved.dropped, []);
  });

  it("grants Bash only when an agent explicitly declares it", () => {
    const resolved = resolveAgentTools("---\ntools: Read, Bash, WebSearch\n---\nBody.");
    assert.deepEqual(resolved.allowed, ["Read", "Bash", "WebSearch"]);
    assert.deepEqual(resolved.dropped, []);
  });

  it("drops mutation/send tools the wall refuses, and records them", () => {
    const resolved = resolveAgentTools("---\ntools: Read, Write, Edit, Bash\n---\nBody.");
    assert.deepEqual(resolved.allowed, ["Read", "Bash"]);
    assert.deepEqual(resolved.dropped, ["Write", "Edit"]);
  });

  it("never runs blind: an all-refused declaration falls back to the safe default", () => {
    const resolved = resolveAgentTools("---\ntools: Write, Edit\n---\nBody.");
    assert.deepEqual(resolved.allowed, DEFAULT_AGENT_TOOLS);
    assert.deepEqual(resolved.dropped, ["Write", "Edit"]);
  });

  it("buildAgentPrompt carries the resolved toolset, read from the on-disk definition", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-tools-"));
    fs.writeFileSync(path.join(root, "gtm-enrich.md"), "---\nname: gtm-enrich\ntools: Read, Bash, WebSearch, WebFetch\n---\nDoctrine.");
    const built = buildAgentPrompt({ ref: "gtm-enrich", prompt: "Enrich.", items: [], agentDefinitionRoot: root });
    assert.deepEqual(built.tools.allowed, ["Read", "Bash", "WebSearch", "WebFetch"]);
    fs.rmSync(root, { recursive: true, force: true });
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

  it("folds accumulated skill guidance into the agent prompt as doctrine (not raw passthrough JSON)", () => {
    const built = buildAgentPrompt({
      ref: "channel-drafter",
      prompt: "Draft outreach.",
      items: [{ id: "1" }],
      context: { __skillGuidance: [{ ref: "positioning", guidance: "Lead with the now-you-can line." }] },
      agenticProviders: "", // pre-pack so the assembler is exercised but the skill block is what we check
    });
    // The loaded skill judgment reaches the downstream agent's prompt.
    assert.match(built.prompt, /Skill judgment loaded upstream/i);
    assert.match(built.prompt, /positioning/);
    assert.match(built.prompt, /now-you-can line/);
    // It is doctrine, not data: it must NOT be dumped as the raw passthrough JSON key.
    assert.doesNotMatch(built.prompt, /"__skillGuidance"/);
  });

  it("is a clean no-op when no skill guidance has accumulated (block omitted)", () => {
    const built = buildAgentPrompt({ ref: "channel-drafter", prompt: "Draft.", items: [], context: {}, agenticProviders: "" });
    assert.doesNotMatch(built.prompt, /Skill judgment loaded upstream/i);
  });

  it("assembles the founder's DesignState into the agent prompt through the real run-path assembler", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-design-bridge-"));
    // Exactly what runGraph injects onto a node's context (graph.mjs: `context.designState = designState`).
    const designState = buildDesignState({ projectId: "p1" }, { root });
    const built = buildAgentPrompt({
      ref: "channel-artifact-drafter",
      prompt: "Draft the landing hero.",
      items: [{ id: "1" }],
      context: { designState },
      agentDefinitionRoot: root,
      agenticProviders: "", // force the pre-pack so the assembler staples DesignState into the prompt
    });
    // The clean base-layer block is rendered into the actual agent prompt (not a standalone call).
    assert.match(built.prompt, /Warm Calm/);
    assert.match(built.prompt, /Komoot/);
    assert.match(built.prompt, /Grounded context/);
    // The design provider rode into the manifest the UI inspector reads.
    assert.ok(built.manifest.providers.find((p) => p.name === "design" && p.contributed));
    // And it is NOT also dumped as raw JSON in the passthrough (excluded from `rest`).
    assert.doesNotMatch(built.prompt, /"houseStyle": "Warm Calm"/);
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
  it("a skill step marks applied:true when the loader finds guidance AND a run accumulator can carry it", async () => {
    const runtime = createStepRuntime({ skillLoader: (ref) => (ref === "positioning" ? "guidance text" : null) });
    const ctx = { __skillGuidance: [] };
    const out = await runtime.skill({ ref: "positioning" }, [{ id: "x" }], ctx);
    assert.equal(out.ok, true);
    assert.equal(out.meta.applied, true);
    assert.equal(out.items.length, 1);
    // the loaded judgment actually reached the shared accumulator a downstream agent reads
    assert.equal(ctx.__skillGuidance.length, 1);
    assert.equal(ctx.__skillGuidance[0].ref, "positioning");
    assert.match(ctx.__skillGuidance[0].guidance, /guidance text/);
  });

  it("a skill step is honestly applied:false when there is no run accumulator to carry guidance to a consumer", async () => {
    const runtime = createStepRuntime({ skillLoader: () => "guidance text" });
    const out = await runtime.skill({ ref: "positioning" }, [{ id: "x" }], {});
    // guidance loaded, but with nowhere to flow it does NOT pretend to be applied
    assert.equal(out.meta.applied, false);
    assert.equal(out.meta.guidance, "guidance text");
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
