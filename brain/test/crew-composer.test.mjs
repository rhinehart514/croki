import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createCrewComposer } from "../src/crew-composer.mjs";

// The crew composer drafts a teammate from a sentence. WI-2 adds a FOUNDER-SAFE voice { register, stance }
// alongside the name/description/systemPrompt. These tests exercise the host plumbing — parsing the voice
// as its own field, keeping the operating instructions OUT of it — with an injected fake model call. No
// network, no real Claude.
function fakeQuery(spec) {
  return async () => ({ text: JSON.stringify(spec) });
}

describe("crew-composer: a composed draft carries a founder-safe voice", () => {
  it("returns voice { register, stance } separate from the systemPrompt", async () => {
    const compose = createCrewComposer({
      runQuery: fakeQuery({
        ref: "practice-verifier",
        name: "Practice Verifier",
        description: "Verifies a dental practice is real and reachable before outreach.",
        systemPrompt: "You are a verifier. INTERNAL OPS: query these five databases in order and never skip step 3.",
        voice: { register: "precise, unhurried", stance: "I earn my keep by catching the fake listing before it wastes your time." },
      }),
    });

    const draft = await compose({ description: "verify dental practices" });
    assert.equal(draft.voice.register, "precise, unhurried");
    assert.equal(draft.voice.stance, "I earn my keep by catching the fake listing before it wastes your time.");
    // The operating instructions live on systemPrompt, and NEVER bleed into the surfaceable voice.
    assert.equal(JSON.stringify(draft.voice).includes("INTERNAL OPS"), false, "voice must not carry the operating instructions");
    assert.ok(draft.systemPrompt.includes("INTERNAL OPS"), "the systemPrompt still carries the operating instructions");
    // The voice is not written into the on-disk markdown either (it lives on the soul, not the agent file).
    assert.equal(draft.markdown.includes("precise, unhurried"), false, "the voice must not land in the agent markdown");
  });

  it("a draft with no voice returns voice:null (the soul falls back deterministically)", async () => {
    const compose = createCrewComposer({
      runQuery: fakeQuery({ ref: "x", name: "X", description: "does x", systemPrompt: "You are X." }),
    });
    const draft = await compose({ description: "do x" });
    assert.equal(draft.voice, null);
  });
});
