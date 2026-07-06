import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { gradePath } from "../src/eval.mjs";

describe("eval — gradePath (the one shared grader's location)", () => {
  it("points at the crucible grade.mjs by default", () => {
    const prev = process.env.CRUCIBLE_GRADE_PATH;
    delete process.env.CRUCIBLE_GRADE_PATH;
    try {
      assert.equal(
        gradePath(),
        path.join(os.homedir(), ".claude", "skills", "crucible", "bin", "grade.mjs"),
      );
    } finally {
      if (prev !== undefined) process.env.CRUCIBLE_GRADE_PATH = prev;
    }
  });

  it("honors an explicit override so a machine without the skill can point elsewhere", () => {
    const prev = process.env.CRUCIBLE_GRADE_PATH;
    process.env.CRUCIBLE_GRADE_PATH = "/tmp/custom-grade.mjs";
    try {
      assert.equal(gradePath(), "/tmp/custom-grade.mjs");
    } finally {
      if (prev === undefined) delete process.env.CRUCIBLE_GRADE_PATH;
      else process.env.CRUCIBLE_GRADE_PATH = prev;
    }
  });
});
