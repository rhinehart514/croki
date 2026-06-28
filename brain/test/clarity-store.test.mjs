import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadClarity, addClarity, removeClarity } from "../src/clarity-store.mjs";

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
});
