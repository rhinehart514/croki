// founding-crew.test.mjs — Phase 8 acceptance (ADE build contract §4A.6, Reading A): one crew across
// ventures. Yara, Mira, Soren, and Kai are the SAME CHARACTERS everywhere — one name, one accumulating lens
// via the firm-level template — while each venture's instance holds only that venture's own work. This is
// the compatibility template/instance mechanism (teammate-soul-store) applied only through an explicit seed, not
// literal shared memory (Reading B, which would bleed venture data and is barred without a rail-6 amendment).
//
// The four acceptance criteria, each proven below:
//   1. An explicitly seeded venture opens with all four present, as the same characters, carrying their
//      graduated lens (inherited from the template, not re-earned).
//   2. A lesson blessed in one venture reaches the others via the template (cross-venture graduation).
//   3. No venture's raw work or identifying soul data appears in another (rail 6 isolation holds).
//   4. The seed is idempotent and opt-out-able, and it never pools instance data across ventures (Reading B
//      stays unbuilt).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createVenture } from "../../src/firm/venture-store.mjs";
import { listCrew } from "../../src/firm/crew.mjs";
import { getFirmConfiguration } from "../../src/firm/configuration.mjs";
import { teammateSoulStore, LIBRARY_VENTURE } from "../../src/teammate-soul-store.mjs";
import { patternKeyFor } from "../../src/teammate-soul.mjs";
import {
  FOUNDING_CREW,
  FOUNDING_CREW_REFS,
  seedFoundingCrew,
  ensureFoundingTemplates,
  isFoundingRef,
} from "../../src/firm/founding-crew.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-founding-crew-")) };
}

function createSeededVenture(input, options) {
  const venture = createVenture(input, options);
  seedFoundingCrew(venture.id, options);
  return venture;
}

describe("founding crew — the four named characters, firm-level identity", () => {
  it("an explicitly seeded venture opens with Yara, Mira, Soren, and Kai present", () => {
    const options = freshRoot();
    const venture = createSeededVenture({ name: "Fresh venture" }, options);

    const crew = listCrew(venture.id, options);
    assert.deepEqual(crew.map((c) => c.ref).sort(), [...FOUNDING_CREW_REFS].sort());
    assert.deepEqual(crew.map((c) => c.soul.name).sort(), ["Kai", "Mira", "Soren", "Yara"]);
    // They are the same characters: every instance carries its templateRef back to the firm-level template.
    for (const member of crew) {
      assert.equal(member.soul.templateRef, member.ref, `${member.ref} instance points back to its template`);
    }
  });

  it("the four are the venture's configured participants, so a direction can be routed to any of them", () => {
    const options = freshRoot();
    const venture = createSeededVenture({ name: "Configured crew" }, options);
    // initialConfiguration derives agents from the seeded roster, so the config opens with the four already
    // configured — Phase-4 direction routing can claim a direction for any of them without a formation step.
    const configuration = getFirmConfiguration(venture.id, options);
    assert.deepEqual(configuration.agents.map((a) => a.ref).sort(), [...FOUNDING_CREW_REFS].sort());
  });

  it("each character carries its firm-level graduated lens the moment its venture opens", () => {
    const options = freshRoot();
    // Give Yara's TEMPLATE a graduated lesson through the real cross-venture path (prove it in two seed
    // ventures, then bless it up into the template) — the genuine shape production produces.
    const text = "open with the person's own words, never the pitch";
    const key = patternKeyFor(text);
    for (const seedVenture of ["seed-a", "seed-b"]) {
      teammateSoulStore.record(seedVenture, "yara", { text, taskId: "t1" }, { templateRef: "yara" }, options);
      teammateSoulStore.record(seedVenture, "yara", { text, taskId: "t2" }, { templateRef: "yara" }, options);
      teammateSoulStore.record(seedVenture, "yara", { text, taskId: "t2" }, { templateRef: "yara" }, options);
      teammateSoulStore.promote(seedVenture, "yara", key, {}, options);
    }
    teammateSoulStore.promoteTemplate("yara", key, options);

    // A brand-new venture created AFTER the template graduated: Yara opens already carrying that lesson.
    const venture = createSeededVenture({ name: "Later venture" }, options);
    const yara = listCrew(venture.id, options).find((c) => c.ref === "yara");
    assert.ok(yara, "Yara is present in the fresh venture");
    const inherited = yara.soul.soul.find((entry) => entry.patternKey === key);
    assert.ok(inherited, "Yara opens carrying the template's graduated lesson");
    assert.equal(inherited.inherited, true, "the lesson is marked inherited, not re-earned");
    // Inherited, not double-counted: this venture's own scratch learnings are still empty.
    assert.deepEqual(yara.soul.learnings, []);
  });

  it("a lesson blessed in one venture reaches the others via the template", () => {
    const options = freshRoot();
    const text = "cite the repository line, never assert from memory";
    const key = patternKeyFor(text);

    // Two ventures both open with Mira. The founder corrects the same thing in each and blesses it locally.
    const ventureA = createSeededVenture({ name: "Venture A" }, options);
    const ventureB = createSeededVenture({ name: "Venture B" }, options);
    for (const ventureId of [ventureA.id, ventureB.id]) {
      teammateSoulStore.record(ventureId, "mira", { text, taskId: "t1" }, { templateRef: "mira" }, options);
      teammateSoulStore.record(ventureId, "mira", { text, taskId: "t2" }, { templateRef: "mira" }, options);
      teammateSoulStore.record(ventureId, "mira", { text, taskId: "t2" }, { templateRef: "mira" }, options);
      teammateSoulStore.promote(ventureId, "mira", key, {}, options);
    }

    // Proven across two distinct venture instances, the lesson is ready to graduate up into the template.
    const ready = teammateSoulStore.templateReadyForInstance(ventureA.id, "mira", {}, options);
    assert.equal(ready.length, 1);
    assert.equal(ready[0].patternKey, key);
    teammateSoulStore.promoteTemplate("mira", key, options);

    // A THIRD, later venture now opens with Mira already carrying the lesson — it crossed via the template.
    const ventureC = createSeededVenture({ name: "Venture C" }, options);
    const miraC = listCrew(ventureC.id, options).find((c) => c.ref === "mira");
    assert.ok(miraC.soul.soul.some((e) => e.patternKey === key), "the blessed lesson reached a new venture");
  });
});

describe("founding crew — rail 6: ventures never bleed", () => {
  it("one venture's raw work and scratch learnings never appear in another", () => {
    const options = freshRoot();
    const ventureA = createSeededVenture({ name: "Isolation A" }, options);
    const ventureB = createSeededVenture({ name: "Isolation B" }, options);

    // Record a venture-specific, UNBLESSED observation on Soren in venture A only.
    const secret = "A-only: the Buffalo lead replied about pricing";
    teammateSoulStore.record(ventureA.id, "soren", { text: secret, taskId: "a1" }, { templateRef: "soren" }, options);

    // Venture B's Soren instance knows nothing of it — a different instance under a different ventureId.
    const sorenA = teammateSoulStore.get(ventureA.id, "soren", options);
    const sorenB = teammateSoulStore.get(ventureB.id, "soren", options);
    assert.equal(sorenA.ventureId, ventureA.id);
    assert.equal(sorenB.ventureId, ventureB.id);
    assert.ok(sorenA.learnings.some((l) => l.text === secret), "venture A's Soren holds its own observation");
    assert.equal(sorenB.learnings.some((l) => l.text === secret), false, "venture B's Soren never sees it");
    // And the raw text never leaks into the shared TEMPLATE either — only founder-blessed graduation crosses.
    const template = teammateSoulStore.get(LIBRARY_VENTURE, "soren", options);
    assert.equal(JSON.stringify(template).includes(secret), false, "an unblessed observation never reaches the template");
  });

  it("the seed reads only the shared template, never another venture's instance data", () => {
    const options = freshRoot();
    // Venture A holds a private observation. Creating venture B seeds its crew — and that seed must not pull
    // any of A's instance data across. B's fresh souls carry only what A's *template* graduated (nothing here).
    const ventureA = createSeededVenture({ name: "No bleed A" }, options);
    teammateSoulStore.record(ventureA.id, "kai", { text: "A-only private note", taskId: "a1" }, { templateRef: "kai" }, options);

    const ventureB = createSeededVenture({ name: "No bleed B" }, options);
    const kaiB = listCrew(ventureB.id, options).find((c) => c.ref === "kai");
    assert.deepEqual(kaiB.soul.learnings, [], "B's Kai is born clean — no scratch learnings from A");
    assert.deepEqual(kaiB.soul.soul, [], "B's Kai inherits nothing until A's lesson is founder-blessed up to the template");
  });
});

describe("founding crew — the seed itself", () => {
  it("is idempotent: re-seeding an already-seeded venture changes nothing", () => {
    const options = freshRoot();
    const venture = createSeededVenture({ name: "Idempotent" }, options);
    const before = listCrew(venture.id, options);
    seedFoundingCrew(venture.id, options);
    seedFoundingCrew(venture.id, options);
    const after = listCrew(venture.id, options);
    assert.equal(after.length, before.length);
    assert.equal(after.length, FOUNDING_CREW.length);
    assert.deepEqual(after.map((c) => c.ref).sort(), before.map((c) => c.ref).sort());
  });

  it("does not alter the empty creation default until called explicitly", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Empty start" }, options);
    assert.deepEqual(listCrew(venture.id, options), [], "venture creation leaves the roster empty");
  });

  it("ensureFoundingTemplates births the four templates under the library, idempotently", () => {
    const options = freshRoot();
    ensureFoundingTemplates(options);
    ensureFoundingTemplates(options);
    for (const member of FOUNDING_CREW) {
      const template = teammateSoulStore.get(LIBRARY_VENTURE, member.ref, options);
      assert.ok(template, `${member.ref} has a firm-level template`);
      assert.equal(template.ventureId, LIBRARY_VENTURE);
      assert.equal(template.templateRef, null, "a template is not itself an instance of a template");
      assert.equal(template.name, member.name);
    }
  });

  it("carries the founder-safe voice on the template, and never operating instructions", () => {
    const options = freshRoot();
    ensureFoundingTemplates(options);
    const yara = teammateSoulStore.get(LIBRARY_VENTURE, "yara", options);
    assert.ok(yara.voice, "the template carries a seeded voice so the character sounds like itself day one");
    assert.equal(typeof yara.voice.register, "string");
    assert.equal(typeof yara.voice.stance, "string");
    // The voice is allowlisted to { register, stance, seededFrom } — no systemPrompt, no operating fields.
    assert.deepEqual(Object.keys(yara.voice).sort(), ["register", "seededFrom", "stance"]);
  });

  it("isFoundingRef recognizes the four and only the four", () => {
    for (const ref of FOUNDING_CREW_REFS) assert.equal(isFoundingRef(ref), true);
    assert.equal(isFoundingRef("outreach-writer"), false);
    assert.equal(isFoundingRef(""), false);
    assert.equal(isFoundingRef(null), false);
  });
});
