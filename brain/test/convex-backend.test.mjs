import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createConvexBackend,
  convexConfig,
  convexKey,
  splitConvexKey,
  hydrateTeamDocuments,
  teamSyncEnabled,
  enqueueDocument,
  enqueueDelete,
  drainTeamMirror,
  __resetTeamSync,
} from "../src/convex-backend.mjs";
import { persistence, closePersistence, registerConvexBackend } from "../src/persistence.mjs";

// A fake Convex client exposing exactly the calls the live ConvexHttpClient does — mutation(ref, args)
// and query(ref, args) — backed by an in-memory team document table. It proves the adapter round-trips
// without standing up a real deployment (which needs `npx convex dev` + a login). The function
// reference is a string (makeFunctionReference returns one carrying its name), so the fake routes on it.
function createFakeConvex() {
  // teamId -> Map<key, { key, data, updatedAt, updatedBy }>
  const tables = new Map();
  const calls = { set: 0, remove: 0, list: 0 };

  function table(teamId) {
    if (!tables.has(teamId)) tables.set(teamId, new Map());
    return tables.get(teamId);
  }
  // makeFunctionReference returns an opaque object that carries its name on a Symbol(functionName), the
  // same value the live ConvexHttpClient reads to route the call. The fake reads it the same way, then
  // maps "documents:<fn>" to the operation so it routes exactly like a real deployment would.
  function refName(ref) {
    let fnPath = "";
    if (typeof ref === "string") fnPath = ref;
    else if (ref && typeof ref === "object") {
      for (const sym of Object.getOwnPropertySymbols(ref)) {
        if (sym.toString().includes("functionName")) fnPath = String(ref[sym]);
      }
    }
    if (fnPath.endsWith("documents:set") || fnPath === "set") return "set";
    if (fnPath.endsWith("documents:remove") || fnPath === "remove") return "remove";
    if (fnPath.endsWith("documents:list") || fnPath === "list") return "list";
    return "unknown";
  }

  return {
    _tables: tables,
    _calls: calls,
    async mutation(ref, args) {
      const name = refName(ref);
      if (name === "set") {
        calls.set += 1;
        const t = table(args.teamId);
        const existing = t.get(args.key);
        // last-write-wins by timestamp, mirroring documents:set
        if (existing && existing.updatedAt && args.updatedAt < existing.updatedAt) return "older-ignored";
        t.set(args.key, { key: args.key, data: args.data, updatedAt: args.updatedAt, updatedBy: args.updatedBy });
        return "ok";
      }
      if (name === "remove") {
        calls.remove += 1;
        table(args.teamId).delete(args.key);
        return null;
      }
      throw new Error(`unexpected mutation ${name}`);
    },
    async query(ref, args) {
      const name = refName(ref);
      if (name === "list") {
        calls.list += 1;
        return [...table(args.teamId).values()].map((d) => ({
          key: d.key,
          data: d.data,
          updatedAt: d.updatedAt,
        }));
      }
      throw new Error(`unexpected query ${name}`);
    },
  };
}

function freshHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gtm-convex-"));
}

describe("convex key mapping", () => {
  it("joins and splits (collection, key) on the first slash", () => {
    assert.equal(convexKey("flows", "g1"), "flows/g1");
    assert.deepEqual(splitConvexKey("flows/g1"), { collection: "flows", key: "g1" });
    // A key that itself contains a slash splits only on the FIRST boundary.
    assert.deepEqual(splitConvexKey("flows/g1/extra"), { collection: "flows", key: "g1/extra" });
  });
});

describe("convexConfig", () => {
  const saved = {};
  beforeEach(() => {
    for (const k of ["GTM_IDE_CONVEX_URL", "GTM_IDE_TEAM_ID", "GTM_IDE_USER"]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns null with no Convex URL (local-first default)", () => {
    assert.equal(convexConfig(), null);
  });
  it("reads url / teamId / identity from env", () => {
    process.env.GTM_IDE_CONVEX_URL = "https://x.convex.cloud";
    process.env.GTM_IDE_TEAM_ID = "team_123";
    process.env.GTM_IDE_USER = "ada@example.com";
    assert.deepEqual(convexConfig(), {
      url: "https://x.convex.cloud",
      teamId: "team_123",
      identity: "ada@example.com",
    });
  });
  it("prefers explicit options over env", () => {
    process.env.GTM_IDE_CONVEX_URL = "https://env.convex.cloud";
    const cfg = convexConfig({ convexUrl: "https://opt.convex.cloud", teamId: "t", identity: "me" });
    assert.equal(cfg.url, "https://opt.convex.cloud");
    assert.equal(cfg.teamId, "t");
    assert.equal(cfg.identity, "me");
  });
});

describe("convex backend (provider interface, fake client)", () => {
  let home;
  let options;
  let fake;
  let backend;

  beforeEach(() => {
    home = freshHome();
    fake = createFakeConvex();
    // A monotonically increasing timestamp so last-write-wins is deterministic.
    let tick = 0;
    options = {
      root: home,
      convexUrl: "https://fake.convex.cloud",
      teamId: "team_test",
      identity: "tester",
      client: fake,
      now: () => String(1000 + tick++).padStart(20, "0"),
    };
    backend = createConvexBackend(options);
  });

  afterEach(async () => {
    if (backend?.mirror) await backend.mirror.drain();
    closePersistence({ root: home });
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("satisfies the synchronous provider interface", () => {
    assert.equal(typeof backend.get, "function");
    assert.equal(typeof backend.set, "function");
    assert.equal(typeof backend.list, "function");
    assert.equal(typeof backend.delete, "function");
    // set/get return synchronously (not Promises) — the engine contract.
    const out = backend.set("flows", "g1", { id: "g1", n: 1 });
    assert.deepEqual(out, { id: "g1", n: 1 });
    assert.deepEqual(backend.get("flows", "g1"), { id: "g1", n: 1 });
  });

  it("round-trips set / get / list / delete locally AND mirrors each write to Convex", async () => {
    backend.set("flows", "g1", { id: "g1", revision: 3 });
    backend.set("people", "alpha", { projectId: "alpha", people: [] });
    backend.set("people", "beta", { projectId: "beta", people: [{ id: "p1" }] });

    // Local reads are instant and authoritative.
    assert.deepEqual(backend.get("flows", "g1"), { id: "g1", revision: 3 });
    const people = backend.list("people").sort((a, b) => a.projectId.localeCompare(b.projectId));
    assert.deepEqual(people.map((d) => d.projectId), ["alpha", "beta"]);
    assert.equal(backend.list("flows").length, 1);

    // Delete removes locally and reports it.
    assert.equal(backend.delete("flows", "g1"), true);
    assert.equal(backend.get("flows", "g1"), null);
    assert.equal(backend.delete("flows", "g1"), false);

    // The mirror is write-behind — settle it, then assert Convex received the same documents.
    await backend.mirror.drain();
    const team = fake._tables.get("team_test");
    assert.equal(team.get("flows/g1"), undefined, "the deleted doc was removed from Convex too");
    assert.deepEqual(team.get("people/alpha").data, { projectId: "alpha", people: [] });
    assert.deepEqual(team.get("people/beta").data, { projectId: "beta", people: [{ id: "p1" }] });
    // flows/g1's set and later delete coalesce on the same pending key before the drain, so only the
    // two people sets reach Convex plus the one remove — the write-behind queue dedupes by key.
    assert.ok(fake._calls.set >= 2, `expected >=2 set calls, got ${fake._calls.set}`);
    assert.ok(fake._calls.remove >= 1);
  });

  it("hydrate() pulls the team's shared documents into the local backend", async () => {
    // Seed the team table directly (as if another machine had written it).
    const team = new Map();
    team.set("programs/default", { key: "programs/default", data: { programs: [{ id: "p1" }] }, updatedAt: "5" });
    team.set("project/catalog", { key: "project/catalog", data: { projects: [{ id: "default" }] }, updatedAt: "5" });
    fake._tables.set("team_test", team);

    // The local backend starts empty.
    assert.equal(backend.get("programs", "default"), null);

    const result = await backend.hydrate();
    assert.equal(result.pulled, 2);
    assert.deepEqual(backend.get("programs", "default"), { programs: [{ id: "p1" }] });
    assert.deepEqual(backend.get("project", "catalog"), { projects: [{ id: "default" }] });
  });

  it("a configured-but-teamless Convex URL keeps the local backend working with no mirror", () => {
    const teamless = createConvexBackend({ root: home, convexUrl: "https://x.convex.cloud", client: fake });
    assert.equal(teamless.mirror, null);
    teamless.set("flows", "g2", { id: "g2" });
    assert.deepEqual(teamless.get("flows", "g2"), { id: "g2" });
  });

  it("a failing Convex client never breaks the local write (best-effort mirror)", async () => {
    const broken = {
      async mutation() {
        throw new Error("convex unreachable");
      },
      async query() {
        throw new Error("convex unreachable");
      },
    };
    const b = createConvexBackend({ root: home, convexUrl: "https://x.convex.cloud", teamId: "t", client: broken });
    // The local write still succeeds even though the mirror will fail.
    assert.deepEqual(b.set("flows", "g3", { id: "g3" }), { id: "g3" });
    assert.deepEqual(b.get("flows", "g3"), { id: "g3" });
    await b.mirror.drain();
    // hydrate degrades gracefully too.
    const r = await b.hydrate();
    assert.equal(r.pulled, 0);
    assert.ok(r.error);
  });
});

describe("persistence backend selection", () => {
  const saved = {};
  let home;
  beforeEach(() => {
    home = freshHome();
    for (const k of ["GTM_IDE_CONVEX_URL", "GTM_IDE_TEAM_ID", "GTM_IDE_PERSISTENCE"]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    closePersistence({ root: home });
    fs.rmSync(home, { recursive: true, force: true });
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("defaults to SQLite when no Convex URL is set", () => {
    const p = persistence({ root: home });
    assert.equal(p.name, "sqlite");
  });

  it("auto-selects the Convex backend when GTM_IDE_CONVEX_URL is set", () => {
    process.env.GTM_IDE_CONVEX_URL = "https://x.convex.cloud";
    process.env.GTM_IDE_TEAM_ID = "team_x";
    // Importing convex-backend.mjs above already registered the factory; inject a fake client through
    // the provider options is not supported, so this exercises the real wrapper over SQLite with the
    // env teamId. The mirror will try the live client lazily, but no set is performed here so it never
    // contacts Convex.
    const p = persistence({ root: home, client: createFakeConvex() });
    assert.equal(p.name, "convex");
    // Round-trips through the local-first SQLite base regardless of Convex reachability.
    p.set("flows", "g1", { id: "g1" });
    assert.deepEqual(p.get("flows", "g1"), { id: "g1" });
  });

  it("an explicit backend pin overrides the Convex auto-select", () => {
    process.env.GTM_IDE_CONVEX_URL = "https://x.convex.cloud";
    process.env.GTM_IDE_TEAM_ID = "team_x";
    const p = persistence({ root: home, backend: "sqlite" });
    assert.equal(p.name, "sqlite");
  });

  it("the json backend is still selectable", () => {
    const p = persistence({ root: home, backend: "json" });
    assert.equal(p.name, "json");
  });

  it("registerConvexBackend is exported (the cycle-breaking hook)", () => {
    assert.equal(typeof registerConvexBackend, "function");
  });
});

describe("boot hydration through the single seam", () => {
  let home;
  let fake;

  beforeEach(() => {
    home = freshHome();
    fake = createFakeConvex();
  });

  afterEach(() => {
    closePersistence({ root: home });
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("hydrateTeamDocuments lands pulled docs in the SQLite-backed store the engine reads", async () => {
    // Seed the team table directly, as if another machine had written it.
    const team = new Map();
    team.set("programs/default", { key: "programs/default", data: { programs: [{ id: "p1" }] }, updatedAt: "5" });
    team.set("flows/g1", { key: "flows/g1", data: { id: "g1", revision: 2 }, updatedAt: "5" });
    team.set("project/catalog", { key: "project/catalog", data: { projects: [{ id: "default" }] }, updatedAt: "5" });
    fake._tables.set("team_boot", team);

    const result = await hydrateTeamDocuments({
      root: home,
      convexUrl: "https://fake.convex.cloud",
      teamId: "team_boot",
      client: fake,
    });
    assert.equal(result.pulled, 3);

    // Read back through the DEFAULT SQLite backend at that root — i.e. the store every engine read uses,
    // not a side .json file. This is the whole point of routing the boot pull through convex-backend.
    const sqlite = persistence({ root: home, backend: "sqlite" });
    assert.deepEqual(sqlite.get("programs", "default"), { programs: [{ id: "p1" }] });
    assert.deepEqual(sqlite.get("flows", "g1"), { id: "g1", revision: 2 });
    assert.deepEqual(sqlite.get("project", "catalog"), { projects: [{ id: "default" }] });
  });
});

describe("guarded off by default (no team configured)", () => {
  const saved = {};
  const keys = ["GTM_IDE_CONVEX_URL", "GTM_IDE_TEAM_ID", "GTM_IDE_USER"];
  let home;

  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    __resetTeamSync();
    home = freshHome();
  });

  afterEach(() => {
    __resetTeamSync();
    closePersistence({ root: home });
    fs.rmSync(home, { recursive: true, force: true });
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("reports team sync off and never touches the network", async () => {
    assert.equal(teamSyncEnabled(), false);

    let fetched = false;
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => {
      fetched = true;
      throw new Error("local-only mode must never reach for the network");
    };
    try {
      // Boot hydrate: disabled, zero pulled, no client built.
      const result = await hydrateTeamDocuments({ root: home });
      assert.equal(result.disabled, true);
      assert.equal(result.pulled, 0);

      // The shared mirror is null, so enqueue is a pure no-op — even a real store write triggers nothing.
      enqueueDocument("flows", "g1", { id: "g1" });
      enqueueDelete("flows", "g1");
      const p = persistence({ root: home, backend: "sqlite" });
      p.set("flows", "g1", { id: "g1" });
      assert.deepEqual(p.get("flows", "g1"), { id: "g1" });
      await drainTeamMirror();

      assert.equal(fetched, false, "no network call may happen for a local-only deployment");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
