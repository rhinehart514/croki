import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { extractDecisions, buildDraftMemory, renderDraftMemory, draftKey } from "../src/memory.mjs";
import { run as gateRun } from "../src/connectors/gate/default.mjs";
import { run as draftRun } from "../src/connectors/draft/claude.mjs";
import { runGraph } from "../src/graph.mjs";

// A recorded run whose gate node carries founder decisions, shaped like what
// flow-store.recordFlowRun persists.
function runWithGate(items) {
  return { result: { nodes: { "gate-review": { category: "gate", items } } } };
}

describe("memory — extractDecisions", () => {
  it("reads approved and rejected drafts off a recorded gate node", () => {
    const runs = [
      runWithGate([
        { name: "A", email: "a@x.com", draft: "warm note to A", approvalStatus: "approved" },
        { name: "B", email: "b@x.com", draft: "stiff pitch to B", approvalStatus: "rejected" },
        { name: "C", email: "c@x.com", draft: "no decision", approvalStatus: "pending" },
      ]),
    ];
    const d = extractDecisions(runs);
    assert.equal(d.approved.length, 1);
    assert.equal(d.approved[0].draft, "warm note to A");
    assert.equal(d.rejected.length, 1);
    assert.equal(d.rejected[0].draft, "stiff pitch to B");
  });

  it("captures founder edits as before/after pairs", () => {
    const runs = [
      runWithGate([
        { name: "A", email: "a@x.com", draft: "the founder's rewrite", editedFrom: "the model's draft", approvalStatus: "approved" },
      ]),
    ];
    const d = extractDecisions(runs);
    assert.equal(d.edits.length, 1);
    assert.deepEqual(d.edits[0], { from: "the model's draft", to: "the founder's rewrite" });
  });

  it("reads newest decisions first and dedupes by item + status", () => {
    const runs = [
      runWithGate([{ name: "A", email: "a@x.com", draft: "old", approvalStatus: "approved" }]),
      runWithGate([{ name: "A", email: "a@x.com", draft: "new", approvalStatus: "approved" }]),
    ];
    const d = extractDecisions(runs);
    assert.equal(d.approved.length, 1);
    assert.equal(d.approved[0].draft, "new");
  });

  it("ignores items without a real draft string", () => {
    const runs = [runWithGate([{ name: "A", approvalStatus: "approved" }])];
    const d = extractDecisions(runs);
    assert.equal(d.approved.length, 0);
  });

  it("reads the agent drafter's fields (draft_note / founder_name), not just the legacy ones", () => {
    // Regression: agent-drafted items carry draft_note / founder_name / gtmActionId, never
    // draft / name. Before the fix, approving one recorded nothing and taste stayed empty forever.
    const runs = [
      runWithGate([
        { founder_name: "Mario", gtmActionId: "act-1", draft_note: "grounded note to Mario", approvalStatus: "approved" },
        { founder_name: "Luca", gtmActionId: "act-2", draft_note: "the founder rewrite", editedFrom: "the model draft", approvalStatus: "approved" },
      ]),
    ];
    const d = extractDecisions(runs);
    assert.equal(d.approved.length, 2);
    assert.equal(d.approved[0].draft, "grounded note to Mario");
    assert.equal(d.approved[0].name, "Mario");
    assert.equal(d.edits.length, 1);
    assert.deepEqual(d.edits[0], { from: "the model draft", to: "the founder rewrite" });
  });

  // Regression: composition is free-form, so a staged item may carry its content under ANY field
  // names — a scheduled X post as { post_text, offer, scheduled_for }, a note as { note }. Gate
  // decisions on those shapes must train taste like any outreach draft; before the fix only the
  // outreach aliases banked and every other pipeline's decisions taught nothing.
  it("banks decisions on non-outreach-shaped items (open fields, e.g. post_text)", () => {
    const runs = [
      runWithGate([
        { gtmActionId: "post-1", post_text: "Shipped the Drover morning queue today.", offer: "50% off", scheduled_for: "2026-07-02T09:00:00Z", approvalStatus: "approved" },
        { gtmActionId: "post-2", post_text: "Buy my thing!!! Link in bio!!!", approvalStatus: "rejected" },
      ]),
    ];
    const d = extractDecisions(runs);
    assert.equal(d.approved.length, 1);
    assert.equal(d.approved[0].draft, "Shipped the Drover morning queue today.");
    assert.equal(d.rejected.length, 1);
    assert.equal(d.rejected[0].draft, "Buy my thing!!! Link in bio!!!");
    const memory = buildDraftMemory(d);
    assert.match(renderDraftMemory(memory), /morning queue/);
  });

  it("still banks nothing from an item with only identity fields (a name is not a voice)", () => {
    const runs = [runWithGate([{ name: "A", url: "https://x.com/a", approvalStatus: "approved" }])];
    assert.equal(extractDecisions(runs).approved.length, 0);
  });

  it("keys an agent-drafted item (no email/url/name) by a founder fallback so decisions match", () => {
    assert.equal(draftKey({ founder_github_or_url: "github.com/x", gtmActionId: "act-9" }), "github.com/x");
    assert.equal(draftKey({ gtmActionId: "act-9" }), "act-9");
    // legacy items still key exactly as before (email wins)
    assert.equal(draftKey({ email: "a@x.com", gtmActionId: "act-9" }), "a@x.com");
  });
});

describe("memory — buildDraftMemory", () => {
  it("returns null on the first run (nothing learned yet)", () => {
    assert.equal(buildDraftMemory({ approved: [], rejected: [], edits: [] }), null);
    assert.equal(buildDraftMemory(null), null);
  });

  it("caps examples and flattens to draft strings", () => {
    const decisions = {
      approved: [{ draft: "1" }, { draft: "2" }, { draft: "3" }, { draft: "4" }],
      rejected: [{ draft: "x" }],
      edits: [],
    };
    const m = buildDraftMemory(decisions, { maxExamples: 3 });
    assert.deepEqual(m.approved, ["1", "2", "3"]);
    assert.deepEqual(m.rejected, ["x"]);
  });
});

describe("memory — renderDraftMemory", () => {
  it("renders approved and rejected guidance into the prompt block", () => {
    const block = renderDraftMemory({ approved: ["good one"], rejected: ["bad one"], edits: [] });
    assert.match(block, /APPROVED/);
    assert.match(block, /good one/);
    assert.match(block, /REJECTED/);
    assert.match(block, /bad one/);
  });

  it("is empty when there is no memory", () => {
    assert.equal(renderDraftMemory(null), "");
  });
});

describe("gate — per-item founder decisions", () => {
  it("stamps approve / reject / pending and applies edits", async () => {
    const node = {
      runtime: {
        decisions: {
          "a@x.com": { decision: "approve" },
          "b@x.com": { decision: "reject" },
          "c@x.com": { decision: "approve", editedDraft: "founder rewrite" },
        },
      },
    };
    const upstream = [
      { type: "prospect", email: "a@x.com", draft: "draft a" },
      { type: "prospect", email: "b@x.com", draft: "draft b" },
      { type: "prospect", email: "c@x.com", draft: "draft c" },
      { type: "prospect", email: "d@x.com", draft: "draft d" },
    ];
    const result = await gateRun(node, upstream);
    const byEmail = Object.fromEntries(result.items.map((i) => [i.email, i]));

    assert.equal(byEmail["a@x.com"].approvalStatus, "approved");
    assert.equal(byEmail["b@x.com"].approvalStatus, "rejected");
    assert.equal(byEmail["b@x.com"].approved, false);
    assert.equal(byEmail["c@x.com"].draft, "founder rewrite");
    assert.equal(byEmail["c@x.com"].editedFrom, "draft c");
    assert.equal(byEmail["d@x.com"].approvalStatus, "pending");
    assert.equal(result.pendingReview, true);
    assert.equal(result.meta.approved, 2);
    assert.equal(result.meta.rejected, 1);
  });

  it("writes an inline edit back onto the field the reviewable content came from (open shapes)", async () => {
    // A staged X post carries its content as post_text, not draft. The founder's rewrite must land
    // on post_text too — a downstream executor reading the item's own shape would otherwise send
    // the pre-edit text — and editedFrom must capture the original so the edit banks into taste.
    const node = {
      runtime: {
        decisions: {
          "post-1": { decision: "approve", editedDraft: "the founder's rewritten post" },
        },
      },
    };
    const upstream = [
      { id: "post-1", type: "x-post", post_text: "the model's original post text", scheduled_for: "tomorrow 9am" },
    ];
    const result = await gateRun(node, upstream);
    const item = result.items[0];
    assert.equal(item.approvalStatus, "approved");
    assert.equal(item.post_text, "the founder's rewritten post");
    assert.equal(item.editedFrom, "the model's original post text");
    // legacy readers still see the rewrite under the draft aliases
    assert.equal(item.draft, "the founder's rewritten post");
    assert.equal(item.draft_note, "the founder's rewritten post");
    // untouched fields survive
    assert.equal(item.scheduled_for, "tomorrow 9am");
  });

  it("falls back to node-level approve-all for backward compatibility", async () => {
    const result = await gateRun({ runtime: { approved: true } }, [{ type: "prospect", draft: "x" }]);
    assert.equal(result.items[0].approvalStatus, "approved");
    assert.equal(result.pendingReview, false);
  });
});

describe("draft — consumes loop memory", () => {
  let savedKey;
  beforeEach(() => { savedKey = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = "test-key-no-network"; });
  afterEach(() => {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it("reports the memory it received (empty-prospect path makes no network call)", async () => {
    const memory = { approved: ["a", "b"], rejected: ["x"], edits: [] };
    const result = await draftRun({ config: {}, agentPrompt: "" }, [], { __memory: memory });
    assert.equal(result.ok, true);
    assert.deepEqual(result.meta.memory, { approved: 2, rejected: 1, edits: 0 });
  });
});

describe("runGraph — loop memory reaches the generate node", () => {
  it("injects opts.memory into the generate node context end to end", async () => {
    const savedKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-no-network";
    try {
      const graph = {
        id: "mem-wiring",
        nodes: [{ id: "gen", category: "generate", connector: "claude", label: "Draft", config: {}, agentPrompt: "" }],
        edges: [],
      };
      const memory = { approved: ["one", "two"], rejected: [], edits: [] };
      const result = await runGraph(graph, { memory });
      assert.deepEqual(result.nodes.gen.meta.memory, { approved: 2, rejected: 0, edits: 0 });
    } finally {
      if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
      else delete process.env.ANTHROPIC_API_KEY;
    }
  });
});

describe("memory — draftKey", () => {
  it("prefers stable identifiers", () => {
    assert.equal(draftKey({ email: "e", url: "u" }), "e");
    assert.equal(draftKey({ url: "u", name: "n" }), "u");
    assert.equal(draftKey({ name: "n" }), "n");
    assert.equal(draftKey({}), null);
  });
});
