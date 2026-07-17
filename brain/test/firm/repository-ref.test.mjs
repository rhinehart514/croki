import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isRepositoryRef, parseRepositoryRef } from "../../src/firm/repository-ref.mjs";

describe("repository citation ref", () => {
  it("accepts a well-formed citation of the shape truth.mjs mints", () => {
    const ref = "repository:src/app.mjs#L10-L20:0a1b2c3d4e5f";
    assert.ok(isRepositoryRef(ref));
    assert.deepEqual(parseRepositoryRef(ref), { path: "src/app.mjs", from: 10, to: 20, digest: "0a1b2c3d4e5f" });
  });

  it("fails closed on anything that only wears the prefix", () => {
    for (const spoof of [
      "repository:",
      "repository:evil",
      "repository:src/app.mjs",
      "repository:src/app.mjs#L10-L20",
      "repository:src/app.mjs#L20-L10:0a1b2c3d4e5f",
      "repository:../etc/passwd#L1-L2:0a1b2c3d4e5f",
      "repository:/abs/path#L1-L2:0a1b2c3d4e5f",
      "repository:src/app.mjs#L1-L2:NOTHEX",
      "repository:src/app.mjs#L0-L2:0a1b2c",
    ]) {
      assert.equal(isRepositoryRef(spoof), false, spoof);
    }
  });
});
