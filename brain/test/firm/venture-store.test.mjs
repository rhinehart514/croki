// venture-store.test.mjs — F1 acceptance: a venture is one readable local directory, and
// cross-venture access fails closed (FIRM-SPEC.md firm rail #6: "Ventures never bleed.").

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  createVenture,
  openVenture,
  listVentures,
  getVentureDoc,
  setVentureDoc,
  listVentureDocs,
  exportVenture,
  importVenture,
} from "../../src/firm/venture-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-venture-store-")) };
}

describe("venture-store — venture CRUD round-trips through real files", () => {
  it("creates a venture and reads its manifest back", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "LocalSeoData pipeline" }, options);
    assert.match(venture.id, /^venture-/);
    assert.equal(venture.name, "LocalSeoData pipeline");

    const reopened = openVenture(venture.id, options);
    assert.equal(reopened.name, "LocalSeoData pipeline");
    assert.equal(reopened.id, venture.id);
  });

  it("requires a name", () => {
    const options = freshRoot();
    assert.throws(() => createVenture({}, options), /needs a name/);
  });

  it("lists every venture's manifest", () => {
    const options = freshRoot();
    const a = createVenture({ name: "Venture A" }, options);
    const b = createVenture({ name: "Venture B" }, options);
    const listed = listVentures(options).map((v) => v.id);
    assert.ok(listed.includes(a.id));
    assert.ok(listed.includes(b.id));
  });

  it("the venture directory is readable JSON on disk", () => {
    const options = freshRoot();
    process.env.GTM_IDE_PERSISTENCE = "json";
    try {
      const venture = createVenture({ name: "Readable tree" }, options);
      setVentureDoc(venture.id, "bets", "bet-1", { id: "bet-1", intent: "try a cold email" }, options);

      const manifestFile = path.join(options.root, "ventures", `${venture.id}.json`);
      assert.ok(fs.existsSync(manifestFile), "the venture manifest is a plain file on disk");
      const manifestOnDisk = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
      assert.equal(manifestOnDisk.name, "Readable tree");

      const betFile = path.join(options.root, "ventures", venture.id, "bets", "bet-1.json");
      assert.ok(fs.existsSync(betFile), "a venture's own document lives under ventures/<id>/<collection>/");
      const betOnDisk = JSON.parse(fs.readFileSync(betFile, "utf8"));
      assert.equal(betOnDisk.intent, "try a cold email");
    } finally {
      delete process.env.GTM_IDE_PERSISTENCE;
    }
  });

  it("round-trips a document through get/set/list", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Doc round-trip" }, options);
    setVentureDoc(venture.id, "placement", "p1", { id: "p1", x: 10, y: 20 }, options);
    const read = getVentureDoc(venture.id, "placement", "p1", options);
    assert.equal(read.x, 10);
    const listed = listVentureDocs(venture.id, "placement", options);
    assert.equal(listed.length, 1);
  });

  it("rejects an unknown venture collection", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Collection guard" }, options);
    assert.throws(() => getVentureDoc(venture.id, "not-a-real-collection", "x", options), /Unknown venture collection/);
  });
});

describe("venture-store — cross-venture access fails closed", () => {
  it("reading a document under a venture id that was never created fails closed", () => {
    const options = freshRoot();
    assert.throws(() => getVentureDoc("never-created", "bets", "b1", options), /No such venture/);
  });

  it("writing under a venture id that was never created fails closed", () => {
    const options = freshRoot();
    assert.throws(() => setVentureDoc("never-created", "bets", "b1", { id: "b1" }, options), /No such venture/);
  });

  it("listing a venture that was never created fails closed", () => {
    const options = freshRoot();
    assert.throws(() => listVentureDocs("never-created", "bets", options), /No such venture/);
  });

  it("two ventures' documents never bleed into each other", () => {
    const options = freshRoot();
    const a = createVenture({ name: "Venture A" }, options);
    const b = createVenture({ name: "Venture B" }, options);
    setVentureDoc(a.id, "bets", "shared-key", { id: "shared-key", owner: "a" }, options);
    setVentureDoc(b.id, "bets", "shared-key", { id: "shared-key", owner: "b" }, options);

    assert.equal(getVentureDoc(a.id, "bets", "shared-key", options).owner, "a");
    assert.equal(getVentureDoc(b.id, "bets", "shared-key", options).owner, "b");
    assert.equal(listVentureDocs(a.id, "bets", options).length, 1);
    assert.equal(listVentureDocs(b.id, "bets", options).length, 1);
  });
});

describe("venture-store — export/import round-trips a venture as a plain bundle", () => {
  it("exports a venture's manifest and documents, and re-imports them intact", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Transfer proof" }, options);
    setVentureDoc(venture.id, "bets", "bet-1", { id: "bet-1", intent: "try a landing page" }, options);
    setVentureDoc(venture.id, "crew", "roster", { teammates: [{ ref: "outreach-writer" }] }, options);
    setVentureDoc(venture.id, "outcomes", "outcome-1", { id: "outcome-1", type: "outcome", body: "yes" }, options);
    setVentureDoc(venture.id, "settings", "heat", { id: "heat", heat: "steady", dailySpendUsd: 5 }, options);
    setVentureDoc(venture.id, "productChanges", `${venture.id}__bet-1`, {
      id: `${venture.id}__bet-1`, ventureId: venture.id, repo: "/machine/source", revisions: [{ id: "r1", diff: "+yes", worktree: "/machine/worktree" }], decisions: [],
    }, options);

    const bundle = exportVenture(venture.id, options);
    assert.equal(bundle.manifest.name, "Transfer proof");
    assert.equal(bundle.documents.bets.length, 1);
    assert.equal(bundle.documents.outcomes.length, 1);
    assert.equal(bundle.documents.settings[0].heat, "steady");
    assert.equal(bundle.documents.productChanges[0].transferState, "needs-rebind");
    assert.equal("repo" in bundle.documents.productChanges[0], false);
    assert.equal("worktree" in bundle.documents.productChanges[0].revisions[0], false);

    const other = freshRoot();
    importVenture(bundle, other);
    const reopened = openVenture(venture.id, other);
    assert.equal(reopened.name, "Transfer proof");
    const bets = listVentureDocs(venture.id, "bets", other);
    assert.equal(bets[0].intent, "try a landing page");
    assert.equal(listVentureDocs(venture.id, "outcomes", other)[0].body, "yes");
    assert.equal(listVentureDocs(venture.id, "settings", other)[0].dailySpendUsd, 5);
    assert.equal(listVentureDocs(venture.id, "productChanges", other)[0].transferState, "needs-rebind");
  });
});
