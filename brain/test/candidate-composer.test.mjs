import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composeCandidates } from "../src/candidate-composer.mjs";

// A fake candidate composer (the model's job) — the test exercises the host plumbing: routing on the
// ambiguity flag, normalizing each shape, and re-asserting the founder-gate wall on every candidate.
// No model, no network.

function outbound() {
  return {
    id: "outbound",
    label: "Outbound to owners",
    rationale: "Find and contact pest-control owners directly.",
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Owners" },
      { id: "draft", kind: "agent", ref: "outreach-drafter", label: "Draft" },
      { id: "gate", category: "gate", connector: "default", label: "Founder review" },
      { id: "out", category: "execute", connector: "local", label: "Stage" },
    ],
    edges: [
      { source: "src", target: "draft", edgeType: "data" },
      { source: "draft", target: "gate", edgeType: "data" },
      { source: "gate", target: "out", edgeType: "data" },
    ],
  };
}

function content() {
  return {
    id: "content",
    label: "Content play",
    rationale: "Earn inbound with a helpful post series.",
    // A research/content-only shape with no execute node needs no gate — still valid.
    nodes: [
      { id: "ctx", category: "context", connector: "product", label: "Product" },
      { id: "write", kind: "agent", ref: "post-writer", label: "Write" },
    ],
    edges: [{ source: "ctx", target: "write", edgeType: "data" }],
  };
}

describe("composeCandidates: ambiguity routing + the wall per candidate", () => {
  it("returns 2–3 normalized candidates for an AMBIGUOUS goal", async () => {
    const compose = async () => ({ ok: true, ambiguous: true, candidates: [outbound(), content()] });
    const { ambiguous, candidates } = await composeCandidates({ goal: "get more pest-control owners", compose });
    assert.equal(ambiguous, true);
    assert.equal(candidates.length, 2);
    assert.deepEqual(candidates.map((c) => c.id), ["outbound", "content"]);
    // Each candidate carries a full, normalized shape the founder's pick can build verbatim.
    assert.ok(candidates.every((c) => c.nodes.length > 0));
    assert.ok(candidates[0].nodes.some((n) => n.category === "gate"), "the outbound execute is gated");
  });

  it("stays SINGLE (not ambiguous) for a clear goal", async () => {
    const compose = async () => ({ ok: true, ambiguous: false, candidates: [] });
    const { ambiguous, candidates } = await composeCandidates({ goal: "email the 3 owners who replied", compose });
    assert.equal(ambiguous, false);
    assert.equal(candidates.length, 0);
  });

  it("REFUSES an empty goal — never weakens the blank-default-refuses invariant", async () => {
    const compose = async () => ({ ok: true, ambiguous: true, candidates: [outbound(), content()] });
    await assert.rejects(() => composeCandidates({ goal: "   ", compose }), /needs a goal/);
  });

  it("DROPS a candidate that violates the wall (execute with no founder gate)", async () => {
    const ungated = {
      id: "ungated",
      label: "Ungated send",
      nodes: [
        { id: "src", category: "source", connector: "manual", label: "Owners" },
        { id: "out", category: "execute", connector: "local", label: "Send" },
      ],
      edges: [{ source: "src", target: "out", edgeType: "data" }],
    };
    const compose = async () => ({ ok: true, ambiguous: true, candidates: [outbound(), ungated] });
    const { ambiguous, candidates } = await composeCandidates({ goal: "reach owners", compose });
    // The ungated candidate is dropped; with only one valid arm left, this is no longer a genuine fork.
    assert.equal(candidates.some((c) => c.id === "ungated"), false, "an ungated execute is never surfaced");
    assert.equal(ambiguous, false, "a single valid arm is not a fork");
  });

  it("throws honestly when the model composer returns a blank refusal", async () => {
    const compose = async () => ({ ok: false, error: "blank" });
    await assert.rejects(() => composeCandidates({ goal: "reach owners", compose }), /live Claude subscription/);
  });
});
