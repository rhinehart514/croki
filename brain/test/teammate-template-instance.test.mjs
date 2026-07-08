import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { teammateSoulStore as store, LIBRARY_PROJECT } from "../src/teammate-soul-store.mjs";
import { patternKeyFor } from "../src/teammate-soul.mjs";

// Isolated on-disk root per test, off the native SQLite handle — same convention as the store's own
// suite so nothing touches the real ~/.gtm-ide and the tests are order-independent.
function withRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "soul-template-"));
  const opts = { root, backend: "json" };
  try {
    return run(opts);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Give the library a TEMPLATE for `ref` that has already graduated one lesson. Uses the real
// cross-project graduation path (prove a lesson in two distinct instances, then bless it up into the
// template) so the fixture is the genuine shape production produces — no hand-crafted soul entry.
function templateWithGraduatedLesson(ref, text, opts) {
  const key = patternKeyFor(text);
  for (const projectId of ["seed-a", "seed-b"]) {
    store.record(projectId, ref, { text, taskId: "t1" }, { templateRef: ref }, opts);
    store.record(projectId, ref, { text, taskId: "t2" }, { templateRef: ref }, opts);
    store.record(projectId, ref, { text, taskId: "t2" }, { templateRef: ref }, opts);
    store.promote(projectId, ref, key, {}, opts);
  }
  const template = store.promoteTemplate(ref, key, opts);
  assert.equal(template.projectId, LIBRARY_PROJECT);
  assert.equal(template.soul.length, 1, "fixture template should carry the graduated lesson");
  return key;
}

describe("template on the bench, redefined per project", () => {
  it("births an instance whose soul inherits the template's graduated lessons", () => {
    withRoot((opts) => {
      const key = templateWithGraduatedLesson("outreach-writer", "no em-dashes ever", opts);

      const instance = store.ensure("brand-new-project", "outreach-writer", { templateRef: "outreach-writer" }, opts);
      assert.equal(instance.projectId, "brand-new-project");
      assert.equal(instance.templateRef, "outreach-writer");
      assert.equal(instance.soul.length, 1, "instance is born carrying the template's lesson");
      const inheritedEntry = instance.soul[0];
      assert.equal(inheritedEntry.patternKey, key);
      assert.equal(inheritedEntry.source, "template");
      assert.equal(inheritedEntry.inherited, true, "inherited entries are marked so a surface can tell");
      // Inherited, not re-earned: the instance's own scratch learnings are still empty.
      assert.deepEqual(instance.learnings, []);
    });
  });

  it("births thin when the ref has no template in the library", () => {
    withRoot((opts) => {
      const instance = store.ensure("solo-project", "brand-new-ref", { templateRef: "brand-new-ref" }, opts);
      assert.deepEqual(instance.soul, [], "no template ⇒ nothing inherited, nothing fabricated");
      assert.deepEqual(instance.learnings, []);
    });
  });

  it("does not double-count an inherited lesson as ready to graduate", () => {
    withRoot((opts) => {
      templateWithGraduatedLesson("outreach-writer", "no em-dashes ever", opts);
      store.ensure("fresh-project", "outreach-writer", { templateRef: "outreach-writer" }, opts);
      // The lesson lives in `soul`, never in `learnings`, so it never resurfaces as a pending graduation.
      assert.deepEqual(store.listReady("fresh-project", "outreach-writer", {}, opts), []);
    });
  });

  it("promoting a locally-relearned pattern that matches an inherited entry is idempotent", () => {
    withRoot((opts) => {
      const key = templateWithGraduatedLesson("outreach-writer", "no em-dashes ever", opts);
      store.ensure("fresh-project", "outreach-writer", { templateRef: "outreach-writer" }, opts);

      // The founder happens to correct the same thing three times in this project too.
      store.record("fresh-project", "outreach-writer", { text: "no em-dashes ever", taskId: "r1" }, {}, opts);
      store.record("fresh-project", "outreach-writer", { text: "no em-dashes ever", taskId: "r2" }, {}, opts);
      store.record("fresh-project", "outreach-writer", { text: "no em-dashes ever", taskId: "r2" }, {}, opts);
      assert.equal(store.listReady("fresh-project", "outreach-writer", {}, opts).length, 1);

      const promoted = store.promote("fresh-project", "outreach-writer", key, {}, opts);
      // The inherited entry shares the deterministic id, so promotion is a no-op on the soul — one rule,
      // not a duplicate — and the scratch learning is marked promoted so it stops surfacing.
      assert.equal(promoted.soul.length, 1);
      assert.equal(promoted.soul[0].patternKey, key);
      assert.equal(promoted.learnings.find((l) => l.patternKey === key).status, "promoted");
      assert.deepEqual(store.listReady("fresh-project", "outreach-writer", {}, opts), []);
    });
  });

  it("exposes the cross-project readiness check for an instance without needing the templateRef by hand", () => {
    withRoot((opts) => {
      const key = patternKeyFor("lead with their trigger");
      // Prove the lesson in one instance and bless it there. One project alone is not enough to graduate
      // the template, so the check is still empty.
      store.record("proj-1", "prospect-researcher", { text: "lead with their trigger", taskId: "t1" }, { templateRef: "prospect-researcher" }, opts);
      store.record("proj-1", "prospect-researcher", { text: "lead with their trigger", taskId: "t2" }, { templateRef: "prospect-researcher" }, opts);
      store.record("proj-1", "prospect-researcher", { text: "lead with their trigger", taskId: "t2" }, { templateRef: "prospect-researcher" }, opts);
      store.promote("proj-1", "prospect-researcher", key, {}, opts);
      assert.deepEqual(store.templateReadyForInstance("proj-1", "prospect-researcher", {}, opts), []);

      // Prove and bless it in a second project — now the template is ready, surfaced from either instance.
      store.record("proj-2", "prospect-researcher", { text: "lead with their trigger", taskId: "t1" }, { templateRef: "prospect-researcher" }, opts);
      store.record("proj-2", "prospect-researcher", { text: "lead with their trigger", taskId: "t2" }, { templateRef: "prospect-researcher" }, opts);
      store.record("proj-2", "prospect-researcher", { text: "lead with their trigger", taskId: "t2" }, { templateRef: "prospect-researcher" }, opts);
      store.promote("proj-2", "prospect-researcher", key, {}, opts);

      const ready = store.templateReadyForInstance("proj-1", "prospect-researcher", {}, opts);
      assert.equal(ready.length, 1);
      assert.equal(ready[0].patternKey, key);
      // The check never promotes on its own — the template soul stays empty until the founder taps.
      assert.equal((store.get(LIBRARY_PROJECT, "prospect-researcher", opts)?.soul ?? []).length, 0);
    });
  });
});
