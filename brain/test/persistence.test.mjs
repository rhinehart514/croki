import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  PersistenceConflictError,
  closePersistence,
  persistence,
} from "../src/persistence.mjs";

const roots = [];

function freshRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-persistence-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    closePersistence({ root });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

for (const backend of ["json"]) {
  describe(`${backend} persistence`, () => {
    it("round-trips, lists, and deletes collection documents", () => {
      const store = persistence({ root: freshRoot(), backend });
      store.set("ventures", "one", { id: "one", name: "One" });
      store.set("ventures", "two", { id: "two", name: "Two" });
      assert.deepEqual(store.get("ventures", "one"), { id: "one", name: "One" });
      assert.deepEqual(store.list("ventures").map((item) => item.id).sort(), ["one", "two"]);
      assert.equal(store.delete("ventures", "one"), true);
      assert.equal(store.delete("ventures", "one"), false);
      assert.equal(store.get("ventures", "one"), null);
    });

    it("compare-and-set advances exactly one revision", () => {
      const store = persistence({ root: freshRoot(), backend });
      store.compareAndSet("placement", "canvas", 0, { revision: 1, positions: {} });
      assert.equal(store.get("placement", "canvas").revision, 1);
      assert.throws(
        () => store.compareAndSet("placement", "canvas", 0, { revision: 1, positions: { stale: true } }),
        PersistenceConflictError,
      );
    });

    it("setIfAbsent never overwrites the first value", () => {
      const store = persistence({ root: freshRoot(), backend });
      assert.equal(store.setIfAbsent("crew", "roster", { refs: ["a"] }).inserted, true);
      const second = store.setIfAbsent("crew", "roster", { refs: ["b"] });
      assert.equal(second.inserted, false);
      assert.deepEqual(second.value, { refs: ["a"] });
    });
  });
}

it("the explicit JSON provider writes readable collection files", () => {
  const root = freshRoot();
  persistence({ root }).set("ventures", "one", { id: "one" });
  const file = path.join(root, "ventures", "one.json");
  assert.equal(fs.existsSync(file), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { id: "one" });
});

it("writes private state directories and JSON documents with restrictive permissions", { skip: process.platform === "win32" }, () => {
  const root = freshRoot();
  persistence({ root }).set("credentials", "founder", { token: "secret" });
  assert.equal(fs.statSync(path.join(root, "credentials")).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(root, "credentials", "founder.json")).mode & 0o777, 0o600);
});
