import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectCrystallizationCandidates,
  normalizeProcedure,
  isJudgmentAction,
} from "../src/crystallization.mjs";

test("normalizeProcedure collapses the same deterministic procedure across different inputs", () => {
  const x = normalizeProcedure({ verb: "research", targetType: "operator", args: { id: "X" } });
  const y = normalizeProcedure({ verb: "research", targetType: "operator", args: { id: "Y" } });
  assert.equal(x, y); // same procedure, different concrete operator
  assert.match(x, /^proc:/);
});

test("normalizeProcedure keeps distinct procedures distinct", () => {
  const research = normalizeProcedure({ verb: "research", targetType: "operator" });
  const score = normalizeProcedure({ verb: "score", targetType: "lead" });
  assert.notEqual(research, score);
});

test("judgment actions get a unique signature and never collapse", () => {
  const a = normalizeProcedure({ verb: "draft", draft: "Hi Mike, quick question." });
  const b = normalizeProcedure({ verb: "draft", draft: "Hi Dana, congrats." });
  assert.match(a, /^judgment:/);
  assert.notEqual(a, b); // two drafts never match -> never crystallize
  assert.equal(isJudgmentAction({ verb: "draft" }), true);
  assert.equal(isJudgmentAction({ verb: "research" }), false);
});

test("an explicit judgment verb cannot bypass the guard via a hand-set signature", () => {
  const sig = normalizeProcedure({ verb: "draft", signature: "proc:draft:email" });
  assert.match(sig, /^judgment:/);
});

test("detectCrystallizationCandidates surfaces deterministic procedures past the threshold", () => {
  const log = [
    { verb: "research", targetType: "operator", args: { id: "A" } },
    { verb: "research", targetType: "operator", args: { id: "B" } },
    { verb: "research", targetType: "operator", args: { id: "C" } },
    { verb: "score", targetType: "lead", args: { id: "A" } }, // only once
    { verb: "draft", draft: "one" }, // judgment, excluded
    { verb: "draft", draft: "two" },
    { verb: "draft", draft: "three" },
  ];
  const candidates = detectCrystallizationCandidates(log, { threshold: 3 });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].count, 3);
  assert.match(candidates[0].signature, /research/);
  // The repeated drafting is judgment — it must NOT crystallize even though it recurred 3 times.
  assert.ok(!candidates.some((c) => /draft/.test(c.signature)));
});

test("threshold gates the candidate list", () => {
  const log = [
    { verb: "enrich", targetType: "company" },
    { verb: "enrich", targetType: "company" },
  ];
  assert.equal(detectCrystallizationCandidates(log, { threshold: 3 }).length, 0);
  assert.equal(detectCrystallizationCandidates(log, { threshold: 2 }).length, 1);
});

test("bare string actions are handled", () => {
  const log = ["research operator alpha", "research operator beta", "research operator gamma"];
  const candidates = detectCrystallizationCandidates(log, { threshold: 3 });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].count, 3);
});

test("invalid input throws", () => {
  assert.throws(() => detectCrystallizationCandidates("nope"));
  assert.throws(() => detectCrystallizationCandidates([], { threshold: 0 }));
});
