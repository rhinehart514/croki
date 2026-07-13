import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAgentPrompt, classifyAgentError, classifyEmptyItems, createClaudeAgentInvoker, createProviderAgentInvoker, loadAgentDefinition, loadSkillGuidance, parseAgentItems, parseAgentReasoning, parseDeclaredTools, resolveAgentTools, DEFAULT_AGENT_TOOLS } from "../src/agent-bridge.mjs";
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

  it("does not import legacy program-bound doctrine into another venture", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-agents-bound-"));
    fs.writeFileSync(path.join(root, "first-contact.md"), `---
name: first-contact
programId: program-rodent-outreach
agentInstanceId: rodent-writer-v1
tools: Read, WebSearch
---
Draft only for pest-control operators.
Evidence: /Users/founder/.claude/projects/rodentradar/memory/MEMORY.md:0`);
    const built = buildAgentPrompt({
      ref: "first-contact",
      prompt: "Draft for the active product.",
      items: [],
      context: { __run: { projectId: "acme-saas" } },
      agentDefinitionRoot: root,
    });
    assert.equal(built.definitionLoaded, false);
    assert.doesNotMatch(built.prompt, /pest-control|rodentradar|program-rodent/i);
    assert.match(built.prompt, /Draft for the active product/);
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

describe("parseAgentReasoning — capture the teammate's pre-JSON prose", () => {
  it("captures the plain-language prose before a fenced block", () => {
    const text = "I checked the three operators and kept the two with a real trigger.\n\n```json\n[{\"id\":\"a\"}]\n```";
    assert.equal(parseAgentReasoning(text), "I checked the three operators and kept the two with a real trigger.");
  });
  it("captures prose before a bare inline array when the model skipped the fence", () => {
    assert.equal(parseAgentReasoning("Here's what I found: [{\"id\":1}]"), "Here's what I found:");
  });
  it("returns empty string when the whole message is JSON (no fabricated narration)", () => {
    assert.equal(parseAgentReasoning('[{"id":1}]'), "");
    assert.equal(parseAgentReasoning(""), "");
    assert.equal(parseAgentReasoning(null), "");
  });
});

describe("agent invoker carries reasoning onto the result (Wave 2)", () => {
  it("captures pre-JSON prose as result.reasoning while items still parse", async () => {
    const invoke = createProviderAgentInvoker({
      claudeInvoker: async () => {
        // Simulate the real invoker's internals via the actual parse helpers on a narrate-then-JSON text.
        const text = "Two prospects fit, both shipped in the last month.\n```json\n[{\"name\":\"Ada\"},{\"name\":\"Bo\"}]\n```";
        return { ok: true, items: parseAgentItems(text), reasoning: parseAgentReasoning(text), meta: {} };
      },
    });
    const out = await invoke({ ref: "gtm-find-prospects", config: { provider: "claude" } });
    assert.equal(out.ok, true);
    assert.equal(out.items.length, 2);
    assert.equal(out.reasoning, "Two prospects fit, both shipped in the last month.");
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

// classifyEmptyItems is the pure read the bad-output OBSERVATION rides on. It must draw the honest-empty
// carve-out exactly: a parseable [] (or an object coercing to []) is a legitimate empty result (null — not
// bad output), blank text is empty_output, and non-empty prose with nothing parseable is unparseable_output.
describe("classifyEmptyItems — honest-empty vs unusable output (the bad-output observation read)", () => {
  it("a parseable empty array is an honest empty result → null (never bad output)", () => {
    assert.equal(classifyEmptyItems("[]"), null);
    assert.equal(classifyEmptyItems("Here's what I found:\n```json\n[]\n```"), null);
  });
  it("blank / whitespace-only text → empty_output (the model said nothing)", () => {
    assert.equal(classifyEmptyItems(""), "empty_output");
    assert.equal(classifyEmptyItems("   \n  "), "empty_output");
    assert.equal(classifyEmptyItems(null), "empty_output");
  });
  it("the honest-empty-in-PROSE case is flagged unparseable, and the INVOKER carve-out keeps it passing through", () => {
    // classifyEmptyItems alone cannot tell honest-empty-prose from garbage, so it returns unparseable_output
    // for "I could not find any operators." The regression the fix prevents lives at the INVOKER (below),
    // which keeps ok:true/items:[] for exactly this text — this pins the shape the invoker relies on.
    assert.equal(classifyEmptyItems("I could not find any operators."), "unparseable_output");
  });
  it("non-empty prose with nothing JSON-parseable → unparseable_output", () => {
    assert.equal(classifyEmptyItems("total garbage, no json here"), "unparseable_output");
  });
});

// The Claude agent invoker is now injectable via runQuery. These tests drive the REAL invoker transform and
// pin the never-change-run-behavior guarantee: an empty result (honest or unusable) still returns
// ok:true/items:[] — it never flips to ok:false and never halts the branch — while an unusable empty carries
// a meta.badOutput observation the self-observation sink reads.
describe("createClaudeAgentInvoker — bad output is pure observation, never a behavior change", () => {
  const fakeQuery = (text) => async () => ({ text, error: null, toolCalls: [] });

  it("a parseable [] keeps ok:true with items:[] and NO badOutput signal (honest empty)", async () => {
    const invoke = createClaudeAgentInvoker({ runQuery: fakeQuery("```json\n[]\n```") });
    const out = await invoke({ ref: "gtm-find" });
    assert.equal(out.ok, true, "an honest empty result stays ok:true — the branch is never halted");
    assert.deepEqual(out.items, []);
    assert.equal(out.meta.badOutput, undefined, "a parseable [] is not bad output");
  });

  it("honest-empty-in-PROSE ('I could not find any operators.') still passes through as ok:true/items:[] (the finding #5 regression, now fixed)", async () => {
    const invoke = createClaudeAgentInvoker({ runQuery: fakeQuery("I could not find any operators.") });
    const out = await invoke({ ref: "gtm-find" });
    assert.equal(out.ok, true, "a polite empty-in-prose result must NOT flip to ok:false and kill the branch");
    assert.deepEqual(out.items, []);
    // It IS observed as bad output (the invoker can't distinguish it from garbage) but ok:true is preserved,
    // so control flow is unchanged — the observation is filed without touching the run.
    assert.equal(out.meta.badOutput, "unparseable_output");
  });

  it("blank output → ok:true/items:[] with a meta.badOutput of empty_output (observed, not halted)", async () => {
    const invoke = createClaudeAgentInvoker({ runQuery: fakeQuery("") });
    const out = await invoke({ ref: "gtm-find" });
    assert.equal(out.ok, true);
    assert.deepEqual(out.items, []);
    assert.equal(out.meta.badOutput, "empty_output");
  });

  it("real items keep ok:true and carry no badOutput signal", async () => {
    const invoke = createClaudeAgentInvoker({ runQuery: fakeQuery('```json\n[{"name":"Ada"}]\n```') });
    const out = await invoke({ ref: "gtm-find" });
    assert.equal(out.ok, true);
    assert.equal(out.items.length, 1);
    assert.equal(out.meta.badOutput, undefined);
  });

  it("a quota/turn error from the query still returns ok:false with its errorKind (unchanged)", async () => {
    const invoke = createClaudeAgentInvoker({
      runQuery: async () => ({ text: "", error: { kind: "limit", retriable: true, message: "usage limit reached" }, toolCalls: [] }),
    });
    const out = await invoke({ ref: "gtm-find" });
    assert.equal(out.ok, false, "a real quota error is still a failure — this path is unchanged");
    assert.equal(out.meta.errorKind, "limit");
  });
});

// classifyAgentError's generic is_error bucket must stay kind:"error" (the retriable-unknown model error),
// which the self-observation sink maps to a transient model error — never a self-inflicted JS bug.
describe("classifyAgentError — a generic provider error stays the retriable-unknown 'error' kind", () => {
  it("an is_error result with no known token is kind:'error' (the sink treats it as a transient model error)", () => {
    const c = classifyAgentError({ result: "Overloaded", is_error: true });
    assert.equal(c.kind, "error");
  });
});
