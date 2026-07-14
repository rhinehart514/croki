// crew.test.mjs — F1 acceptance: summoning births/reuses a soul and adds to the roster, listCrew
// carries the live soul without duplicating it.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { summon, listCrew } from "../../src/firm/crew.mjs";
import { createVenture } from "../../src/firm/venture-store.mjs";
import { teammateSoulStore } from "../../src/teammate-soul-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-crew-")) };
}

describe("crew — summon", () => {
  it("births a soul and adds the teammate to the roster", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Summon" }, options);
    const soul = summon(venture.id, "outreach-writer", {}, options);
    assert.equal(soul.ref, "outreach-writer");

    const crew = listCrew(venture.id, options);
    assert.equal(crew.length, 1);
    assert.equal(crew[0].ref, "outreach-writer");
    assert.equal(crew[0].soul.ref, "outreach-writer");
  });

  it("summoning the same ref twice does not duplicate the roster entry", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "No duplicates" }, options);
    summon(venture.id, "outreach-writer", {}, options);
    summon(venture.id, "outreach-writer", {}, options);
    assert.equal(listCrew(venture.id, options).length, 1);
  });

  it("summons multiple distinct teammates onto the same venture", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Multiple teammates" }, options);
    summon(venture.id, "outreach-writer", {}, options);
    summon(venture.id, "landing-page-builder", {}, options);
    const refs = listCrew(venture.id, options).map((c) => c.ref).sort();
    assert.deepEqual(refs, ["landing-page-builder", "outreach-writer"]);
  });

  it("listCrew reads the LIVE soul, not a duplicated copy — a later lesson shows up without re-summoning", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Live soul read" }, options);
    summon(venture.id, "outreach-writer", {}, options);
    teammateSoulStore.record(venture.id, "outreach-writer", { text: "lead with the trigger, not the pitch" }, {}, options);

    const crew = listCrew(venture.id, options);
    assert.equal(crew[0].soul.learnings.length, 1);
    assert.equal(crew[0].soul.learnings[0].text, "lead with the trigger, not the pitch");
  });
});
