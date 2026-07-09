import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { objectKey, inferKind } from "../src/object-identity.mjs";
import {
  recordObjectTouch,
  setObjectSetAside,
  getObjectTouch,
  listObjectTouches,
} from "../src/gtm-store.mjs";
import { deriveFunnel, deriveNextObjects, bucketFor } from "../src/object-funnel.mjs";
import { resultStore } from "../src/gtm-store.mjs";
import { findReferences } from "../src/cross-reference.mjs";
import { recordRunDerivations } from "../src/run-derivation.mjs";

// Area 1 — the shared object graph. objectKey gives ANY object one deterministic identity; the touch
// ledger is the single new durable noun (touches only, no stored state); the funnel and suppression are
// pure read-time projections over it. Every test roots on an isolated temp home — nothing touches ~/.gtm-ide.

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "object-touch-")) };
}

describe("objectKey — one deterministic identity per object, open kind", () => {
  it("a person delegates to the durable-Person identity rule (same key as extractIdentity)", () => {
    assert.equal(objectKey("person", { email: "Jane@Acme.com" }), "email:jane@acme.com");
    assert.equal(objectKey("person", { handle: "@boblee" }), "handle:boblee");
  });

  it("composes deterministic keys for geo / keyword / page / partner / change from natural fields", () => {
    assert.equal(objectKey("geo", { locality: "Buffalo, NY" }), "geo:buffalo-ny");
    assert.equal(objectKey("keyword", { query: "estate sale", geo: "Buffalo" }), "keyword:estate-sale|buffalo");
    assert.equal(objectKey("keyword", { query: "estate sale" }), "keyword:estate-sale");
    assert.equal(objectKey("page", { path: "https://x.com/Estate-Sales/Buffalo/" }), "page:/estate-sales/buffalo");
    assert.equal(objectKey("partner", { domain: "https://www.Acme.com/team" }), "partner:acme.com");
    assert.equal(objectKey("change", { repo: "estatesaleusa", path: "app/page.tsx" }), "change:estatesaleusa#app/page.tsx");
  });

  it("an OPEN novel kind is keyed, never rejected", () => {
    assert.equal(objectKey("midnight_barter", { id: "stall-7" }), "midnight_barter:stall-7");
  });

  it("an identifier-less item gets a distinct private key (never collides with another anonymous item)", () => {
    const a = objectKey("geo", {});
    const b = objectKey("geo", {});
    assert.notEqual(a, b, "two identifier-less objects must not collapse into one identity");
  });

  it("inferKind reads a stated kind, then a person identity, then the natural field present", () => {
    assert.equal(inferKind({ kind: "partner", domain: "acme.com" }), "partner");
    assert.equal(inferKind({ email: "a@b.com" }), "person");
    assert.equal(inferKind({ query: "estate sale" }), "keyword");
    assert.equal(inferKind({ path: "/buffalo" }), "page");
    assert.equal(inferKind({ locality: "Buffalo" }), "geo");
    assert.equal(inferKind({ subject: "hi", body: "no identity" }), null);
  });
});

describe("touch ledger — upsert + append, one record per object across motions", () => {
  it("records the first touch, then appends distinct-motion touches to the SAME durable object", () => {
    const options = freshRoot();
    recordObjectTouch("proj", { kind: "geo", fields: { locality: "Buffalo" }, motionId: "m1", runId: "r1", verb: "targeted" }, options);
    recordObjectTouch("proj", { kind: "geo", fields: { locality: "Buffalo" }, motionId: "m2", runId: "r2", verb: "worked" }, options);
    const record = getObjectTouch("proj", "geo:buffalo", options);
    assert.equal(record.objectKey, "geo:buffalo");
    assert.equal(record.touches.length, 2, "two motions, one durable object");
    assert.deepEqual(record.touches.map((t) => t.motionId).sort(), ["m1", "m2"]);
    assert.ok(record.firstSeenAt && record.lastSeenAt);
  });

  it("an identical (motionId, runId, verb) touch is idempotent", () => {
    const options = freshRoot();
    recordObjectTouch("proj", { kind: "page", fields: { path: "/x" }, motionId: "m1", runId: "r1", verb: "built" }, options);
    const again = recordObjectTouch("proj", { kind: "page", fields: { path: "/x" }, motionId: "m1", runId: "r1", verb: "built" }, options);
    assert.equal(again.touches.length, 1);
  });

  it("is project-scoped — the same objectKey in two projects is two records", () => {
    const options = freshRoot();
    recordObjectTouch("proj-a", { kind: "geo", fields: { locality: "Buffalo" }, runId: "r1", verb: "worked" }, options);
    recordObjectTouch("proj-b", { kind: "geo", fields: { locality: "Buffalo" }, runId: "r2", verb: "worked" }, options);
    assert.equal(listObjectTouches("proj-a", options).length, 1);
    assert.equal(listObjectTouches("proj-b", options).length, 1);
  });

  it("a founder set-aside is recorded as a touch (verb:set-aside), never a stored flag", () => {
    const options = freshRoot();
    recordObjectTouch("proj", { kind: "person", fields: { email: "j@x.com" }, runId: "r1", verb: "worked" }, options);
    setObjectSetAside("proj", { kind: "person", fields: { email: "j@x.com" }, reason: "already a customer" }, options);
    const record = getObjectTouch("proj", "email:j@x.com", options);
    const aside = record.touches.find((t) => t.verb === "set-aside");
    assert.ok(aside, "the set-aside is a touch on the ledger");
    assert.equal(aside.reason, "already a customer");
  });

  it("getObjectTouch is honest-blank for an object nothing has touched", () => {
    const options = freshRoot();
    assert.equal(getObjectTouch("proj", "geo:nowhere", options), null);
  });
});

describe("deriveFunnel — read-time buckets, never a stored state", () => {
  it("groups objects by kind × emergent bucket (seen / in_flight / handled / suppressed)", () => {
    const options = freshRoot();
    // seen: one motion, no outcome
    recordObjectTouch("proj", { kind: "geo", fields: { locality: "Buffalo" }, motionId: "m1", runId: "r1", verb: "worked" }, options);
    // in_flight: two distinct motions
    recordObjectTouch("proj", { kind: "geo", fields: { locality: "Rochester" }, motionId: "m1", runId: "r1", verb: "worked" }, options);
    recordObjectTouch("proj", { kind: "geo", fields: { locality: "Rochester" }, motionId: "m2", runId: "r2", verb: "worked" }, options);
    // suppressed: set aside
    recordObjectTouch("proj", { kind: "keyword", fields: { query: "estate sale" }, motionId: "m1", runId: "r1", verb: "worked" }, options);
    setObjectSetAside("proj", { objectKey: "keyword:estate-sale", reason: "off strategy" }, options);
    // handled: an outcome joins on the object key (buyerRef)
    recordObjectTouch("proj", { kind: "person", fields: { email: "won@x.com" }, motionId: "m1", runId: "r1", verb: "worked" }, options);
    resultStore.create({ projectId: "proj", joinKey: "k1", buyerRef: "email:won@x.com", outcomeKind: "purchase" }, options);

    const funnel = deriveFunnel("proj", options);
    const geo = funnel.kinds.find((k) => k.kind === "geo");
    assert.equal(geo.buckets.seen, 1);
    assert.equal(geo.buckets.in_flight, 1);
    const keyword = funnel.kinds.find((k) => k.kind === "keyword");
    assert.equal(keyword.buckets.suppressed, 1);
    const person = funnel.kinds.find((k) => k.kind === "person");
    assert.equal(person.buckets.handled, 1);
    assert.equal(funnel.totals.total, 4);
  });

  it("is honest-blind on a project nothing has touched", () => {
    const options = freshRoot();
    const funnel = deriveFunnel("empty-proj", options);
    assert.deepEqual(funnel.kinds, []);
    assert.equal(funnel.totals.total, 0);
  });

  it("a set-aside with an expired until no longer suppresses", () => {
    const record = {
      objectKey: "geo:x",
      touches: [{ verb: "set-aside", until: "2000-01-01T00:00:00.000Z", at: "1999-01-01T00:00:00.000Z" }],
    };
    assert.equal(bucketFor(record, { asOf: "2026-01-01T00:00:00.000Z" }), "seen", "an expired set-aside stops suppressing");
    assert.equal(bucketFor(record, { asOf: "1999-06-01T00:00:00.000Z" }), "suppressed", "still in force before until");
  });

  it("deriveNextObjects returns seen/in-flight objects, never handled or suppressed", () => {
    const options = freshRoot();
    recordObjectTouch("proj", { kind: "geo", fields: { locality: "Buffalo" }, motionId: "m1", runId: "r1", verb: "worked" }, options);
    recordObjectTouch("proj", { kind: "geo", fields: { locality: "Rochester" }, motionId: "m1", runId: "r1", verb: "worked" }, options);
    setObjectSetAside("proj", { objectKey: "geo:rochester", reason: "skip" }, options);
    const next = deriveNextObjects("proj", {}, options);
    const keys = next.objects.map((o) => o.objectKey);
    assert.ok(keys.includes("geo:buffalo"));
    assert.ok(!keys.includes("geo:rochester"), "a set-aside object is never proposed as next work");
  });
});

describe("findReferences — generalized default resolves any {kind,id} to its touches", () => {
  it("returns an object's touches by objectKey, for a non-fast-path kind", () => {
    const options = freshRoot();
    recordObjectTouch("proj", { kind: "keyword", fields: { query: "estate sale" }, motionId: "m1", runId: "r1", verb: "worked" }, options);
    recordObjectTouch("proj", { kind: "keyword", fields: { query: "estate sale" }, motionId: "m2", runId: "r2", verb: "ranked" }, options);
    const ref = findReferences("proj", { kind: "keyword", id: "keyword:estate-sale" }, options);
    assert.equal(ref.referenceCount, 2);
    assert.deepEqual(ref.motionIds.sort(), ["m1", "m2"]);
    assert.equal(ref.object.objectKey, "keyword:estate-sale");
  });

  it("resolves a natural identifier (not just a pre-composed key)", () => {
    const options = freshRoot();
    recordObjectTouch("proj", { kind: "geo", fields: { locality: "Buffalo" }, motionId: "m1", runId: "r1", verb: "worked" }, options);
    const ref = findReferences("proj", { kind: "geo", id: "Buffalo" }, options);
    assert.equal(ref.referenceCount, 1);
  });

  it("is honest-blank for an object nothing has touched", () => {
    const options = freshRoot();
    const ref = findReferences("proj", { kind: "geo", id: "geo:nowhere" }, options);
    assert.equal(ref.referenceCount, 0);
    assert.equal(ref.object, null);
  });

  it("the four fast paths still work and an empty kind still throws", () => {
    const options = freshRoot();
    assert.throws(() => findReferences("proj", { kind: "", id: "x" }, options), /needs a kind/);
  });
});

describe("the run-derivation seam records touches for every object a run produced", () => {
  it("files people (kind:person) and discovered objects onto the ledger from a real run result", () => {
    const options = freshRoot();
    const graph = { id: "chan-1", nodes: [], edges: [] };
    const result = {
      runId: "run-abc",
      nodes: {
        n1: { category: "source", items: [{ email: "lead@acme.com", name: "Lead Person" }] },
        n2: { category: "agent", items: [{ kind: "keyword", query: "estate sale", geo: "buffalo" }] },
        n3: { category: "agent", items: [{ subject: "no identity", body: "skipped" }] },
      },
    };
    const out = recordRunDerivations({ projectId: "proj", graph, result }, options);
    assert.ok(out.touches, "the touch deriver ran");
    assert.equal(out.touches.touched, 2, "the person and the keyword are filed; the identity-less item is skipped");

    const person = getObjectTouch("proj", "email:lead@acme.com", options);
    assert.ok(person, "the person is on the ledger");
    assert.equal(person.touches[0].motionId, "chan-1");
    assert.equal(person.touches[0].runId, "run-abc");

    const keyword = getObjectTouch("proj", "keyword:estate-sale|buffalo", options);
    assert.ok(keyword, "the discovered keyword is on the ledger");
  });
});
