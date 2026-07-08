// Unit-tests the teammate-voice narrator with an injected runQuery fake — never a subprocess. Proves the
// wiring (one line, quotes stripped, capped), the cache (identical beat is not re-called), the degrade
// (error/empty → null so the caller falls back to the template), and THE WALL (a booby-trapped soul's raw
// prompt / scratch learning / soul internal cannot reach the prompt handed to the model).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTeammateNarrator } from "../src/teammate-narrator.mjs";
import { deriveVoiceBrief } from "../src/teammate-soul.mjs";

const BRIEF = {
  ref: "outreach-writer",
  name: "Maya",
  register: "crisp, dry",
  stance: "I earn my spot by finding what everyone skimmed.",
  standing: "proving",
  convictions: ["Lead with the buyer's trigger."],
  record: { runs: 2, sent: 3, replies: 1, wins: 0 },
};

// A runQuery fake that records every call and returns a scripted reply.
function fakeRunQuery(reply) {
  const calls = [];
  const fn = async (args) => {
    calls.push(args);
    return typeof reply === "function" ? reply(args, calls.length) : reply;
  };
  fn.calls = calls;
  return fn;
}

describe("teammate-narrator: the model's line becomes one clean display string", () => {
  it("trims to one line, strips surrounding quotes, and caps the length", async () => {
    const runQuery = fakeRunQuery({ text: `"I'm digging into who actually skimmed this."\nsecond line ignored` });
    const narrate = createTeammateNarrator({ runQuery });
    const line = await narrate({ brief: BRIEF, phase: "start", node: { nodeId: "n1", label: "Draft outreach" } });
    assert.equal(line, "I'm digging into who actually skimmed this.");
  });

  it("caps an over-long reply at ~140 chars with an ellipsis", async () => {
    const runQuery = fakeRunQuery({ text: "x".repeat(400) });
    const narrate = createTeammateNarrator({ runQuery });
    const line = await narrate({ brief: BRIEF, phase: "start", node: { nodeId: "n1", label: "Draft" } });
    assert.ok(line.length <= 141, `line should be capped, got ${line.length}`);
    assert.ok(line.endsWith("…"));
  });
});

describe("teammate-narrator: caches per teammate+phase+node", () => {
  it("a second call with the same ref+phase+nodeId does NOT re-invoke runQuery", async () => {
    const runQuery = fakeRunQuery({ text: "On it." });
    const narrate = createTeammateNarrator({ runQuery });
    const first = await narrate({ brief: BRIEF, phase: "start", node: { nodeId: "n1", label: "Draft" } });
    const second = await narrate({ brief: BRIEF, phase: "start", node: { nodeId: "n1", label: "Draft" } });
    assert.equal(first, second);
    assert.equal(runQuery.calls.length, 1, "the cached beat must not re-call the model");
  });

  it("a different nodeId re-invokes", async () => {
    const runQuery = fakeRunQuery((_args, n) => ({ text: `beat ${n}` }));
    const narrate = createTeammateNarrator({ runQuery });
    await narrate({ brief: BRIEF, phase: "start", node: { nodeId: "n1", label: "Draft" } });
    await narrate({ brief: BRIEF, phase: "start", node: { nodeId: "n2", label: "Draft" } });
    assert.equal(runQuery.calls.length, 2);
  });

  it("a different phase re-invokes", async () => {
    const runQuery = fakeRunQuery((_args, n) => ({ text: `beat ${n}` }));
    const narrate = createTeammateNarrator({ runQuery });
    await narrate({ brief: BRIEF, phase: "start", node: { nodeId: "n1", label: "Draft" } });
    await narrate({ brief: BRIEF, phase: "done", node: { nodeId: "n1", label: "Draft" }, count: 3 });
    assert.equal(runQuery.calls.length, 2);
  });
});

describe("teammate-narrator: degrades to null so the caller falls back to the template", () => {
  it("runQuery returning an error → null", async () => {
    const narrate = createTeammateNarrator({ runQuery: fakeRunQuery({ error: "boom" }) });
    const line = await narrate({ brief: BRIEF, phase: "start", node: { nodeId: "n1", label: "Draft" } });
    assert.equal(line, null);
  });

  it("runQuery returning empty text → null", async () => {
    const narrate = createTeammateNarrator({ runQuery: fakeRunQuery({ text: "" }) });
    assert.equal(await narrate({ brief: BRIEF, phase: "start", node: { nodeId: "n1" } }), null);
  });

  it("runQuery returning whitespace → null", async () => {
    const narrate = createTeammateNarrator({ runQuery: fakeRunQuery({ text: "   \n  \n " }) });
    assert.equal(await narrate({ brief: BRIEF, phase: "start", node: { nodeId: "n1" } }), null);
  });

  it("runQuery throwing → null (never a thrown error into the streaming run)", async () => {
    const runQuery = async () => { throw new Error("subprocess died"); };
    const narrate = createTeammateNarrator({ runQuery });
    assert.equal(await narrate({ brief: BRIEF, phase: "start", node: { nodeId: "n1" } }), null);
  });

  it("a miss is NOT cached — a later success still writes the beat", async () => {
    let n = 0;
    const runQuery = async () => (++n === 1 ? { error: "transient" } : { text: "Got it now." });
    const narrate = createTeammateNarrator({ runQuery });
    assert.equal(await narrate({ brief: BRIEF, phase: "start", node: { nodeId: "n1" } }), null);
    assert.equal(await narrate({ brief: BRIEF, phase: "start", node: { nodeId: "n1" } }), "Got it now.");
  });
});

describe("teammate-narrator: THE WALL — no raw prompt / soul internal reaches the model", () => {
  const MARKER = "RAW_PROMPT_MARKER_do_not_surface_7c1e";

  it("a booby-trapped soul → brief → narrator prompt contains the marker NOWHERE", async () => {
    const soul = {
      ref: "outreach-writer",
      name: "Maya",
      voice: { register: "crisp, dry", stance: "I earn my spot by finding what everyone skimmed." },
      soul: [
        { id: `soul:${MARKER}`, patternKey: MARKER, why: MARKER, source: MARKER, text: "Lead with the buyer's trigger." },
      ],
      learnings: [
        { patternKey: MARKER, why: MARKER, source: "gate", text: MARKER, status: "watching", occurrences: [] },
      ],
      record: { runs: 2, sent: 3, replies: 1, wins: 0 },
    };
    const definition = { name: "Maya", systemPrompt: `You are Maya. Internal ops: ${MARKER}.` };
    const brief = deriveVoiceBrief(soul, { definition });

    const runQuery = fakeRunQuery({ text: "On it." });
    const narrate = createTeammateNarrator({ runQuery });
    // Also feed a booby-trapped node label to prove the situation clause carries only cosmetic surface.
    await narrate({ brief, phase: "start", node: { nodeId: "n1", label: "Draft outreach" } });

    assert.equal(runQuery.calls.length, 1);
    const prompt = runQuery.calls[0].prompt;
    assert.equal(prompt.includes(MARKER), false, `the narrator prompt leaked a raw prompt / soul internal:\n${prompt}`);
    // The founder-safe voice DID survive — the wall subtracts internals, it does not empty the voice.
    assert.ok(prompt.includes("crisp, dry"), "the register should reach the model");
    assert.ok(prompt.includes("Lead with the buyer's trigger."), "the promoted conviction should reach the model");
  });
});
