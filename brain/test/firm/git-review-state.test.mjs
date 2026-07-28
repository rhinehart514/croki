import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendRunDirection,
  attributeCheckpoint,
  createReviewComment,
  reconcileReviewComments,
  reviewEvidenceState,
} from "../../src/firm/git-review-state.mjs";

const base = {
  id: "workspace-one",
  threadRef: "thread:one",
  goal: "Keep the pending turn visible",
  createdAt: "2026-07-27T12:00:00.000Z",
  reviewDirections: [],
  reviewComments: [],
  verification: [],
};

describe("exact coding Review attribution", () => {
  it("joins founder direction, Run, checkpoint, exact-line correction, and its addressing Run", () => {
    const first = appendRunDirection(base, {
      runRef: "run:first",
      originMessageRef: "conversation:message-one",
      direction: "Keep the pending turn visible",
      at: "2026-07-27T12:00:00.000Z",
    });
    const checkpoint = attributeCheckpoint(first, {
      id: "turn-1",
      capturedAt: "2026-07-27T12:01:00.000Z",
    }, "run:first");
    assert.deepEqual(checkpoint, {
      id: "turn-1",
      capturedAt: "2026-07-27T12:01:00.000Z",
      runRef: "run:first",
      originMessageRef: "conversation:message-one",
      direction: "Keep the pending turn visible",
    });

    const comment = createReviewComment(first, {
      checkpointId: checkpoint.id,
      path: "ui/src/App.tsx",
      startLine: 42,
      endLine: 42,
      selectedText: "return <PendingTurn />;",
      body: "Retain this while the durable reply is pending.",
      messageRef: "conversation:correction-one",
    }, "2026-07-27T12:02:00.000Z");
    const continued = appendRunDirection({ ...first, reviewComments: [comment] }, {
      runRef: "run:continued",
      originMessageRef: "conversation:correction-one",
      direction: comment.body,
      at: "2026-07-27T12:03:00.000Z",
    });
    const reconciled = reconcileReviewComments(continued, {
      runRef: "run:continued",
      checkpointId: "turn-2",
      diff: [
        "diff --git a/ui/src/App.tsx b/ui/src/App.tsx",
        "+++ b/ui/src/App.tsx",
        "@@ -45,1 +47,1 @@",
        "+return <PendingTurn />;",
      ].join("\n"),
      at: "2026-07-27T12:04:00.000Z",
    });
    assert.equal(reconciled[0].state, "addressed-awaiting-review");
    assert.equal(reconciled[0].addressedByRunRef, "run:continued");
    assert.equal(reconciled[0].mapping, "remapped");
    assert.equal(reconciled[0].currentAnchor.startLine, 47);
    assert.equal(reconciled[0].currentAnchor.checkpointId, "turn-2");
  });

  it("keeps missing remaps and failed proof uncertain without mixing in Product claims", () => {
    const comment = createReviewComment(base, {
      checkpointId: "turn-1",
      path: "ui/src/App.tsx",
      startLine: 42,
      selectedText: "return <PendingTurn />;",
      body: "Retain the pending turn.",
    }, "2026-07-27T12:02:00.000Z");
    const [uncertain] = reconcileReviewComments({ ...base, reviewComments: [comment] }, {
      runRef: "run:other",
      checkpointId: "turn-2",
      diff: "diff --git a/ui/src/App.tsx b/ui/src/App.tsx\n+++ b/ui/src/App.tsx\n@@ -1 +1 @@\n+return null;",
      at: "2026-07-27T12:04:00.000Z",
    });
    assert.equal(uncertain.mapping, "uncertain");
    assert.equal(uncertain.currentAnchor, undefined);

    assert.equal(reviewEvidenceState({
      ...base,
      verification: [{ status: "failed", completedAt: "2026-07-27T12:05:00.000Z" }],
    }).state, "uncertain");
    assert.equal(reviewEvidenceState({
      ...base,
      verification: [{ status: "passed", completedAt: "2026-07-27T12:05:00.000Z" }],
      productConsequence: { claims: [{ status: "unsupported" }] },
    }).state, "verified");
    assert.equal(reviewEvidenceState({
      ...base,
      verification: [{ status: "passed", completedAt: "2026-07-27T12:05:00.000Z" }],
      productConsequence: { claims: [{ status: "supported-by-implementation" }] },
    }).state, "verified");
  });

  it("uses only verification attributed to the latest checkpoint Run", () => {
    assert.equal(reviewEvidenceState({
      ...base,
      runRefs: ["run:first", "run:second"],
      checkpoints: [
        { id: "turn-1", runRef: "run:first" },
        { id: "turn-2", runRef: "run:second" },
      ],
      verification: [
        { command: "npm test", status: "passed", completedAt: "2026-07-27T12:05:00.000Z", runRef: "run:first" },
        { command: "npm test", status: "failed", completedAt: "2026-07-27T12:06:00.000Z", runRef: "run:second" },
      ],
    }).state, "uncertain");
  });

  it("does not treat a whitespace-only diff check as implementation proof", () => {
    assert.equal(reviewEvidenceState({
      ...base,
      runRefs: ["run:first"],
      checkpoints: [{ id: "turn-1", runRef: "run:first" }],
      verification: [{
        command: "git diff --check",
        kind: "host",
        status: "passed",
        completedAt: "2026-07-27T12:05:00.000Z",
        runRef: "run:first",
      }],
    }).state, "unverified");
  });
});
