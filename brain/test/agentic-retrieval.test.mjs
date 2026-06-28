import { test } from "node:test";
import assert from "node:assert/strict";

import {
  agenticRetrievalEnabled,
  buildAgentPrompt,
  buildContextToolDefs,
} from "../src/agent-bridge.mjs";
import { createRetrievalTools } from "../src/context/retrieval-tools.mjs";

const REF = "test-nonexistent-agent-xyz"; // no on-disk definition → pure label path
const CONTEXT = {
  grounding: { productName: "RodentRadar", headline: "Remote rodent monitoring", evidenceState: "proven" },
  market: { buyer: "Independent pest-control operators", trigger: "audit season" },
};

test("agenticRetrievalEnabled: an explicit boolean overrides the env switch", () => {
  const prior = process.env.GTM_AGENTIC_RETRIEVAL;
  try {
    process.env.GTM_AGENTIC_RETRIEVAL = "1";
    assert.equal(agenticRetrievalEnabled(false), false, "explicit false must win over env=1");
    process.env.GTM_AGENTIC_RETRIEVAL = "";
    assert.equal(agenticRetrievalEnabled(true), true, "explicit true must win over env unset");
    assert.equal(agenticRetrievalEnabled(), false, "env unset defaults off");
    process.env.GTM_AGENTIC_RETRIEVAL = "1";
    assert.equal(agenticRetrievalEnabled(), true, "env=1 turns it on when no explicit value");
  } finally {
    if (prior === undefined) delete process.env.GTM_AGENTIC_RETRIEVAL;
    else process.env.GTM_AGENTIC_RETRIEVAL = prior;
  }
});

test("default (pre-pack) mode is unchanged: stapled grounding, no retrieval tools", () => {
  const built = buildAgentPrompt({ ref: REF, prompt: "draft outreach", context: CONTEXT, agenticRetrieval: false });
  assert.match(built.prompt, /Grounded context:/);
  assert.match(built.prompt, /RodentRadar/);
  assert.doesNotMatch(built.prompt, /Context tools —/);
  assert.equal(built.retrievalTools, null);
  // The pre-pack manifest shape (provider list), not the agentic one.
  assert.ok(Array.isArray(built.manifest.providers));
});

test("agentic mode hands over a tool catalog instead of a stapled block", () => {
  const built = buildAgentPrompt({ ref: REF, prompt: "draft outreach", context: CONTEXT, agenticRetrieval: true });
  assert.match(built.prompt, /Context tools —/);
  assert.match(built.prompt, /get_taste/);
  // The grounded text is NOT pre-loaded — the agent must pull it.
  assert.doesNotMatch(built.prompt, /Grounded context:/);
  assert.equal(built.retrievalTools.length, 7);
  assert.equal(built.manifest.mode, "agentic");
  assert.deepEqual(built.manifest.offered, built.retrievalTools.map((t) => t.name));
  // Standing moat-protection instruction is present.
  assert.match(built.prompt, /Always call get_taste before drafting/);
});

test("buildContextToolDefs produces MCP-shaped handlers over the verified tools", async () => {
  const tools = createRetrievalTools(CONTEXT);
  const defs = buildContextToolDefs(tools);
  assert.equal(defs.length, tools.length);

  const product = defs.find((d) => d.name === "get_product");
  const result = await product.handler();
  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, /RodentRadar/);

  // A tool whose source is absent returns the honest note as text, never throws.
  const signal = defs.find((d) => d.name === "get_signal");
  const blank = await signal.handler();
  assert.match(blank.content[0].text, /No external signal/i);
});
