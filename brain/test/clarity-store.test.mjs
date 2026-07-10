import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadClarity, addClarity, clarityGrounding, projectQuestions, removeClarity, updateClarity } from "../src/clarity-store.mjs";
import { recordFounderDecision } from "../src/feedback-ledger.mjs";

describe("clarity-store — durable pinned Ideate output", () => {
  let parent;
  let options;
  const projectId = "acme";

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-clarity-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  describe("add — pins one clarity object", () => {
    it("accepts all four kinds and stamps id + createdAt", () => {
      for (const kind of ["claim", "direction", "icp", "question"]) {
        const item = addClarity(projectId, { kind, text: `a ${kind}` }, options);
        assert.equal(item.kind, kind);
        assert.equal(item.text, `a ${kind}`);
        assert.match(item.id, /^clarity-/);
        assert.ok(!Number.isNaN(Date.parse(item.createdAt)));
      }
      assert.equal(loadClarity(projectId, options).length, 4);
    });

    it("trims text and keeps an optional note when present", () => {
      const item = addClarity(projectId, { kind: "claim", text: "  trimmed  ", note: "  why  " }, options);
      assert.equal(item.text, "trimmed");
      assert.equal(item.note, "why");
    });

    it("omits note when blank", () => {
      const item = addClarity(projectId, { kind: "question", text: "open?", note: "   " }, options);
      assert.ok(!("note" in item));
    });
  });

  describe("validation — a malformed pin is rejected", () => {
    it("rejects a kind outside the four", () => {
      assert.throws(() => addClarity(projectId, { kind: "claimm", text: "x" }, options), /Invalid clarity kind/);
      assert.throws(() => addClarity(projectId, { kind: "", text: "x" }, options), /Invalid clarity kind/);
    });

    it("rejects empty or whitespace-only text", () => {
      assert.throws(() => addClarity(projectId, { kind: "claim", text: "" }, options), /text is required/);
      assert.throws(() => addClarity(projectId, { kind: "claim", text: "   " }, options), /text is required/);
    });

    it("does not persist a rejected pin", () => {
      try { addClarity(projectId, { kind: "bad", text: "x" }, options); } catch {}
      assert.equal(loadClarity(projectId, options).length, 0);
    });
  });

  describe("list", () => {
    it("returns an empty list for a project with no pins", () => {
      assert.deepEqual(loadClarity("never-touched", options), []);
    });

    it("returns pins oldest-first in insertion order", () => {
      addClarity(projectId, { kind: "claim", text: "first" }, options);
      addClarity(projectId, { kind: "direction", text: "second" }, options);
      const items = loadClarity(projectId, options);
      assert.deepEqual(items.map((i) => i.text), ["first", "second"]);
    });
  });

  describe("remove", () => {
    it("removes a pinned object by id and reports true", () => {
      const a = addClarity(projectId, { kind: "claim", text: "keep" }, options);
      const b = addClarity(projectId, { kind: "icp", text: "drop" }, options);
      assert.equal(removeClarity(projectId, b.id, options), true);
      const items = loadClarity(projectId, options);
      assert.deepEqual(items.map((i) => i.id), [a.id]);
    });

    it("reports false for an unknown id and leaves the list intact", () => {
      addClarity(projectId, { kind: "claim", text: "keep" }, options);
      assert.equal(removeClarity(projectId, "clarity-nope", options), false);
      assert.equal(loadClarity(projectId, options).length, 1);
    });
  });

  describe("project isolation", () => {
    it("does not let two projects see each other's clarity", () => {
      addClarity("alpha", { kind: "claim", text: "alpha-only" }, options);
      addClarity("beta", { kind: "direction", text: "beta-only" }, options);

      const alpha = loadClarity("alpha", options);
      const beta = loadClarity("beta", options);
      assert.deepEqual(alpha.map((i) => i.text), ["alpha-only"]);
      assert.deepEqual(beta.map((i) => i.text), ["beta-only"]);

      // Removing from one never touches the other.
      removeClarity("alpha", alpha[0].id, options);
      assert.equal(loadClarity("alpha", options).length, 0);
      assert.equal(loadClarity("beta", options).length, 1);
    });
  });

  describe("optional question anchors", () => {
    it("keeps stable open refs for crew, evidence, and product context", () => {
      const question = addClarity(projectId, {
        id: "question-adoption",
        kind: "question",
        text: "Why do qualified founders stop before activation?",
        participantRefs: ["buyer-researcher", { type: "teammate", id: "activation-lead" }, "buyer-researcher"],
        evidenceRefs: ["signal-1", { type: "outcome", id: "result-1" }],
        productRefs: [{ type: "product-element", id: "onboarding" }],
      }, options);
      assert.equal(question.id, "question-adoption");
      assert.equal(question.status, "open");
      assert.deepEqual(question.participantRefs, [
        { type: null, id: "buyer-researcher" },
        { type: "teammate", id: "activation-lead" },
      ]);
      assert.deepEqual(question.evidenceRefs, [
        { type: null, id: "signal-1" },
        { type: "outcome", id: "result-1" },
      ]);

      const updated = updateClarity(projectId, question.id, {
        status: "waiting-on-evidence",
        participantRefs: [{ type: "teammate", id: "activation-lead" }],
      }, options);
      assert.equal(updated.id, question.id);
      assert.equal(updated.createdAt, question.createdAt);
      assert.equal(updated.status, "waiting-on-evidence");
      assert.deepEqual(updated.participantRefs, [{ type: "teammate", id: "activation-lead" }]);
    });

    it("projects transient questions without pinning and preserves disagreement as separate sourced positions", () => {
      addClarity(projectId, {
        id: "question-positioning",
        kind: "question",
        text: "Should the promise lead with speed or control?",
        participantRefs: [{ type: "teammate", id: "positioning-lead" }],
      }, options);
      const decision = recordFounderDecision({
        projectId,
        kind: "branch.selected",
        value: "Run the smallest control-first proof test.",
        questionId: "question-positioning",
        sourceRef: { type: "branch-choice", id: "choice-1" },
      }, options).receipt;

      const projected = projectQuestions(projectId, {
        transientQuestions: [{ id: "operator-question-1", projectId, type: "operator-event", question: "Would a proof page settle this?" }],
        positions: [
          {
            id: "artifact-speed", projectId, questionId: "question-positioning", agentRef: "positioning-lead",
            statement: "Lead with speed.", relation: "supports-speed",
            evidenceRefs: [{ type: "product-truth", id: "truth-fast-path" }], uncertainty: "No buyer language yet.",
          },
          {
            id: "artifact-control", projectId, questionId: "question-positioning", agentRef: "buyer-researcher",
            statement: "Lead with control.", relation: "challenges-speed",
            evidenceRefs: [{ type: "market-source", id: "interviews" }], falsifier: "Speed wins the buyer test.",
          },
        ],
        sourceRecords: [{ id: "pipeline-1", type: "pipeline", projectId, questionId: "question-positioning" }],
      }, options);

      assert.equal(projected.length, 2);
      const pinned = projected.find((item) => item.id === "question-positioning");
      assert.equal(pinned.pinned, true);
      assert.equal(pinned.positions.length, 2);
      assert.deepEqual(pinned.positions.map((item) => item.participantRef), [
        { type: null, id: "positioning-lead" },
        { type: null, id: "buyer-researcher" },
      ]);
      assert.ok(!Object.prototype.hasOwnProperty.call(pinned, "consensus"));
      assert.deepEqual(pinned.backlinks, [
        { type: "pipeline", id: "pipeline-1" },
        { type: "decision", id: decision.id },
      ]);
      assert.equal(projected.find((item) => item.id === "operator-question-1").pinned, false);
      assert.deepEqual(loadClarity(projectId, options).map((item) => item.id), ["question-positioning"]);
    });

    it("archives a referenced question, deletes an unreferenced one, and never crosses projects", () => {
      const referenced = addClarity("alpha", { kind: "question", text: "Which gap matters?" }, options);
      const loose = addClarity("alpha", { kind: "question", text: "Temporary" }, options);
      recordFounderDecision({
        projectId: "alpha",
        kind: "question.deferred",
        value: "Wait for an observed signup.",
        questionId: referenced.id,
        sourceRef: { type: "question-call", id: "defer-1" },
      }, options);
      recordFounderDecision({
        projectId: "beta",
        kind: "branch.selected",
        value: "Beta only",
        questionId: referenced.id,
        sourceRef: { type: "choice", id: "beta-choice" },
      }, options);

      assert.equal(removeClarity("alpha", referenced.id, options), true);
      assert.equal(removeClarity("alpha", loose.id, options), true);
      const archived = loadClarity("alpha", options);
      assert.equal(archived.length, 1);
      assert.equal(archived[0].status, "archived");
      assert.ok(archived[0].archivedAt);
      assert.equal(clarityGrounding("alpha", options), null);
      assert.deepEqual(projectQuestions("alpha", {}, options)[0].backlinks.length, 1);
    });

    it("keeps empty question state valid", () => {
      assert.deepEqual(projectQuestions("never-touched", {}, options), []);
    });
  });
});
