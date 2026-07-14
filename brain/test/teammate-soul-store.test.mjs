import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { teammateSoulStore as store, LIBRARY_VENTURE } from "../src/teammate-soul-store.mjs";
import { patternKeyFor } from "../src/teammate-soul.mjs";

// Every test drives against an isolated on-disk root, so the real ~/.gtm-ide is never touched and the
// suite is order-independent. GTM_IDE_PERSISTENCE=json keeps it off the native SQLite handle.
function withRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "soul-store-"));
  const opts = { root, backend: "json" };
  try {
    return run(opts);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("teammate-soul-store: birth + round-trip", () => {
  it("births a thin soul with a regular name and reloads it", () => {
    withRoot((opts) => {
      const born = store.ensure("rodentradar", "outreach-writer", { templateRef: "outreach-writer" }, opts);
      assert.ok(born.name, "should get a regular name");
      assert.deepEqual(born.soul, []);
      assert.equal(born.templateRef, "outreach-writer");
      const reloaded = store.get("rodentradar", "outreach-writer", opts);
      assert.equal(reloaded.name, born.name);
    });
  });

  it("gives venturemates distinct names", () => {
    withRoot((opts) => {
      const a = store.ensure("p1", "outreach-writer", {}, opts);
      const b = store.ensure("p1", "prospect-researcher", {}, opts);
      assert.notEqual(a.name, b.name);
    });
  });

  it("scopes souls per venture — the same teammate in two ventures is two souls", () => {
    withRoot((opts) => {
      store.ensure("p1", "outreach-writer", {}, opts);
      store.ensure("p2", "outreach-writer", {}, opts);
      assert.equal(store.listForVenture("p1", opts).length, 1);
      assert.equal(store.listForVenture("p2", opts).length, 1);
    });
  });
});

describe("teammate-soul-store: graduation through the store", () => {
  function correctThrice(opts) {
    store.record("rodentradar", "outreach-writer", { text: "lead with their trigger", taskId: "run1" }, {}, opts);
    store.record("rodentradar", "outreach-writer", { text: "lead with their trigger", taskId: "run2" }, {}, opts);
    store.record("rodentradar", "outreach-writer", { text: "lead with their trigger", taskId: "run2" }, {}, opts);
  }

  it("surfaces a ready lesson and promotes it on the founder's blessing", () => {
    withRoot((opts) => {
      correctThrice(opts);
      const ready = store.listReady("rodentradar", "outreach-writer", {}, opts);
      assert.equal(ready.length, 1);
      const key = patternKeyFor("lead with their trigger");
      const promoted = store.promote("rodentradar", "outreach-writer", key, { drive: 8 }, opts);
      assert.equal(promoted.soul.length, 1);
      assert.equal(promoted.soul[0].graduatedAtDrive, 8);
      // Once promoted it no longer shows as ready.
      assert.deepEqual(store.listReady("rodentradar", "outreach-writer", {}, opts), []);
    });
  });

  it("dismiss keeps a lesson out of the ready list", () => {
    withRoot((opts) => {
      correctThrice(opts);
      const key = patternKeyFor("lead with their trigger");
      store.dismiss("rodentradar", "outreach-writer", key, opts);
      assert.deepEqual(store.listReady("rodentradar", "outreach-writer", {}, opts), []);
    });
  });

  it("folds real outcomes into the track record", () => {
    withRoot((opts) => {
      store.recordOutcome("rodentradar", "outreach-writer", { drives: 1, sent: 1, replies: 1 }, {}, opts);
      const soul = store.get("rodentradar", "outreach-writer", opts);
      assert.deepEqual(soul.record, { drives: 1, sent: 1, replies: 1, wins: 0 });
    });
  });
});

describe("teammate-soul-store: the voice narration seam", () => {
  it("voiceBriefFor births a thin soul and returns a valid founder-safe brief", () => {
    withRoot((opts) => {
      const brief = store.voiceBriefFor("rodentradar", "outreach-writer", {}, opts);
      assert.equal(brief.ref, "outreach-writer");
      assert.ok(brief.name, "a born teammate carries a name");
      assert.ok(brief.register.length > 0, "a cold teammate still narrates off the fallback register");
      assert.ok(brief.stance.length > 0);
      assert.equal(brief.standing, "proving");
      assert.deepEqual(brief.convictions, []);
      // It really did persist a soul (so the same teammate reads consistently next time).
      assert.ok(store.get("rodentradar", "outreach-writer", opts), "voiceBriefFor births the soul");
    });
  });

  it("setVoice persists a normalized voice and voiceBriefFor reflects it", () => {
    withRoot((opts) => {
      store.setVoice("rodentradar", "outreach-writer", { register: "  wry, concrete  ", stance: "I dig for the detail." }, opts);
      const brief = store.voiceBriefFor("rodentradar", "outreach-writer", {}, opts);
      assert.equal(brief.register, "wry, concrete");
      assert.equal(brief.stance, "I dig for the detail.");
    });
  });

  it("setVoice with empty/invalid input leaves an existing voice untouched", () => {
    withRoot((opts) => {
      store.setVoice("rodentradar", "outreach-writer", { register: "wry", stance: "I dig." }, opts);
      // A no-op update must not wipe the seeded voice.
      store.setVoice("rodentradar", "outreach-writer", { register: "", stance: "  " }, opts);
      store.setVoice("rodentradar", "outreach-writer", null, opts);
      const brief = store.voiceBriefFor("rodentradar", "outreach-writer", {}, opts);
      assert.equal(brief.register, "wry");
      assert.equal(brief.stance, "I dig.");
    });
  });

  it("setVoice on empty input for a never-born teammate births nothing", () => {
    withRoot((opts) => {
      const result = store.setVoice("rodentradar", "never-born", { register: "" }, opts);
      assert.equal(result, null, "an empty voice on a fresh teammate births no soul");
      assert.equal(store.get("rodentradar", "never-born", opts), null);
    });
  });
});

describe("teammate-soul-store: cross-venture (template) graduation", () => {
  function promoteInVenture(ventureId, opts) {
    store.record(ventureId, "outreach-writer", { text: "no em-dashes ever", taskId: "a" }, { templateRef: "outreach-writer" }, opts);
    store.record(ventureId, "outreach-writer", { text: "no em-dashes ever", taskId: "b" }, { templateRef: "outreach-writer" }, opts);
    store.record(ventureId, "outreach-writer", { text: "no em-dashes ever", taskId: "b" }, { templateRef: "outreach-writer" }, opts);
    store.promote(ventureId, "outreach-writer", patternKeyFor("no em-dashes ever"), {}, opts);
  }

  it("graduates a lesson up to the template once it's proven in 2 ventures", () => {
    withRoot((opts) => {
      promoteInVenture("rodentradar", opts);
      // One venture alone does not graduate the template.
      assert.deepEqual(store.templateReady("outreach-writer", {}, opts), []);
      promoteInVenture("strelva", opts);
      const ready = store.templateReady("outreach-writer", {}, opts);
      assert.equal(ready.length, 1);
      assert.equal(ready[0].patternKey, patternKeyFor("no em-dashes ever"));

      const template = store.promoteTemplate("outreach-writer", patternKeyFor("no em-dashes ever"), opts);
      assert.equal(template.ventureId, LIBRARY_VENTURE);
      assert.equal(template.soul.length, 1);
      // Absorbed — no longer pending on the template.
      assert.deepEqual(store.templateReady("outreach-writer", {}, opts), []);
    });
  });
});
