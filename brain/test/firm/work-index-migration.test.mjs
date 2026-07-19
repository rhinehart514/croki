import assert from "node:assert/strict";
import { test } from "node:test";
import { projectWorkIndex } from "../../src/firm/work-index.mjs";

test("legacy directions remain visible and distinct after the first canonical thread", () => {
  const current = {
    id: "current", name: "Current direction", messageRefs: [], subjectRefs: [], participantRefs: [],
    parentThreadRef: "thread:venture-root", lifecycle: "open", reviewedThrough: null, properties: {},
    createdAt: "2026-07-18T10:00:00.000Z", updatedAt: "2026-07-18T10:00:00.000Z",
  };
  const bets = [
    { id: "legacy-a", intent: "Compare onboarding approaches", forkedFrom: null, createdAt: "2026-07-17T10:01:00.000Z", updatedAt: "2026-07-17T10:01:00.000Z", staged: [], evidence: [], events: [] },
    { id: "legacy-b", intent: "Trace the evidence return", forkedFrom: null, createdAt: "2026-07-17T10:02:00.000Z", updatedAt: "2026-07-17T10:02:00.000Z", staged: [], evidence: [], events: [] },
  ];
  const messages = [{ id: "nearby", role: "founder", content: "Inspect the whole experience", betId: null, createdAt: "2026-07-17T10:00:00.000Z" }];
  const model = { revision: 1, threads: [current], runs: [], objects: [], relationships: [], compatibility: { architecture: { revision: 1 } } };
  const index = projectWorkIndex({ ventureId: "venture-a", model, bets, messages });
  assert.equal(index.items.length, 3);
  assert.deepEqual(new Set(index.items.map((item) => item.founderIntent)), new Set([
    "Current direction",
    "Compare onboarding approaches",
    "Trace the evidence return",
  ]));
});
