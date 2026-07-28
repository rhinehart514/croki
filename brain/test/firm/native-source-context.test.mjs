import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { captureNativeSourceRefs } from "../../src/firm/work-loop-direct-sdk.mjs";

function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "drover-native-source-"));
  fs.writeFileSync(path.join(cwd, "product.txt"), ["one", "two", "three", "four"].join("\n"));
  fs.writeFileSync(path.join(cwd, ".env"), "SECRET=never");
  return cwd;
}

describe("provider-native source settlement", () => {
  it("mints a bounded digest reference from a successful exact file observation", () => {
    const cwd = fixture();
    const refs = captureNativeSourceRefs({
      cwd,
      result: {
        status: "passed",
        source: { path: path.join(cwd, "product.txt"), startLine: 2, endLine: 3 },
      },
    });
    assert.equal(refs.length, 1);
    assert.match(refs[0], /^repository:product\.txt#L2-L3:[0-9a-f]{12}$/);
  });

  it("fails closed for failed, escaping, secret-bearing, missing, and invalid observations", () => {
    const cwd = fixture();
    const outside = path.join(os.tmpdir(), "outside-native-source.txt");
    fs.writeFileSync(outside, "outside");
    const observations = [
      { status: "failed", source: { path: path.join(cwd, "product.txt") } },
      { status: "passed", source: { path: outside } },
      { status: "passed", source: { path: "../outside-native-source.txt" } },
      { status: "passed", source: { path: ".env" } },
      { status: "passed", source: { path: "missing.txt" } },
      { status: "passed", source: { path: "product.txt", startLine: 0, endLine: 2 } },
    ];
    for (const result of observations) {
      assert.deepEqual(captureNativeSourceRefs({ cwd, result }), []);
    }
  });
});
