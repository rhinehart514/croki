// grants.test.mjs — trust as remembered dialogue (build contract §4A.3), and the wall-authority matrix
// invariant (§5.8): a grant may skip the WAIT for a matching act type, but it NEVER mints the wall's
// release capability, and a deploy still waits regardless of any grant.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  actTypeForEffect, recordGrant, revokeGrant, listGrants, liveGrants, grantSkipsWait,
} from "../../src/firm/grants.mjs";
import { createVenture } from "../../src/firm/venture-store.mjs";
import { hasWallRelease } from "../../src/firm/wall.mjs";

function freshVenture(name) {
  const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-grants-")) };
  const venture = createVenture({ name }, options);
  return { venture, options };
}

describe("actTypeForEffect — deterministic act-type derivation", () => {
  it("keys on kind and channel, normalizing send→message so a grant matches either spelling", () => {
    assert.equal(actTypeForEffect({ kind: "message", channel: "gmail", to: "x@y.com" }), "message:gmail");
    assert.equal(actTypeForEffect({ kind: "send", channel: "gmail" }), "message:gmail");
    assert.equal(actTypeForEffect({ kind: "message" }), "message");
    assert.equal(actTypeForEffect({ kind: "deploy", target: "prod" }), "deploy");
    assert.equal(actTypeForEffect({}), null);
    assert.equal(actTypeForEffect(null), null);
  });
});

describe("recordGrant / revokeGrant — a plain readable, idempotent, revocable venture file", () => {
  it("records a grant keyed on the act type and links it to the founder message that is its authority", () => {
    const { venture, options } = freshVenture("grant record");
    const grant = recordGrant({ ventureId: venture.id, actType: "message:gmail", fromMessageId: "message-1" }, options);
    assert.equal(grant.actType, "message:gmail");
    assert.equal(grant.fromMessageId, "message-1");
    assert.equal(grant.revoked, false);
    assert.equal(listGrants(venture.id, options).length, 1);
  });

  it("re-granting a live act type is idempotent — a founder repeating themselves never stacks records", () => {
    const { venture, options } = freshVenture("grant idempotent");
    const first = recordGrant({ ventureId: venture.id, actType: "message:gmail" }, options);
    const second = recordGrant({ ventureId: venture.id, actType: "message:gmail" }, options);
    assert.equal(first.id, second.id);
    assert.equal(liveGrants(venture.id, options).length, 1);
  });

  it("revoking is a plain readable-file change; a later re-grant is a fresh record so history is legible", () => {
    const { venture, options } = freshVenture("grant revoke");
    recordGrant({ ventureId: venture.id, actType: "message:gmail" }, options);
    const revoked = revokeGrant({ ventureId: venture.id, actType: "message:gmail" }, options);
    assert.equal(revoked.length, 1);
    assert.equal(liveGrants(venture.id, options).length, 0);
    assert.equal(listGrants(venture.id, options)[0].revoked, true, "the revoked grant stays in the readable file");
    const regranted = recordGrant({ ventureId: venture.id, actType: "message:gmail" }, options);
    assert.equal(liveGrants(venture.id, options).length, 1);
    assert.equal(listGrants(venture.id, options).length, 2, "history shows given, taken, given again");
    assert.notEqual(regranted.revoked, true);
  });
});

describe("grantSkipsWait — the deterministic guard check", () => {
  it("a matching live grant skips the wait; a non-matching act type does not", () => {
    const { venture, options } = freshVenture("grant guard");
    recordGrant({ ventureId: venture.id, actType: "message:gmail" }, options);
    const matched = grantSkipsWait(venture.id, { kind: "message", channel: "gmail", to: "x@y.com" }, options);
    assert.equal(matched.skip, true);
    assert.equal(matched.grant.actType, "message:gmail");

    const nonMatch = grantSkipsWait(venture.id, { kind: "message", channel: "linkedin", to: "someone" }, options);
    assert.equal(nonMatch.skip, false);
  });

  it("a revoked grant no longer skips the wait", () => {
    const { venture, options } = freshVenture("grant revoked guard");
    recordGrant({ ventureId: venture.id, actType: "message:gmail" }, options);
    revokeGrant({ ventureId: venture.id, actType: "message:gmail" }, options);
    assert.equal(grantSkipsWait(venture.id, { kind: "message", channel: "gmail" }, options).skip, false);
  });

  it("INVARIANT §5.8: a deploy NEVER skips the wait, even with a matching grant on record", () => {
    const { venture, options } = freshVenture("grant deploy");
    // Even if a founder file somehow carries a deploy grant, the guard refuses to let it skip.
    recordGrant({ ventureId: venture.id, actType: "deploy" }, options);
    const result = grantSkipsWait(venture.id, { kind: "deploy", target: "prod" }, options);
    assert.equal(result.skip, false);
    assert.equal(result.neverSkippable, true);
  });

  it("INVARIANT §5.8: grantSkipsWait returns only a wait-skip decision — never the wall release capability", () => {
    const { venture, options } = freshVenture("grant no capability");
    const grant = recordGrant({ ventureId: venture.id, actType: "message:gmail" }, options);
    const result = grantSkipsWait(venture.id, { kind: "message", channel: "gmail" }, options);
    // Nothing the guard returns can satisfy hasWallRelease — a grant is not a release capability.
    assert.equal(hasWallRelease({ runtime: { outwardRelease: grant } }), false);
    assert.equal(hasWallRelease({ runtime: { outwardRelease: result.grant } }), false);
    assert.equal(hasWallRelease(result), false);
    assert.equal("runtime" in result, false, "the guard result carries no release-shaped field at all");
  });
});
