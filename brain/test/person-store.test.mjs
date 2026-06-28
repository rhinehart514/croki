import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  extractIdentity,
  promoteEntrants,
  promoteEntrantsFromRun,
  upsertPerson,
  appendAppearance,
  listPeople,
  getPerson,
  findPersonByIdentity,
} from "../src/person-store.mjs";

describe("person-store — the keystone object", () => {
  let parent;
  let options;
  const projectId = "acme";

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-person-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  describe("identity rule — strongest stable identifier wins", () => {
    it("prefers email over handle, domain, and name", () => {
      const id = extractIdentity({ name: "Jane Roe", handle: "@jroe", email: "Jane@Acme.com", company: "Acme" });
      assert.equal(id.identityKey, "email:jane@acme.com");
      assert.equal(id.email, "jane@acme.com");
      assert.equal(id.domain, "acme.com");
    });

    it("falls back to handle when there is no email", () => {
      const id = extractIdentity({ name: "Jane Roe", handle: "@JRoe" });
      assert.equal(id.identityKey, "handle:jroe");
    });

    it("falls back to domain+name when there is no email or handle", () => {
      const id = extractIdentity({ name: "Jane Roe", website: "https://acme.com/team" });
      assert.equal(id.identityKey, "domain:acme.com|name:jane-roe");
    });

    it("treats the same human as ONE identity across differing decorations", () => {
      const a = extractIdentity({ name: "Jane Roe", email: "jane@acme.com" });
      const b = extractIdentity({ decisionMaker: "Jane Roe", email: "JANE@ACME.COM", nowTrigger: "raised a round" });
      assert.equal(a.identityKey, b.identityKey);
    });

    it("returns null for an item with no stable identifier", () => {
      assert.equal(extractIdentity({ draft: "hello there", subject: "hi" }), null);
      assert.equal(extractIdentity({}), null);
      assert.equal(extractIdentity(null), null);
    });

    it("does not use a social profile host as an org domain", () => {
      const id = extractIdentity({ name: "Jane Roe", url: "https://linkedin.com/in/jane" });
      assert.equal(id.identityKey, "name:jane-roe");
      assert.equal(id.domain, null);
    });
  });

  describe("dedup and cross-channel appearances", () => {
    it("upserts the same human once and fills identity gaps over time", () => {
      upsertPerson(projectId, { name: "Jane Roe", email: "jane@acme.com" }, options);
      upsertPerson(projectId, { email: "jane@acme.com", company: "Acme Corp", handle: "@jroe" }, options);
      const people = listPeople(projectId, options);
      assert.equal(people.length, 1);
      assert.equal(people[0].org, "Acme Corp");
      assert.equal(people[0].handle, "jroe");
    });

    it("records one appearance per channel+run and dedups repeats", () => {
      const person = upsertPerson(projectId, { email: "jane@acme.com" }, options);
      appendAppearance(projectId, person.id, { channelId: "outbound", runId: "r1", role: "source", trigger: "raised a round" }, options);
      appendAppearance(projectId, person.id, { channelId: "outbound", runId: "r1", role: "gate" }, options); // dup run
      appendAppearance(projectId, person.id, { channelId: "events", runId: "r2", role: "source" }, options);
      const stored = getPerson(projectId, person.id, options);
      assert.equal(stored.appearances.length, 2);
      const channels = new Set(stored.appearances.map((a) => a.channelId));
      assert.deepEqual([...channels].sort(), ["events", "outbound"]);
    });

    it("findPersonByIdentity resolves by item shape or raw key", () => {
      upsertPerson(projectId, { name: "Jane Roe", email: "jane@acme.com" }, options);
      assert.ok(findPersonByIdentity(projectId, { email: "JANE@acme.com" }, options));
      assert.ok(findPersonByIdentity(projectId, "email:jane@acme.com", options));
      assert.equal(findPersonByIdentity(projectId, { email: "nobody@nowhere.com" }, options), null);
    });
  });

  describe("promoteEntrants — from realistic run item shapes", () => {
    it("promotes person/org items, attaches the per-appearance trigger, and skips identity-less items", () => {
      const items = [
        { decisionMaker: "Jane Roe", company: "Acme", email: "jane@acme.com", nowTrigger: "hiring SDRs", role: "source" },
        { name: "Bob Lee", handle: "@boblee", personalFact: "spoke at SaaStr" },
        { name: "Acme", website: "acme.io" },
        { draft: "Hi there — wanted to reach out", subject: "Quick question" }, // no identity → skipped
      ];
      const out = promoteEntrants(projectId, "outbound", "run-1", items, options);
      assert.equal(out.peopleCount, 3);
      assert.equal(out.appearancesAdded, 3);

      const jane = findPersonByIdentity(projectId, { email: "jane@acme.com" }, options);
      assert.equal(jane.appearances[0].trigger, "hiring SDRs");
      assert.equal(jane.appearances[0].channelId, "outbound");
      assert.equal(jane.appearances[0].role, "source");

      const bob = findPersonByIdentity(projectId, { handle: "boblee" }, options);
      assert.equal(bob.appearances[0].trigger, "spoke at SaaStr"); // personalFact used as trigger
    });

    it("links the same human found in two different channels onto one Person", () => {
      promoteEntrants(projectId, "outbound", "run-1", [{ name: "Jane Roe", email: "jane@acme.com", nowTrigger: "raised a round" }], options);
      promoteEntrants(projectId, "events", "run-9", [{ decisionMaker: "Jane Roe", email: "jane@acme.com", nowTrigger: "spoke at a meetup" }], options);
      const people = listPeople(projectId, options);
      assert.equal(people.length, 1);
      assert.equal(people[0].appearances.length, 2);
      const triggers = people[0].appearances.map((a) => a.trigger).sort();
      assert.deepEqual(triggers, ["raised a round", "spoke at a meetup"]);
    });

    it("is tolerant — a non-array or junk input never throws and promotes nothing", () => {
      assert.doesNotThrow(() => promoteEntrants(projectId, "c", "r", null, options));
      assert.doesNotThrow(() => promoteEntrants(projectId, "c", "r", [null, 42, "x"], options));
      assert.equal(listPeople(projectId, options).length, 0);
    });
  });

  describe("promoteEntrantsFromRun — the run-completion bridge", () => {
    it("pulls entrant items out of a run result across nodes and promotes them", () => {
      const result = {
        runId: "run-7",
        nodes: {
          source: { category: "source", items: [{ name: "Jane Roe", email: "jane@acme.com", nowTrigger: "hiring" }] },
          gate: { category: "gate", items: [{ name: "Jane Roe", email: "jane@acme.com", draft: "note", approvalStatus: "approved" }] },
        },
      };
      const out = promoteEntrantsFromRun({ projectId, channelId: "outbound", result }, options);
      assert.equal(out.peopleCount, 1); // same human across two nodes
      assert.equal(out.appearancesAdded, 1); // one appearance per channel+run
      const jane = findPersonByIdentity(projectId, { email: "jane@acme.com" }, options);
      assert.equal(jane.appearances.length, 1);
      assert.equal(jane.appearances[0].runId, "run-7");
    });

    it("never throws on a malformed result", () => {
      assert.doesNotThrow(() => promoteEntrantsFromRun({ projectId, channelId: "c", result: null }, options));
      assert.doesNotThrow(() => promoteEntrantsFromRun({ projectId, channelId: "c", result: { nodes: null } }, options));
    });
  });
});
