import assert from "node:assert/strict";
import test from "node:test";

import { versionPolicyIssues } from "./check-version-policy.mjs";

test("the current 0.x line remains allowed when manifests agree", () => {
  assert.deepEqual(versionPolicyIssues({
    packageVersion: "0.3.4",
    lockVersion: "0.3.4",
    lockRootVersion: "0.3.4",
  }), []);
});

test("1.0 remains blocked until the founder explicitly changes the approved major", () => {
  assert.match(versionPolicyIssues({
    packageVersion: "1.0.0",
    lockVersion: "1.0.0",
    lockRootVersion: "1.0.0",
  })[0], /founder-gated 1\.0 boundary/);
  assert.deepEqual(versionPolicyIssues({
    packageVersion: "1.0.0",
    lockVersion: "1.0.0",
    lockRootVersion: "1.0.0",
    approvedMajor: 1,
  }), []);
});

test("invalid or mismatched manifests fail closed", () => {
  assert.match(versionPolicyIssues({
    packageVersion: "latest",
    lockVersion: "latest",
    lockRootVersion: "latest",
  })[0], /exact X\.Y\.Z/);
  assert.match(versionPolicyIssues({
    packageVersion: "0.3.4",
    lockVersion: "0.3.3",
    lockRootVersion: "0.3.4",
  })[0], /versions disagree/);
});
