import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  createIdeaBar,
  blankIdeaBar,
  IDEA_BAR_WEIGHTS,
} from "../src/idea-bar.mjs";
import { gradePath } from "../src/eval.mjs";

describe("idea-bar — the separate critic", () => {
  it("blank bar grades nothing and kills nothing (honest no-op)", async () => {
    const out = await blankIdeaBar({ idea: "some idea", goal: "land a pilot" });
    assert.equal(out.barScore, null);
    assert.equal(out.killed, false);
    assert.equal(out.verdict, "survived");
    assert.equal(out.ungraded, true);
  });

  it("scores axes then grades them into a verdict (both halves injected)", async () => {
    const score = async () => ({ ok: true, axes: { showable: 8, demo_is_core: 8, loop_able: 7, edge: 7, differentiation: 7, distinctiveness: 7 } });
    // Fake grade: a strong axis set survives.
    const grade = ({ axes }) => {
      assert.deepEqual(Object.keys(IDEA_BAR_WEIGHTS).sort(), Object.keys(axes).sort());
      return { overall: 7.2, verdict: "Strong", state: "GRADED", graderAvailable: true };
    };
    const bar = createIdeaBar({ score, grade });
    const out = await bar({ idea: "a strong idea", goal: "x" });
    assert.equal(out.killed, false);
    assert.equal(out.verdict, "survived");
    assert.equal(out.barScore, 7.2);
  });

  it("a KILLED grade is dead, not a low score", async () => {
    const score = async () => ({ ok: true, axes: { showable: 2, demo_is_core: 8, loop_able: 7, edge: 7, differentiation: 7, distinctiveness: 7 } });
    const grade = () => ({ overall: null, verdict: "Dead", state: "KILLED", graderAvailable: true });
    const bar = createIdeaBar({ score, grade });
    const out = await bar({ idea: "demo-bait", goal: "x" });
    assert.equal(out.killed, true);
    assert.equal(out.verdict, "killed");
  });

  it("drops out-of-vocabulary axes and clamps to range", async () => {
    const seen = {};
    const score = async () => ({ ok: true, axes: { showable: 99, bogus: 5, loop_able: -3 } });
    const grade = ({ axes }) => { Object.assign(seen, axes); return { overall: 5, verdict: "Viable", graderAvailable: true }; };
    const bar = createIdeaBar({ score, grade });
    await bar({ idea: "idea" });
    assert.equal(seen.showable, 10);
    assert.equal(seen.loop_able, 0);
    assert.equal("bogus" in seen, false);
  });

  it("a failed scorer survives ungraded rather than dying on a missing critic", async () => {
    const bar = createIdeaBar({ score: async () => ({ ok: false, error: "no critic" }) });
    const out = await bar({ idea: "idea" });
    assert.equal(out.killed, false);
    assert.equal(out.ungraded, true);
  });

  // Integration with the REAL shared grade.mjs: showable below the floor must KILL in code, proving the
  // bar reuses the same self-enforcing binary the eval rig uses (skipped when the skill is absent).
  it("kills via the real crucible grade.mjs floor-gate when present", async (t) => {
    if (!fs.existsSync(gradePath())) return t.skip("crucible grade.mjs not installed");
    const bar = createIdeaBar({ score: async () => ({ ok: true, axes: { showable: 1, demo_is_core: 8, loop_able: 7, edge: 7, differentiation: 7, distinctiveness: 7 } }) });
    const out = await bar({ idea: "cannot be screen-recorded", goal: "x" });
    assert.equal(out.killed, true);
    assert.equal(out.graderAvailable, true);
  });
});
