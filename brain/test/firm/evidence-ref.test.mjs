import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEvidenceRef, EVIDENCE_REF_KINDS, formatEvidenceRef, resolveEvidenceRef } from "../../src/firm/evidence-ref.mjs";

describe("EvidenceRef", () => {
  it("normalizes every allowed evidence authority", () => {
    for (const kind of EVIDENCE_REF_KINDS) {
      const ref = createEvidenceRef({ ventureId: "venture-one", kind, id: "record-one", ...(kind === "repository-citation" ? { digest: "digest-one" } : {}) });
      assert.equal(formatEvidenceRef(ref), `${kind}:record-one`);
    }
  });

  it("resolves, reports stale/unresolved, and fails closed across ventures", () => {
    const exact = createEvidenceRef({ ventureId: "venture-one", kind: "outcome", id: "one", version: 2 });
    assert.equal(resolveEvidenceRef(exact, { ventureId: "venture-one", load: () => ({ id: "one", ventureId: "venture-one", revision: 2 }) }).state, "resolved");
    assert.equal(resolveEvidenceRef(exact, { ventureId: "venture-one", load: () => ({ id: "one", ventureId: "venture-one", revision: 3 }) }).state, "stale");
    assert.equal(resolveEvidenceRef(exact, { ventureId: "venture-one", load: () => null }).state, "unresolved");
    assert.throws(() => resolveEvidenceRef(exact, { ventureId: "venture-two", load: () => null }), (error) => error.code === "evidence_ref_cross_scope");
  });

  it("detects repository digest staleness instead of trusting a prefix", () => {
    const ref = createEvidenceRef({ ventureId: "venture-one", kind: "repository-citation", id: "src/app.mjs#L1", digest: "captured" });
    assert.equal(resolveEvidenceRef(ref, { ventureId: "venture-one", load: () => ({ ventureId: "venture-one" }), currentDigest: () => "captured" }).state, "resolved");
    assert.equal(resolveEvidenceRef(ref, { ventureId: "venture-one", load: () => ({ ventureId: "venture-one" }), currentDigest: () => "changed" }).state, "stale");
    assert.equal(resolveEvidenceRef(ref, { ventureId: "venture-one", load: () => ({ ventureId: "venture-one" }) }).state, "unresolved");
  });
});
