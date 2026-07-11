import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  PersistenceConflictError,
  persistence,
  jsonPersistence,
  sqlitePersistence,
  closePersistence,
  databaseFile,
  PROJECT_COLLECTION,
  PROJECT_KEY,
} from "../src/persistence.mjs";
import { migrateJsonToSqlite, migrateIfNeeded, hasJsonToMigrate, sqliteHasData } from "../src/migrate-to-sqlite.mjs";

// Every test runs against an isolated temp GTM_IDE_HOME so the real ~/.gtm-ide is never touched.
function freshHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gtm-persist-"));
}

describe("persistence provider", () => {
  let home;
  let options;

  beforeEach(() => {
    home = freshHome();
    options = { root: home };
  });

  afterEach(() => {
    closePersistence(options);
    fs.rmSync(home, { recursive: true, force: true });
  });

  // Run the same round-trip contract against both backends. The (collection, key) interface and the
  // returned shapes must be identical regardless of where bytes land.
  for (const backend of ["sqlite", "json"]) {
    describe(`${backend} backend`, () => {
      it("round-trips set / get on a per-id collection", () => {
        const p = persistence({ ...options, backend });
        assert.equal(p.get("flows", "g1"), null);
        const data = { id: "g1", revision: 3, nodes: [{ id: "n1" }] };
        assert.deepEqual(p.set("flows", "g1", data), data);
        assert.deepEqual(p.get("flows", "g1"), data);
      });

      it("overwrites on a second set to the same key", () => {
        const p = persistence({ ...options, backend });
        p.set("programs", "default", { schemaVersion: 2, programs: [{ id: "a" }] });
        p.set("programs", "default", { schemaVersion: 2, programs: [{ id: "a" }, { id: "b" }] });
        assert.equal(p.get("programs", "default").programs.length, 2);
      });

      it("lists every document in a collection and isolates collections", () => {
        const p = persistence({ ...options, backend });
        p.set("people", "alpha", { projectId: "alpha", people: [] });
        p.set("people", "beta", { projectId: "beta", people: [{ id: "p1" }] });
        p.set("flows", "g1", { id: "g1" });
        const people = p.list("people").sort((a, b) => a.projectId.localeCompare(b.projectId));
        assert.deepEqual(people.map((d) => d.projectId), ["alpha", "beta"]);
        assert.equal(p.list("flows").length, 1);
        assert.equal(p.list("empty-collection").length, 0);
      });

      it("deletes a document and reports whether one was removed", () => {
        const p = persistence({ ...options, backend });
        p.set("clarity", "default", { items: [] });
        assert.equal(p.delete("clarity", "default"), true);
        assert.equal(p.get("clarity", "default"), null);
        assert.equal(p.delete("clarity", "default"), false);
      });

      it("addresses the project singleton with its fixed key", () => {
        const p = persistence({ ...options, backend });
        const catalog = { catalogSchemaVersion: 1, activeProjectId: "default", projects: [{ id: "default" }] };
        p.set(PROJECT_COLLECTION, PROJECT_KEY, catalog);
        assert.deepEqual(p.get(PROJECT_COLLECTION, PROJECT_KEY), catalog);
        assert.deepEqual(p.list(PROJECT_COLLECTION), [catalog]);
      });

      it("atomically lets exactly one stale document writer win", () => {
        const first = persistence({ ...options, backend });
        const second = persistence({ ...options, backend });
        first.compareAndSet("authorities", "p1", 0, {
          revision: 1, records: [{ id: "base" }],
        });
        const staleA = first.get("authorities", "p1");
        const staleB = second.get("authorities", "p1");
        first.compareAndSet("authorities", "p1", staleA.revision, {
          revision: 2, records: [...staleA.records, { id: "winner" }],
        });
        assert.throws(() => second.compareAndSet("authorities", "p1", staleB.revision, {
          revision: 2, records: [...staleB.records, { id: "loser" }],
        }), (error) => error instanceof PersistenceConflictError
          && error.code === "PERSISTENCE_CONFLICT"
          && error.expectedRevision === 1
          && error.actualRevision === 2);
        assert.deepEqual(first.get("authorities", "p1").records.map((item) => item.id), ["base", "winner"]);
      });
    });
  }

  // The document cache lives in the provider and is shared per-root across separate persistence()
  // calls (the real request shape: a board request re-derives the provider and re-reads the same flow
  // 8+ times). Write-through invalidation must keep a SECOND provider's reads current after the FIRST
  // provider writes — the cache must never serve a value older than the last write in this process.
  for (const backend of ["sqlite", "json"]) {
    it(`${backend}: a second provider sees writes/overwrites/deletes made through the first (cache stays current)`, () => {
      const a = persistence({ ...options, backend });
      const b = persistence({ ...options, backend });

      a.set("flows", "g1", { id: "g1", revision: 1 });
      assert.equal(b.get("flows", "g1").revision, 1, "second provider sees the first's write");

      a.set("flows", "g1", { id: "g1", revision: 2 });
      assert.equal(b.get("flows", "g1").revision, 2, "second provider sees the overwrite, not a stale cache");

      assert.equal(a.delete("flows", "g1"), true);
      assert.equal(b.get("flows", "g1"), null, "second provider sees the delete, not a stale cache");
    });

    it(`${backend}: get returns an isolated copy — mutating it never bleeds into a later read`, () => {
      const p = persistence({ ...options, backend });
      p.set("flows", "g1", { id: "g1", nodes: [{ id: "n1" }] });
      const first = p.get("flows", "g1");
      first.nodes.push({ id: "INJECTED" });
      first.id = "MUTATED";
      const second = p.get("flows", "g1");
      assert.equal(second.id, "g1");
      assert.deepEqual(second.nodes, [{ id: "n1" }], "a caller mutation must not corrupt the cached document");
    });
  }

  it("the json backend writes the legacy on-disk layout (project.json + per-collection dirs)", () => {
    const p = jsonPersistence(options);
    p.set(PROJECT_COLLECTION, PROJECT_KEY, { catalogSchemaVersion: 1, projects: [] });
    p.set("flows", "g1", { id: "g1" });
    assert.ok(fs.existsSync(path.join(home, "project.json")));
    assert.ok(fs.existsSync(path.join(home, "flows", "g1.json")));
  });

  it("the sqlite backend writes the database file, not the legacy json", () => {
    const p = sqlitePersistence(options);
    p.set("flows", "g1", { id: "g1" });
    assert.ok(fs.existsSync(databaseFile(options)));
    assert.equal(fs.existsSync(path.join(home, "flows", "g1.json")), false);
  });
});

describe("migrate-to-sqlite", () => {
  let home;
  let options;

  beforeEach(() => {
    home = freshHome();
    options = { root: home };
  });

  afterEach(() => {
    closePersistence(options);
    fs.rmSync(home, { recursive: true, force: true });
  });

  // Seed a fixture of legacy JSON documents through the JSON backend (the on-disk era), spanning the
  // project singleton, a per-id store, and a per-project store.
  function seedLegacyJson() {
    const json = jsonPersistence(options);
    json.set(PROJECT_COLLECTION, PROJECT_KEY, {
      catalogSchemaVersion: 1,
      activeProjectId: "default",
      projects: [{ id: "default", name: "Seed" }],
    });
    json.set("flows", "graph-1", { id: "graph-1", revision: 5, nodes: [], edges: [] });
    json.set("flows", "graph-2", { id: "graph-2", revision: 1, nodes: [], edges: [] });
    json.set("programs", "default", { schemaVersion: 2, projectId: "default", programs: [{ id: "p1" }] });
    json.set("operator-sessions", "op-1", { id: "op-1", goal: "ship", projectId: "default" });
  }

  it("imports every legacy JSON document into SQLite without touching the JSON files", () => {
    seedLegacyJson();
    const before = fs.readFileSync(path.join(home, "project.json"), "utf8");

    const result = migrateJsonToSqlite(options);
    assert.equal(result.total, 5);
    assert.equal(result.imported.project, 1);
    assert.equal(result.imported.flows, 2);

    // The SQLite copy is readable and matches the source.
    const sqlite = sqlitePersistence(options);
    assert.equal(sqlite.get("flows", "graph-1").revision, 5);
    assert.equal(sqlite.get("programs", "default").programs[0].id, "p1");
    assert.equal(sqlite.get(PROJECT_COLLECTION, PROJECT_KEY).projects[0].name, "Seed");
    assert.equal(sqlite.get("operator-sessions", "op-1").goal, "ship");

    // The JSON files are untouched — additive and reversible.
    assert.ok(fs.existsSync(path.join(home, "project.json")));
    assert.equal(fs.readFileSync(path.join(home, "project.json"), "utf8"), before);
    assert.ok(fs.existsSync(path.join(home, "flows", "graph-1.json")));
  });

  it("is idempotent — running twice upserts to the same state", () => {
    seedLegacyJson();
    migrateJsonToSqlite(options);
    const second = migrateJsonToSqlite(options);
    assert.equal(second.total, 5);
    const sqlite = sqlitePersistence(options);
    // No duplicate rows: list returns exactly the two seeded flows.
    assert.equal(sqlite.list("flows").length, 2);
  });

  it("migrateIfNeeded imports when the DB is empty but JSON exists, then skips on a populated DB", () => {
    seedLegacyJson();
    assert.equal(hasJsonToMigrate(options), true);
    assert.equal(sqliteHasData(options), false);

    const first = migrateIfNeeded(options);
    assert.equal(first.migrated, true);
    assert.equal(sqliteHasData(options), true);

    const second = migrateIfNeeded(options);
    assert.equal(second.migrated, false);
    assert.equal(second.reason, "sqlite-populated");
  });

  it("migrateIfNeeded is a no-op on a fresh home with no JSON", () => {
    const result = migrateIfNeeded(options);
    assert.equal(result.migrated, false);
    assert.equal(result.reason, "no-json");
  });

  it("migrates the workspaces and teams collections (newly routed through persistence)", () => {
    const json = jsonPersistence(options);
    json.set("workspaces", "ws-1", { id: "ws-1", repo: "/tmp/repo", outcome: "project_created", revisions: [] });
    json.set("teams", "personal-founder", { id: "personal-founder", name: "Founder's workspace", members: [] });

    const result = migrateJsonToSqlite(options);
    assert.equal(result.imported.workspaces, 1);
    assert.equal(result.imported.teams, 1);

    const sqlite = sqlitePersistence(options);
    assert.equal(sqlite.get("workspaces", "ws-1").outcome, "project_created");
    assert.equal(sqlite.get("teams", "personal-founder").name, "Founder's workspace");
  });
});
