import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  checkHarnessConformance,
  gradeHarness,
  harnessAxes,
} from "../src/harness-check.mjs";
import { gradePath } from "../src/eval.mjs";

describe("harness-check — does this rig honor the shared contract?", () => {
  it("finds every invariant's mechanism present in the real source", () => {
    const report = checkHarnessConformance();
    const missing = report.invariants.filter((i) => !i.pass).map((i) => i.id);
    assert.deepEqual(missing, [], `missing mechanisms: ${missing.join(", ")}`);
    assert.equal(report.allPass, true);
    assert.equal(report.conformance, 1);
  });

  it("computes only the two honest axes and leaves the subjective ones pending (null)", () => {
    const axes = harnessAxes(checkHarnessConformance());
    assert.equal(axes.real_mechanism, 10);
    assert.equal(axes.anchor_untouchable, 8);
    assert.equal(axes.no_mirror, null);
    assert.equal(axes.score_provenance, null);
  });

  it("grades the real rig as not-dead, provisional, via an injected grader", () => {
    const seen = {};
    const fakeGrade = (axes) => {
      Object.assign(seen, axes);
      return { state: "GRADED", overall: 8.8, verdict: "Strong", provisional: true, pending: ["no_mirror"] };
    };
    const out = gradeHarness({ grade: fakeGrade });
    assert.equal(seen.real_mechanism, 10);
    assert.equal(out.grade.verdict, "Strong");
    assert.match(out.note, /pending the founder/);
  });

  it("KILLS in code when a mechanism is missing (empty source root)", () => {
    if (!fs.existsSync(gradePath())) return; // needs the real grade.mjs to prove the floor-gate
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-harness-empty-"));
    try {
      const out = gradeHarness({ root: empty });
      assert.equal(out.conformance.allPass, false);
      assert.equal(out.axes.real_mechanism, 0);
      // real_mechanism is a HARNESS-EVAL floor-gate axis: below 4 it hard-kills in grade.mjs.
      assert.equal(out.grade.state, "KILLED");
      assert.equal(out.grade.verdict, "Dead");
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});
