// The shared grader's location on disk.
//
// The composition/run-grading scaffolding that once lived here (an answer-key derivation and an
// oracle-first run grader) was removed: no evaluator was ever wired, so it always derived nothing and
// graded nothing. The real learning signal is the founder's gate decisions, banked as taste memory
// (memory.mjs / feedback-ledger.mjs). What survives here is only the path to the one shared grader
// binary both rigs call, used by idea-bar.mjs and harness-check.mjs.

import os from "node:os";
import path from "node:path";

// The shared grader both rigs call. Configurable so a machine without the crucible skill, or a
// test, can point elsewhere.
export function gradePath() {
  return process.env.CRUCIBLE_GRADE_PATH
    || path.join(os.homedir(), ".claude", "skills", "crucible", "bin", "grade.mjs");
}
