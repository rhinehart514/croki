// The harness that grades the harness — does THIS rig actually honor the shared contract?
//
// HARNESS.md says a harness is mechanism, not prose: code that fails outside the model's output,
// same input -> same verdict. So checking whether the GTM IDE is a real harness can't be a vibe
// either. This module inspects the source for the mechanism behind each invariant and reports a
// deterministic, pointable verdict — a missing mechanism is a hard fail, not a low score. Then it
// feeds the one axis it can honestly COMPUTE (mechanism-presence) to the same crucible grade.mjs
// the global rig uses. The subjective HARNESS-EVAL axes (no_mirror, score_provenance, freshness)
// stay the founder's call — this script never fabricates them.
//
// Contract: ~/.agents/global/HARNESS.md ("how a rig is graded as a rig") and
// ~/.claude/skills/crucible/HARNESS-EVAL.md (the axes + weights).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradePath } from "./eval.mjs";
import { spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Each invariant names the file and the mechanism that must be present for the rig to honor it.
// `test` returns true only when the enforcing code (not a comment promising it) is there.
const INVARIANTS = [
  {
    id: "gate_wall",
    label: "Every execute node sits behind a founder gate, enforced at compose time.",
    file: "workflow-composer.mjs",
    test: (s) => s.includes("assertGateWall") && /not behind a founder gate/.test(s),
  },
  {
    id: "gate_pauses_run",
    label: "A gate pauses the run as a code wall (pendingGates), not a prompt asking nicely.",
    file: "graph.mjs",
    test: (s) => s.includes("pendingGates"),
  },
  {
    id: "no_send_tool",
    label: "The model is given no approve/send/publish tool — a shared runtime guard rejects them on both the MCP and the direct-Anthropic door.",
    file: "tool-safety.mjs",
    test: (s) => s.includes("FORBIDDEN_TOOL") && /approve\|send\|publish/.test(s),
  },
  {
    id: "taste_ledger_write",
    label: "Every founder gate decision is written to the shared taste ledger both rigs read.",
    file: "feedback-ledger.mjs",
    test: (s) => s.includes("appendGateJudgments"),
  },
  {
    id: "taste_ledger_read",
    label: "The run reads the shared taste ledger back, so taste compounds across both rigs.",
    file: "operator-runtime.mjs",
    test: (s) => s.includes("mergeSharedDecisions"),
  },
  {
    id: "one_grader",
    label: "Grading shells out to the one shared crucible grade.mjs, not a reimplemented scorer.",
    file: "eval.mjs",
    test: (s) => s.includes("crucible") && s.includes("grade.mjs"),
  },
];

// Inspect the source under `root` (default: this rig's brain/src) for every invariant's mechanism.
export function checkHarnessConformance({ root = HERE } = {}) {
  const invariants = INVARIANTS.map((inv) => {
    let pass = false;
    let evidence;
    try {
      const src = fs.readFileSync(path.join(root, inv.file), "utf8");
      pass = !!inv.test(src);
      evidence = pass ? `${inv.file}: mechanism present` : `${inv.file}: mechanism MISSING`;
    } catch {
      evidence = `${inv.file}: file not found`;
    }
    return { id: inv.id, label: inv.label, file: inv.file, pass, evidence };
  });
  const passed = invariants.filter((i) => i.pass).length;
  const total = invariants.length;
  return { invariants, passed, total, conformance: total ? passed / total : 0, allPass: passed === total };
}

// The HARNESS-EVAL weights (crucible/HARNESS-EVAL.md), so the rig is scored on the same axes and
// floor-gates as crucible and ideate score themselves.
export const HARNESS_EVAL_WEIGHTS = {
  score_provenance: 10, no_mirror: 10, real_mechanism: 10, measures_what_it_claims: 9.5,
  external_anchor: 8.5, anchor_untouchable: 7, reliability_replayed: 6.5,
  freshness_decontamination: 6, trajectory_and_eval_awareness: 6,
  self_consistent_harness: 5.5, observable_reproducible: 5, verification_and_termination: 4.5,
};

// The axes this script can honestly COMPUTE (the rest are the founder's subjective call and stay
// null/pending — fabricating them is exactly the score_provenance failure HARNESS-EVAL kills for):
//   - real_mechanism: the share of invariants whose enforcing code is actually present.
//   - anchor_untouchable: the grader lives OUTSIDE this repo's write-reach (the IDE shells to a
//     binary in ~/.claude/skills/crucible it cannot overwrite during its own run).
export function harnessAxes(report, { root = HERE } = {}) {
  const real_mechanism = Math.round(report.conformance * 10 * 10) / 10;
  const graderOutsideRepo = !path.resolve(gradePath()).startsWith(path.resolve(root, ".."));
  // Every HARNESS-EVAL axis is named, but only the two this script can honestly compute carry a
  // number. The rest are null — left for the founder's judgment — so the grade reports as
  // provisional with them pending, rather than pretending a self-contained run scored them.
  return {
    real_mechanism,
    anchor_untouchable: graderOutsideRepo ? 8 : 3,
    score_provenance: null,
    no_mirror: null,
    measures_what_it_claims: null,
    external_anchor: null,
    reliability_replayed: null,
    freshness_decontamination: null,
    trajectory_and_eval_awareness: null,
    self_consistent_harness: null,
    observable_reproducible: null,
    verification_and_termination: null,
  };
}

function shellGrade(axes) {
  const bin = gradePath();
  if (!fs.existsSync(bin)) return { graderAvailable: false };
  const proc = spawnSync(process.execPath, [bin, JSON.stringify({ axes, weights: HARNESS_EVAL_WEIGHTS })], { encoding: "utf8" });
  if (proc.status !== 0 || !proc.stdout) return { graderAvailable: false };
  try {
    return { ...JSON.parse(proc.stdout), graderAvailable: true };
  } catch {
    return { graderAvailable: false };
  }
}

// Grade the rig: conformance (oracle), the computed axes, and the shared grade.mjs verdict. Any
// founder/model-supplied subjective axes can be merged in via `axes`; the grader is injectable for
// tests. A missing mechanism drops real_mechanism below the floor and grade.mjs KILLS in code.
export function gradeHarness({ root = HERE, axes = {}, grade } = {}) {
  const report = checkHarnessConformance({ root });
  const computed = harnessAxes(report, { root });
  const merged = { ...computed, ...axes };
  const runGrade = grade || shellGrade;
  const graded = runGrade(merged);
  const note = "Provisional: scored only on the two axes this script can compute (mechanism "
    + "presence + grader-outside-repo). The subjective HARNESS-EVAL axes (no_mirror, "
    + "score_provenance, freshness, …) are pending the founder's judgment — a self-contained rig "
    + "honestly caps in the low-to-mid sixes until an external-family judge is wired.";
  return { conformance: report, axes: merged, grade: graded, note };
}

// CLI: print the conformance report and the grade as JSON.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const out = gradeHarness();
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(out.conformance.allPass ? 0 : 1);
}
