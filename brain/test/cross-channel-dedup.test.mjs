import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dedupeAcrossChannels } from "../src/cross-reference.mjs";
import { extractIdentity } from "../src/person-store.mjs";

// E5.2 — cross-channel dedup. Several channels run at volume off different import sources; the same
// human can surface in more than one. Before the consolidated approval queue, collapse the duplicates
// to ONE item per person and flag anyone who appeared in 2+ channels (the fatigue signal). Pure and
// derived from the passed-in run entrants — never seeded, never persisted, never sends.

describe("dedupeAcrossChannels — one person, many channels", () => {
  it("collapses the same human found across two channels into one identity", () => {
    const entrants = [
      { channelId: "outbound", name: "Jane Roe", email: "jane@acme.com", nowTrigger: "raised a round" },
      { channelId: "events", decisionMaker: "Jane Roe", email: "JANE@ACME.COM", nowTrigger: "spoke at a meetup" },
      { channelId: "referral", name: "Bob Lee", handle: "@boblee", personalFact: "starred the repo" },
    ];
    const out = dedupeAcrossChannels(entrants);

    assert.equal(out.identities.length, 2, "Jane collapses to one identity; Bob is the other");
    assert.equal(out.deduped.length, 2, "the queue shows one item per person");

    const jane = out.identities.find((i) => i.key === extractIdentity({ email: "jane@acme.com" }).identityKey);
    assert.ok(jane, "the deduped identity uses the SAME strongest-identifier key the durable Person uses");
    assert.deepEqual(jane.channels.sort(), ["events", "outbound"]);
    assert.equal(jane.multiChannel, true);
    // Every per-channel appearance is preserved, each carrying its own why-now trigger.
    assert.equal(jane.appearances.length, 2);
    assert.deepEqual(jane.appearances.map((a) => a.trigger).sort(), ["raised a round", "spoke at a meetup"]);
  });

  it("flags multi-channel people as the fatigue report and leaves single-channel people unflagged", () => {
    const entrants = [
      { channelId: "outbound", email: "jane@acme.com" },
      { channelId: "events", email: "jane@acme.com" },
      { channelId: "outbound", email: "solo@only.com" },
    ];
    const out = dedupeAcrossChannels(entrants);

    assert.equal(out.collisions.length, 1, "only Jane appears in more than one channel");
    assert.equal(out.collisions[0].key, extractIdentity({ email: "jane@acme.com" }).identityKey);
    assert.deepEqual(out.collisions[0].channels.sort(), ["events", "outbound"]);

    const solo = out.identities.find((i) => i.key === extractIdentity({ email: "solo@only.com" }).identityKey);
    assert.equal(solo.multiChannel, false, "a single-channel person is never a fatigue collision");
  });

  it("reports honest dedup stats", () => {
    const entrants = [
      { channelId: "a", email: "x@x.com" },
      { channelId: "b", email: "x@x.com" }, // duplicate of the first
      { channelId: "a", email: "y@y.com" },
    ];
    const out = dedupeAcrossChannels(entrants);
    assert.deepEqual(out.stats, {
      entrantCount: 3,
      identityCount: 2,
      collisionCount: 1,
      duplicateCount: 1,
    });
  });

  it("the same human surfacing twice WITHIN one channel is one identity and NOT a fatigue collision", () => {
    const entrants = [
      { channelId: "outbound", email: "jane@acme.com", nowTrigger: "raised a round" },
      { channelId: "outbound", email: "jane@acme.com", nowTrigger: "hiring SDRs" },
    ];
    const out = dedupeAcrossChannels(entrants);
    assert.equal(out.identities.length, 1);
    assert.deepEqual(out.identities[0].channels, ["outbound"], "one channel, not double-counted");
    assert.equal(out.identities[0].multiChannel, false, "same channel twice is not cross-channel fatigue");
    assert.equal(out.identities[0].appearances.length, 2, "both surfacings are kept as appearances");
    assert.equal(out.collisions.length, 0);
  });

  it("keeps identity-less items as their own identities instead of silently merging or dropping them", () => {
    const entrants = [
      { channelId: "a", draft: "Hi there", subject: "hello" }, // no stable identifier
      { channelId: "b", draft: "Different note", subject: "hey" }, // also none — must NOT collide with the first
      { channelId: "a", email: "real@person.com" },
    ];
    const out = dedupeAcrossChannels(entrants);
    assert.equal(out.identities.length, 3, "two anonymous items stay distinct; the identified one is separate");
    const anonymous = out.identities.filter((i) => !i.identified);
    assert.equal(anonymous.length, 2);
    assert.ok(anonymous.every((i) => i.key === null && i.multiChannel === false));
  });

  it("honors a caller-supplied keyOf override", () => {
    const entrants = [
      { channelId: "a", id: "p1", email: "different@a.com" },
      { channelId: "b", id: "p1", email: "different@b.com" }, // different emails, same caller id → one person
    ];
    const out = dedupeAcrossChannels(entrants, { keyOf: (item) => item.id });
    assert.equal(out.identities.length, 1, "the override decides identity, not the email");
    assert.equal(out.identities[0].multiChannel, true);
    assert.deepEqual(out.identities[0].channels.sort(), ["a", "b"]);
  });

  it("is tolerant — junk, untagged, and empty input never throw", () => {
    assert.doesNotThrow(() => dedupeAcrossChannels(null));
    assert.doesNotThrow(() => dedupeAcrossChannels([null, 42, "x"]));
    const out = dedupeAcrossChannels([{ email: "untagged@x.com" }]);
    assert.equal(out.identities.length, 1);
    assert.deepEqual(out.identities[0].channels, [], "an untagged item has no channel and can never be a collision");
    assert.equal(out.identities[0].multiChannel, false);
  });
});
