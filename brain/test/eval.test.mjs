import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  deriveChannelEval,
  checkRun,
  gradeRun,
  gradePath,
} from "../src/eval.mjs";

// A composed graph (execute behind a gate) carrying an eval, plus a run result whose gate node
// holds founder-reviewed items — shaped like what runGraph produces.
function graphWithEval(checks) {
  return {
    nodes: [
      { id: "draft", kind: "agent", ref: "x" },
      { id: "gate", category: "gate" },
      { id: "send", category: "execute" },
    ],
    edges: [
      { source: "draft", target: "gate" },
      { source: "gate", target: "send" },
    ],
    eval: { checks, derivedAt: "2026-06-25T00:00:00Z" },
  };
}

function resultWithGate(items) {
  return { runId: "r1", nodes: { gate: { category: "gate", items } }, pendingGates: [] };
}

describe("eval — deriveChannelEval (the answer key, written at compose time)", () => {
  it("derives nothing with no evaluator wired, so composition is unaffected", async () => {
    assert.equal(await deriveChannelEval({ goal: "land a pilot" }), null);
  });

  it("normalizes a model's checks and drops malformed ones", async () => {
    const evaluate = async () => ({
      ok: true,
      checks: [
        { id: "Reached Gate!", kind: "reached_gate", label: "work reached review" },
        { kind: "min_items", n: 3, label: "at least 3 drafts" },
        { kind: "has_field", field: "personalFact", label: "every draft names a real fact" },
        { kind: "bogus", label: "dropped" },
        "not an object",
      ],
    });
    const spec = await deriveChannelEval({ goal: "land a pilot", evaluate });
    assert.equal(spec.checks.length, 3);
    assert.equal(spec.checks[0].id, "reached-gate");
    assert.equal(spec.checks[1].n, 3);
    assert.equal(spec.checks[2].field, "personalFact");
    assert.ok(spec.derivedAt);
  });
});

describe("eval — checkRun (the oracle tier, deterministic)", () => {
  it("scores structural checks and machine-checkable eval checks off a run", () => {
    const graph = graphWithEval([
      { id: "min", kind: "min_items", n: 2, label: "at least 2 items" },
      { id: "field", kind: "has_field", field: "draft", label: "every item has a draft" },
      { id: "appr", kind: "approved", label: "at least one approved" },
      { id: "judge", kind: "judgment", label: "opener names a real fact" },
    ]);
    const result = resultWithGate([
      { draft: "warm note", approvalStatus: "approved" },
      { draft: "second note", approvalStatus: "rejected" },
    ]);
    const oracle = checkRun({ graph, result });

    assert.equal(oracle.reachedGate, true);
    assert.equal(oracle.approvedCount, 1);
    assert.equal(oracle.axes.reached_gate, 10);
    assert.equal(oracle.axes.gate_wall, 10); // execute behind gate
    assert.equal(oracle.axes.contract_emitted, 10);
    assert.equal(oracle.axes.approved, 10);
    assert.equal(oracle.axes.eval_coverage, 10); // all machine checks pass

    const judge = oracle.evalChecks.find((c) => c.kind === "judgment");
    assert.equal(judge.pass, null, "judgment checks are left for the founder, not machine-graded");
  });

  // Regression: composition is free-form, so gated items may carry content under ANY field names
  // (a post as { post_text }), not just the outreach draft aliases. Grading must see that content,
  // or every non-outreach run reads as "emitted nothing" no matter what it staged.
  it("recognizes content on non-outreach-shaped items (open fields, e.g. post_text)", () => {
    const graph = graphWithEval([
      { id: "field", kind: "has_field", field: "draft", label: "every item carries content" },
    ]);
    const result = resultWithGate([
      { post_text: "Shipped the Drover morning queue today — one place to clear every venture's calls.", scheduled_for: "2026-07-02T09:00:00Z", approvalStatus: "approved" },
    ]);
    const oracle = checkRun({ graph, result });
    assert.equal(oracle.axes.contract_emitted, 10, "open-shaped content counts as emitted");
    const field = oracle.evalChecks.find((c) => c.id === "field");
    assert.equal(field.pass, true, "the draft-field check reads the item's open content");
  });

  it("flags the wall when an execute node has no gate upstream", () => {
    const graph = {
      nodes: [{ id: "send", category: "execute" }],
      edges: [],
    };
    const oracle = checkRun({ graph, result: resultWithGate([]) });
    assert.equal(oracle.axes.gate_wall, 0);
  });
});

describe("eval — gradeRun (oracle, then the shared grader)", () => {
  it("uses an injected grader and returns its verdict over the oracle axes", () => {
    const graph = graphWithEval([{ id: "min", kind: "min_items", n: 1, label: "at least 1" }]);
    const result = resultWithGate([{ draft: "note", approvalStatus: "approved" }]);
    const fakeGrade = ({ axes }) => {
      assert.ok(axes.reached_gate === 10);
      return { overall: 8.5, verdict: "Strong" };
    };
    const graded = gradeRun({ graph, result }, { grade: fakeGrade });
    assert.equal(graded.overall, 8.5);
    assert.equal(graded.verdict, "Strong");
    assert.equal(graded.graderAvailable, true);
  });

  it("shells out to the real crucible grade.mjs when present (one grader, both rigs)", () => {
    if (!fs.existsSync(gradePath())) return; // skip on machines without the crucible skill
    const graph = graphWithEval([{ id: "min", kind: "min_items", n: 1, label: "at least 1" }]);
    const result = resultWithGate([{ draft: "note", approvalStatus: "approved" }]);
    const graded = gradeRun({ graph, result });
    assert.equal(graded.graderAvailable, true);
    assert.equal(typeof graded.overall, "number");
    assert.equal(typeof graded.verdict, "string");
  });
});
