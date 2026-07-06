// outcome-loop-close.test.mjs — the run → outcome → belief loop actually closes.
//
// What this proves:
//   - A POSITIVE outcome (reply / meeting / purchase / signup) that joins back to a bet's path CONFIRMS
//     the belief links that bet was testing: it raises their confidence, marks them "confirmed", and
//     records the outcome as observed evidence so the belief's "thin evidence" weakness clears on the
//     next derive.
//   - A NEGATIVE outcome (ignored / objection) SNAPS: it lowers that confidence and marks the link
//     "challenged".
//   - Either way, the feedback stroke appears: an "updates" edge from the outcome card back to the bet.
//   - A source ref a founder reads is a plain phrase or a URL, never a raw "path:line".

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ingestOutcome } from "../src/outcome-ingest.mjs";
import { gtmPathStore, runStore, productTruthStore } from "../src/gtm-store.mjs";
import { objectGraphStore, normalizeObjectNode } from "../src/object-graph-store.mjs";
import { objectGraphForProject } from "../src/object-graph-projection.mjs";
import { friendlySource } from "../src/evidence.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "outcome-loop-")) };
}

// Seed a product truth that stands only on founder-provided evidence (so it carries a "thin evidence"
// weakness), a bet resting on it, and a staged run with one join key. Optionally pre-seed the stored
// "supports" link at a starting confidence so a confirm has room to raise it.
function seedBet(options, { projectId = "strelva", supportsConfidence } = {}) {
  const truth = productTruthStore.create(
    {
      projectId,
      statement: "The app records project_created events",
      evidence: [{ claim: "founder says it logs the event", source: "founder-note", solidity: "observed" }],
    },
    options,
  );
  const gtmPath = gtmPathStore.create(
    {
      projectId,
      summary: "Reach solo founders with a launch nudge",
      bet: { buyer: "solo founders", channel: "discord", offer: "checklist" },
      restsOn: [{ type: "productTruth", id: truth.id }],
      status: "selected",
    },
    options,
  );
  const run = runStore.create(
    {
      projectId,
      pathId: gtmPath.id,
      status: "staged",
      items: [{ joinKey: "handle-ada", buyer: "Ada", channel: "discord", offer: "checklist", message: "hey Ada" }],
    },
    options,
  );
  const beliefId = `obj-${truth.id}`;
  const pathObjectId = `obj-${gtmPath.id}`;
  if (Number.isFinite(supportsConfidence)) {
    objectGraphStore.save(
      {
        projectId,
        nodes: [],
        edges: [{
          source: beliefId,
          target: pathObjectId,
          type: "supports",
          status: "proposed",
          basis: [{ kind: "run", ref: gtmPath.id, preview: "path rests on this card" }],
          confidence: supportsConfidence,
        }],
      },
      options,
    );
  }
  return { projectId, truthId: truth.id, pathId: gtmPath.id, beliefId, pathObjectId };
}

function supportsEdge(graph, beliefId, pathObjectId) {
  return graph.edges.find((e) => e.type === "supports" && e.source === beliefId && e.target === pathObjectId);
}
function beliefEvidenceWeakness(graph, beliefId) {
  const node = graph.nodes.find((n) => n.id === beliefId);
  return (node?.weaknesses ?? []).find((w) => w.kind === "evidence" && w.status === "open") ?? null;
}

describe("outcome → belief loop closes on the object graph", () => {
  it("a positive outcome confirms the tested link, raises its confidence, and clears the belief weakness", () => {
    const options = freshRoot();
    const { projectId, beliefId, pathObjectId } = seedBet(options, { supportsConfidence: 60 });

    // Before: the belief stands only on founder evidence, so it carries an open thin-evidence weakness.
    const before = objectGraphForProject(projectId, options).graph;
    assert.ok(beliefEvidenceWeakness(before, beliefId), "belief fires a thin-evidence weakness before the outcome");
    assert.equal(supportsEdge(before, beliefId, pathObjectId).confidence, 60);

    const { result, loop } = ingestOutcome({ joinKey: "handle-ada", outcomeKind: "reply" }, { ...options, projectId });
    assert.equal(loop.closed, true);
    assert.equal(loop.polarity, "confirm");

    const after = objectGraphForProject(projectId, options).graph;
    const edge = supportsEdge(after, beliefId, pathObjectId);
    assert.equal(edge.status, "confirmed", "the tested support link is confirmed");
    assert.equal(edge.confidence, 80, "confidence rose by the confirm delta (60 → 80)");
    assert.equal(beliefEvidenceWeakness(after, beliefId), null, "the belief's thin-evidence weakness cleared");

    // The feedback stroke: an updates edge from the outcome card back to the bet.
    const updates = after.edges.find(
      (e) => e.type === "updates" && e.source === `obj-${result.id}` && e.target === pathObjectId,
    );
    assert.ok(updates, "an updates edge now runs from the outcome back to the bet");
    assert.equal(updates.status, "confirmed");
  });

  it("a negative outcome snaps the tested link: lower confidence, challenged, and still draws the stroke", () => {
    const options = freshRoot();
    const { projectId, beliefId, pathObjectId } = seedBet(options, { projectId: "snap-co", supportsConfidence: 90 });

    const { result, loop } = ingestOutcome({ joinKey: "handle-ada", outcomeKind: "objection" }, { ...options, projectId });
    assert.equal(loop.closed, true);
    assert.equal(loop.polarity, "snap");

    const after = objectGraphForProject(projectId, options).graph;
    const edge = supportsEdge(after, beliefId, pathObjectId);
    assert.equal(edge.status, "challenged", "the tested support link is challenged");
    assert.equal(edge.confidence, 60, "confidence fell by the snap delta (90 → 60)");

    const updates = after.edges.find(
      (e) => e.type === "updates" && e.source === `obj-${result.id}` && e.target === pathObjectId,
    );
    assert.ok(updates, "an updates edge runs from the outcome back to the bet");
    assert.equal(updates.status, "challenged");
  });

  it("an out-of-band outcome (no path) or an unreadable kind leaves the graph untouched", () => {
    const options = freshRoot();
    const { projectId } = seedBet(options, { projectId: "quiet-co" });
    const neutral = ingestOutcome({ joinKey: "handle-ada", outcomeKind: "note" }, { ...options, projectId });
    assert.equal(neutral.loop.closed, false, "an unreadable outcome kind closes nothing");
    const unjoined = ingestOutcome({ joinKey: "no-such-key", outcomeKind: "reply" }, { ...options, projectId });
    assert.equal(unjoined.loop.closed, false, "an outcome that joins no path closes nothing");
  });
});

describe("provenance a founder reads is never a raw path:line", () => {
  it("collapses a file path to a plain phrase, keeps a URL, leaves ids and labels alone", () => {
    assert.equal(friendlySource("REB/AGENTS.md:146"), "from your product's notes");
    assert.equal(friendlySource("src/app.ts:42"), "from your product's code");
    assert.equal(friendlySource("config/settings.json"), "from your product's config");
    assert.equal(friendlySource("https://news.ycombinator.com/item?id=1"), "https://news.ycombinator.com/item?id=1");
    assert.equal(friendlySource("obj-123-abc"), "obj-123-abc");
    assert.equal(friendlySource("notes:1"), "notes:1"); // no extension → a plain label, not a path
  });

  it("a source ref normalizes to founder-friendly on a saved card", () => {
    const node = normalizeObjectNode({
      projectId: "p",
      domain: "product",
      type: "capability",
      maturity: "typed",
      statement: "The scanner reads win events",
      sources: [{ kind: "scan", ref: "REB/AGENTS.md:146" }],
    });
    assert.equal(node.sources[0].ref, "from your product's notes");
    assert.equal(node.sources[0].preview, "from your product's notes");
  });
});
