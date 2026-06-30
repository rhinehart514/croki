import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  deriveIdeaOutcome,
  appendIdeaOutcomeToCrucible,
  recordIdeaOutcomeFromRun,
} from "../src/idea-derivation.mjs";
import { createGtmIdea, attachBuildWiring, getGtmIdea } from "../src/idea-store.mjs";
import { recordRunDerivations } from "../src/run-derivation.mjs";

let parent;
let options;

beforeEach(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-idea-deriv-"));
  options = { root: parent };
  // Default: point the crucible ledger at a path that does not exist, so no test ever writes to the
  // real ~/.founder-os ledger. Individual tests override this with a stub when they want to assert the
  // append actually fires.
  process.env.CRUCIBLE_LEDGER_PATH = path.join(parent, "no-such-ledger.mjs");
});

afterEach(() => {
  delete process.env.CRUCIBLE_LEDGER_PATH;
  fs.rmSync(parent, { recursive: true, force: true });
});

// A tiny stand-in for the crucible ledger CLI: it records the `append <json>` call to a file so the
// test can assert what was handed to it, and prints the ledger's ok-shaped response.
function writeStubLedger(dir) {
  const captured = path.join(dir, "captured.json");
  const script = path.join(dir, "ledger-stub.mjs");
  fs.writeFileSync(
    script,
    `import fs from "node:fs";\n` +
      `const [cmd, json] = process.argv.slice(2);\n` +
      `fs.writeFileSync(${JSON.stringify(captured)}, JSON.stringify({ cmd, rec: JSON.parse(json || "{}") }));\n` +
      `process.stdout.write(JSON.stringify({ ok: true, seq: 0 }));\n`,
  );
  return { script, captured };
}

const graph = { id: "ch-scorecard", name: "Public scorecard", nodes: [{ id: "gate", category: "gate", label: "Founder review" }] };

function gateResult() {
  return {
    graphId: "ch-scorecard",
    runId: "run-9",
    nodes: {
      gate: {
        category: "gate",
        items: [
          { id: "a", approvalStatus: "approved", draft: "Hi" },
          { id: "b", approvalStatus: "approved", draft: "Hey" },
          { id: "c", approvalStatus: "rejected", draft: "Nope" },
        ],
      },
    },
  };
}

describe("idea-derivation — deriveIdeaOutcome", () => {
  it("counts gate approvals and rejections into a real outcome", () => {
    const outcome = deriveIdeaOutcome({ graph, result: gateResult() });
    assert.equal(outcome.reachedGate, true);
    assert.equal(outcome.approved, 2);
    assert.equal(outcome.rejected, 1);
    assert.equal(outcome.reviewed, 3);
    assert.equal(outcome.channelId, "ch-scorecard");
  });

  it("returns null when the run produced no gate (nothing measurable yet)", () => {
    assert.equal(deriveIdeaOutcome({ graph, result: { nodes: { src: { category: "source", items: [] } } } }), null);
  });
});

describe("idea-derivation — appendIdeaOutcomeToCrucible", () => {
  it("reports available:false when the ledger is absent, never throws", () => {
    const out = appendIdeaOutcomeToCrucible({ idea: "x" }, { ledgerPath: path.join(parent, "missing.mjs") });
    assert.equal(out.available, false);
  });

  it("hands the idea + outcome to the ledger's append command when present", () => {
    const { script, captured } = writeStubLedger(parent);
    const out = appendIdeaOutcomeToCrucible({ idea: "Public scorecard", angle: "asset-first" }, { ledgerPath: script });
    assert.equal(out.available, true);
    const seen = JSON.parse(fs.readFileSync(captured, "utf8"));
    assert.equal(seen.cmd, "append");
    assert.equal(seen.rec.idea, "Public scorecard");
    assert.equal(seen.rec.angle, "asset-first");
  });
});

describe("idea-derivation — recordIdeaOutcomeFromRun closes the loop", () => {
  it("writes the run outcome back onto the kept idea wired to the channel", () => {
    const idea = createGtmIdea({ projectId: "p1", angle: "asset-first", pitch: "Public scorecard from the repo.", verdict: "survived" }, options);
    attachBuildWiring(idea.id, { channelId: "ch-scorecard", graphId: "ch-scorecard" }, options);

    const out = recordIdeaOutcomeFromRun({ projectId: "p1", graph, result: gateResult() }, options);
    assert.ok(out, "an outcome was recorded");
    assert.equal(out.idea.outcome.approved, 2);
    assert.equal(getGtmIdea(idea.id, options).outcome.reviewed, 3);
    // The crucible ledger was absent (env points at a missing path), so it reported unavailable — but
    // the idea-store write still happened.
    assert.equal(out.crucible.available, false);
  });

  it("also appends to the crucible ledger when one is present", () => {
    const { script, captured } = writeStubLedger(parent);
    process.env.CRUCIBLE_LEDGER_PATH = script;
    const idea = createGtmIdea({ projectId: "p1", angle: "asset-first", pitch: "Public scorecard.", verdict: "survived" }, options);
    attachBuildWiring(idea.id, { graphId: "ch-scorecard" }, options);

    const out = recordIdeaOutcomeFromRun({ projectId: "p1", graph, result: gateResult() }, options);
    assert.equal(out.crucible.available, true);
    const seen = JSON.parse(fs.readFileSync(captured, "utf8"));
    assert.equal(seen.rec.ideaId, idea.id);
    assert.equal(seen.rec.outcome.approved, 2);
    assert.equal(seen.rec.domain, "gtm");
  });

  it("returns null when no kept idea is wired to the channel", () => {
    assert.equal(recordIdeaOutcomeFromRun({ projectId: "p1", graph, result: gateResult() }, options), null);
  });

  it("ignores a killed idea — a dead idea never gets a fresh outcome", () => {
    // A killed idea cannot be wired (idea-store refuses), so even a manual wiring is skipped by match.
    createGtmIdea({ projectId: "p1", pitch: "dead", killed: true, buildWiring: { graphId: "ch-scorecard" } }, options);
    assert.equal(recordIdeaOutcomeFromRun({ projectId: "p1", graph, result: gateResult() }, options), null);
  });
});

describe("run-derivation — the idea deriver fires as the fourth leg", () => {
  it("recordRunDerivations returns an idea result when a wired idea exists", () => {
    const idea = createGtmIdea({ projectId: "p1", angle: "asset-first", pitch: "Scorecard.", verdict: "survived" }, options);
    attachBuildWiring(idea.id, { graphId: "ch-scorecard" }, options);

    const out = recordRunDerivations({ projectId: "p1", graph, result: gateResult() }, options);
    assert.ok("idea" in out, "the seam exposes the idea leg");
    assert.equal(out.idea.idea.outcome.approved, 2);
  });

  it("idea leg is null (not an error) when nothing is wired", () => {
    const out = recordRunDerivations({ projectId: "p1", graph, result: gateResult() }, options);
    assert.equal(out.idea, null);
    assert.ok("feedback" in out && "promotion" in out && "experiment" in out);
  });
});
