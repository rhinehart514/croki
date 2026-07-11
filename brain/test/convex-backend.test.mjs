import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { isDeepStrictEqual } from "node:util";

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
import { persistence, jsonPersistence, closePersistence, registerConvexBackend } from "../src/persistence.mjs";

// A fake Convex client exposing exactly the calls the live ConvexHttpClient does — mutation(ref, args)
// and query(ref, args) — backed by an in-memory team document table. It proves the adapter round-trips
// without standing up a real deployment (which needs `npx convex dev` + a login). The function
// reference is a string (makeFunctionReference returns one carrying its name), so the fake routes on it.
function createFakeConvex() {
  // teamId -> Map<key, { key, data, updatedAt, updatedBy }>
  const tables = new Map();
  const calls = { set: 0, compareAndSet: 0, remove: 0, list: 0 };
  let mutationHook = null;

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
    if (fnPath.endsWith("documents:compareAndSet") || fnPath === "compareAndSet") return "compareAndSet";
    if (fnPath.endsWith("documents:remove") || fnPath === "remove") return "remove";
    if (fnPath.endsWith("documents:list") || fnPath === "list") return "list";
    return "unknown";
  }

  return {
    _tables: tables,
    _calls: calls,
    _setMutationHook(fn) {
      mutationHook = fn;
    },
    async mutation(ref, args) {
      const name = refName(ref);
      if (mutationHook) await mutationHook(name, args);
      if (name === "set") {
        calls.set += 1;
        const t = table(args.teamId);
        const existing = t.get(args.key);
        const currentRevision = Number.isInteger(existing?.data?.revision) ? existing.data.revision : null;
        const nextRevision = Number.isInteger(args.data?.revision) ? args.data.revision : null;
        if (existing && (currentRevision !== null || nextRevision !== null)) {
          if (currentRevision === null || nextRevision === null) {
            return { status: "conflict", reason: "revision-shape-changed", currentRevision };
          }
          if (nextRevision === currentRevision) {
            return isDeepStrictEqual(existing.data, args.data)
              ? { status: "unchanged", revision: currentRevision }
              : { status: "conflict", reason: "same-revision-diverged", currentRevision };
          }
          if (nextRevision !== currentRevision + 1) {
            return { status: "conflict", reason: "stale-or-skipped-revision", currentRevision };
          }
        } else if (existing?.updatedAt && args.updatedAt < existing.updatedAt) {
          return { status: "ignored" };
        }
        t.set(args.key, { key: args.key, data: args.data, updatedAt: args.updatedAt, updatedBy: args.updatedBy });
        return { status: existing ? "updated" : "inserted", revision: nextRevision };
      }
      if (name === "compareAndSet") {
        calls.compareAndSet += 1;
        const t = table(args.teamId);
        const existing = t.get(args.key);
        const currentRevision = Number.isInteger(existing?.data?.revision) ? existing.data.revision : null;
        if (!existing && args.expectedRevision !== 0) {
          return { status: "conflict", reason: "missing-base", currentRevision: 0 };
        }
        if (existing && currentRevision === args.data.revision) {
          try {
            assert.deepEqual(existing.data, args.data);
            return { status: "unchanged", revision: currentRevision };
          } catch {
            // Same revision with different data continues to the base-content conflict below.
          }
        }
        if (existing && (!Object.hasOwn(args, "expectedData")
          || !isDeepStrictEqual(existing.data, args.expectedData))) {
          return { status: "conflict", reason: "base-content-diverged", currentRevision };
        }
        const actualRevision = existing ? currentRevision : 0;
        if (actualRevision !== args.expectedRevision || args.data.revision !== args.expectedRevision + 1) {
          return { status: "conflict", reason: "stale-base", currentRevision: actualRevision };
        }
        t.set(args.key, { key: args.key, data: args.data, updatedAt: args.updatedAt, updatedBy: args.updatedBy });
        return { status: existing ? "updated" : "inserted", revision: args.data.revision };
      }
      if (name === "remove") {
        calls.remove += 1;
        const t = table(args.teamId);
        const existing = t.get(args.key);
        const currentRevision = Number.isInteger(existing?.data?.revision) ? existing.data.revision : null;
        if (currentRevision !== null && args.expectedRevision !== currentRevision) {
          return { status: "conflict", reason: "stale-delete", currentRevision };
        }
        t.delete(args.key);
        return { status: existing ? "removed" : "unchanged" };
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
    assert.equal(typeof backend.getFresh, "function");
    assert.equal(typeof backend.set, "function");
    assert.equal(typeof backend.compareAndSet, "function");
    assert.equal(typeof backend.listSyncConflicts, "function");
    assert.equal(typeof backend.list, "function");
    assert.equal(typeof backend.delete, "function");
    // set/get return synchronously (not Promises) — the engine contract.
    const out = backend.set("flows", "g1", { id: "g1", n: 1 });
    assert.deepEqual(out, { id: "g1", n: 1 });
    assert.deepEqual(backend.get("flows", "g1"), { id: "g1", n: 1 });
  });

  it("preserves local CAS and mirrors only the successful writer", async () => {
    backend.compareAndSet("goals", "p1", 0, { revision: 1, goals: [{ id: "base" }] });
    const stale = backend.get("goals", "p1");
    backend.compareAndSet("goals", "p1", stale.revision, {
      revision: 2, goals: [...stale.goals, { id: "winner" }],
    });
    assert.throws(() => backend.compareAndSet("goals", "p1", stale.revision, {
      revision: 2, goals: [...stale.goals, { id: "loser" }],
    }), (error) => error?.code === "PERSISTENCE_CONFLICT");
    await backend.mirror.drain();
    assert.deepEqual(fake._tables.get("team_test").get("goals/p1").data.goals.map((goal) => goal.id), ["base", "winner"]);
  });

  it("preserves every queued CAS step instead of coalescing away its base", async () => {
    backend.compareAndSet("goals", "ordered", 0, { revision: 1, goals: [{ id: "one" }] });
    backend.compareAndSet("goals", "ordered", 1, { revision: 2, goals: [{ id: "one" }, { id: "two" }] });

    await backend.mirror.drain();

    assert.equal(fake._calls.compareAndSet, 2);
    assert.equal(fake._tables.get("team_test").get("goals/ordered").data.revision, 2);
    assert.deepEqual(backend.mirror.getConflicts(), []);
  });

  it("quarantines later local revisions when their queued predecessor loses remotely", async () => {
    fake._tables.set("team_test", new Map([["goals/branched", {
      key: "goals/branched",
      data: { revision: 1, goals: [{ id: "remote-winner" }] },
      updatedAt: "900",
      updatedBy: "other",
    }]]));
    backend.compareAndSet("goals", "branched", 0, {
      revision: 1, goals: [{ id: "offline-base" }],
    });
    backend.compareAndSet("goals", "branched", 1, {
      revision: 2, goals: [{ id: "offline-base" }, { id: "offline-next" }],
    });

    await backend.mirror.drain();

    assert.equal(fake._calls.compareAndSet, 1, "dependent revision must never be probed against the winner");
    assert.deepEqual(fake._tables.get("team_test").get("goals/branched").data.goals, [{ id: "remote-winner" }]);
    assert.deepEqual(backend.mirror.getConflicts().map((item) => item.reason), [
      "base-content-diverged",
      "predecessor-conflict",
    ]);
    assert.equal(backend.get("goals", "branched").revision, 2, "offline branch stays local for reconciliation");

    backend.compareAndSet("goals", "branched", 2, {
      revision: 3, goals: [{ id: "offline-base" }, { id: "offline-next" }, { id: "later" }],
    });
    await backend.mirror.drain();
    assert.equal(fake._calls.compareAndSet, 1, "later writes stay quarantined until conflict resolution");

    const restarted = createConvexBackend({ ...options, root: home, identity: "restarted" });
    restarted.compareAndSet("goals", "branched", 3, {
      revision: 4, goals: [{ id: "offline-base" }, { id: "offline-next" }, { id: "after-restart" }],
    });
    await restarted.mirror.drain();
    assert.equal(fake._calls.compareAndSet, 1, "durable conflict receipt keeps quarantine across restart");
  });

  it("quarantines a dependent edit queued while the losing remote mutation is in flight", async () => {
    fake._tables.set("team_test", new Map([["goals/in-flight", {
      key: "goals/in-flight",
      data: { revision: 1, goals: [{ id: "remote-winner" }] },
      updatedAt: "900",
      updatedBy: "other",
    }]]));
    let injected = false;
    fake._setMutationHook(async (name) => {
      if (name !== "compareAndSet" || injected) return;
      injected = true;
      backend.compareAndSet("goals", "in-flight", 1, {
        revision: 2, goals: [{ id: "offline-base" }, { id: "queued-during-flight" }],
      });
    });
    backend.compareAndSet("goals", "in-flight", 0, {
      revision: 1, goals: [{ id: "offline-base" }],
    });

    await backend.mirror.drain();

    assert.equal(fake._calls.compareAndSet, 1);
    assert.deepEqual(fake._tables.get("team_test").get("goals/in-flight").data.goals, [{ id: "remote-winner" }]);
    assert.ok(backend.mirror.getConflicts().some((item) => item.reason === "unresolved-predecessor-conflict"));
  });

  it("allows only one remote winner when two machines publish the same next revision", async () => {
    const otherHome = freshHome();
    const other = createConvexBackend({ ...options, root: otherHome, identity: "other" });
    try {
      // Both machines read the same remote base.
      fake._tables.set("team_test", new Map([["goals/shared", {
        key: "goals/shared",
        data: { revision: 1, goals: [{ id: "base" }] },
        updatedAt: "900",
        updatedBy: "seed",
      }]]));
      await backend.hydrate();
      await other.hydrate();

      backend.compareAndSet("goals", "shared", 1, {
        revision: 2, goals: [{ id: "base" }, { id: "winner" }],
      });
      other.compareAndSet("goals", "shared", 1, {
        revision: 2, goals: [{ id: "base" }, { id: "loser" }],
      });
      await backend.mirror.drain();
      await other.mirror.drain();

      assert.deepEqual(
        fake._tables.get("team_test").get("goals/shared").data.goals.map((goal) => goal.id),
        ["base", "winner"],
      );
      assert.deepEqual(other.mirror.getConflicts().map((item) => item.reason), ["base-content-diverged"]);
      assert.deepEqual(other.listSyncConflicts().map((item) => item.reason), ["base-content-diverged"]);
      // The losing edit is not destroyed locally; reconciliation can surface it later.
      assert.deepEqual(other.get("goals", "shared").goals.map((goal) => goal.id), ["base", "loser"]);
    } finally {
      await other.mirror.drain();
      closePersistence({ root: otherHome });
      fs.rmSync(otherHome, { recursive: true, force: true });
    }
  });

  it("rejects a matching revision number when the proposed base belongs to another branch", async () => {
    const local = persistence({ root: home, backend: "sqlite" });
    local.set("goals", "same-number", { revision: 1, goals: [{ id: "offline-branch" }] });
    fake._tables.set("team_test", new Map([["goals/same-number", {
      key: "goals/same-number",
      data: { revision: 1, goals: [{ id: "remote-branch" }] },
      updatedAt: "900",
      updatedBy: "other",
    }]]));

    backend.compareAndSet("goals", "same-number", 1, {
      revision: 2, goals: [{ id: "offline-branch" }, { id: "next" }],
    });
    await backend.mirror.drain();

    assert.equal(fake._tables.get("team_test").get("goals/same-number").data.revision, 1);
    assert.equal(backend.mirror.getConflicts()[0].reason, "base-content-diverged");
  });

  it("fails closed instead of silently adopting an existing legacy document into revision one", async () => {
    fake._tables.set("team_test", new Map([["goals/legacy-remote", {
      key: "goals/legacy-remote",
      data: { goals: [{ id: "legacy-remote" }] },
      updatedAt: "900",
      updatedBy: "old-client",
    }]]));
    backend.compareAndSet("goals", "legacy-remote", 0, {
      revision: 1, goals: [{ id: "new-client" }],
    });

    await backend.mirror.drain();

    assert.deepEqual(fake._tables.get("team_test").get("goals/legacy-remote").data, {
      goals: [{ id: "legacy-remote" }],
    });
    assert.equal(backend.mirror.getConflicts()[0].reason, "base-content-diverged");
  });

  it("getFresh bypasses the wrapped local provider cache", () => {
    const local = persistence({ root: home, backend: "json" });
    const nested = createConvexBackend({ root: home, convexUrl: options.convexUrl, local });
    nested.set("operator-sessions", "s1", { id: "s1", status: "running" });
    assert.equal(nested.get("operator-sessions", "s1").status, "running");

    // A cache-free provider is the same boundary as a separate MCP process writing the shared DB.
    jsonPersistence({ root: home }).set("operator-sessions", "s1", {
      id: "s1",
      status: "waiting_for_candidates",
    });

    assert.equal(nested.get("operator-sessions", "s1").status, "running");
    assert.equal(nested.getFresh("operator-sessions", "s1").status, "waiting_for_candidates");
  });

  it("round-trips set / get / list / delete locally AND mirrors each write to Convex", async () => {
    backend.set("flows", "g1", { id: "g1", revision: 1 });
    backend.set("people", "alpha", { projectId: "alpha", people: [] });
    backend.set("people", "beta", { projectId: "beta", people: [{ id: "p1" }] });

    // Local reads are instant and authoritative.
    assert.deepEqual(backend.get("flows", "g1"), { id: "g1", revision: 1 });
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
    // The set and delete both reach Convex in order; versioned operations are never coalesced because
    // doing so would discard the base needed to guard the later operation.
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

  it("hydrates only a provably newer revision and reports ambiguous or stale remote state", async () => {
    for (const key of ["newer-remote", "newer-local", "diverged"]) {
      backend.compareAndSet("goals", key, 0, { revision: 1, goals: [{ id: "local" }] });
      backend.compareAndSet("goals", key, 1, { revision: 2, goals: [{ id: "local" }] });
    }
    backend.compareAndSet("goals", "newer-local", 2, { revision: 3, goals: [{ id: "local" }] });
    await backend.mirror.drain();

    const team = fake._tables.get("team_test");
    team.set("goals/newer-remote", {
      key: "goals/newer-remote", data: { revision: 3, goals: [{ id: "remote" }] }, updatedAt: "5000",
    });
    team.set("goals/newer-local", {
      key: "goals/newer-local", data: { revision: 2, goals: [{ id: "remote" }] }, updatedAt: "5000",
    });
    team.set("goals/diverged", {
      key: "goals/diverged", data: { revision: 2, goals: [{ id: "remote" }] }, updatedAt: "5000",
    });

    const result = await backend.hydrate();

    assert.equal(result.pulled, 1);
    assert.equal(result.skipped, 2);
    assert.deepEqual(result.conflicts.map((item) => item.reason).sort(), [
      "local-not-proven-stale",
      "same-revision-diverged",
    ]);
    assert.equal(backend.get("goals", "newer-remote").revision, 3);
    assert.deepEqual(backend.get("goals", "newer-remote").goals, [{ id: "remote" }]);
    assert.deepEqual(backend.get("goals", "newer-local").goals, [{ id: "local" }]);
    assert.deepEqual(backend.get("goals", "diverged").goals, [{ id: "local" }]);
  });

  it("does not treat a higher remote number as ancestry when a migrated local document has no cursor", async () => {
    const local = persistence({ root: home, backend: "sqlite" });
    local.set("goals", "legacy", { revision: 2, goals: [{ id: "offline-local" }] });
    fake._tables.set("team_test", new Map([["goals/legacy", {
      key: "goals/legacy", data: { revision: 4, goals: [{ id: "other-branch" }] }, updatedAt: "5000",
    }]]));

    const result = await backend.hydrate();

    assert.equal(result.pulled, 0);
    assert.equal(result.conflicts[0].reason, "local-not-proven-stale");
    assert.deepEqual(backend.get("goals", "legacy").goals, [{ id: "offline-local" }]);
    assert.equal(backend.listSyncConflicts()[0].remoteRevision, 4);
  });

  it("does not let a stale machine delete a newer remote revision", async () => {
    fake._tables.set("team_test", new Map([["goals/shared", {
      key: "goals/shared", data: { revision: 2, goals: [{ id: "remote" }] }, updatedAt: "5000",
    }]]));
    backend.set("goals", "shared", { revision: 1, goals: [{ id: "stale" }] });
    await backend.mirror.drain();
    backend.delete("goals", "shared");
    await backend.mirror.drain();

    assert.equal(fake._tables.get("team_test").get("goals/shared").data.revision, 2);
    assert.equal(fake._calls.remove, 0, "delete is quarantined locally after the stale write loses");
    assert.ok(backend.mirror.getConflicts().some((item) => item.reason === "unresolved-predecessor-conflict"));
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
