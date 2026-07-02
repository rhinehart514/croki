// GTM-engine wiring (GTM-ENGINE-REBUILD) — the front doors that make the just-built pillars reachable.
//
// The composition/ranking/ingest LOGIC is proven in market-research.test.mjs, path-portfolio.test.mjs,
// outcome-ingest.test.mjs and promote-motion.test.mjs. This file proves the WIRING added on top:
//   - the four new brain routes exist, resolve the project, and return the right envelope (market
//     research, path portfolio, the Result-based outcome report, promote);
//   - promote stops at the founder gate (never sends);
//   - the run-derivation seam ingests real outcomes on completion and joins them on the durable key.
//
// The fuzzy generation routes are forced OFFLINE here (GTM_IDE_OPERATOR_RUNTIME points at no adapter)
// so they take their honest-blank path — the route wiring is exercised without spawning a live model,
// exactly as the product-model derive route is left to its module test rather than an HTTP one.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the durable home BEFORE importing the server (and the stores), and force the operator runtime
// to an unknown id so selectRuntime reports disconnected → the generation routes use their blank default.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-engine-wiring-"));
process.env.GTM_IDE_HOME = HOME;
process.env.HOST = "127.0.0.1";
process.env.GTM_IDE_OPERATOR_RUNTIME = "none";

async function freePort() {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

const PORT = await freePort();
process.env.PORT = String(PORT);

const { runStore, resultStore } = await import("../src/gtm-store.mjs");
const { recordRunDerivations } = await import("../src/run-derivation.mjs");
const { server } = await import("../src/server.mjs");

if (!server.listening) await once(server, "listening");

const base = `http://127.0.0.1:${PORT}`;
const PROJECT = "default"; // the starter project always exists

after(() => {
  server.close();
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("market-research route — the buyer-side ritual front door", () => {
  it("resolves the project and returns a founder-register envelope (honest-blank offline)", async () => {
    const res = await fetch(`${base}/api/projects/${PROJECT}/market-research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.projectId, PROJECT);
    assert.equal(typeof body.summary, "string");
    assert.ok(body.summary.length > 0, "a plain-language summary comes back");
    assert.equal(body.meta.connected, false, "offline → the honest-blank path, no live model spawned");
    assert.ok(Array.isArray(body.objects), "the persisted market objects are returned as an array");
  });
});

describe("path-portfolio route — the portfolio generation front door", () => {
  it("resolves the project and returns a ranked-paths envelope (empty offline)", async () => {
    const res = await fetch(`${base}/api/projects/${PROJECT}/path-portfolio`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.projectId, PROJECT);
    assert.equal(typeof body.count, "number");
    assert.ok(Array.isArray(body.paths), "the persisted paths are returned as an array");
    assert.equal(typeof body.summary, "string");
    assert.equal(body.meta.connected, false);
  });
});

describe("outcomes route — the Result-based report replaces the legacy systems view", () => {
  it("folds seeded runs + joined results into a per-path picture", async () => {
    // Seed a staged run whose one item carries a durable joinKey, and a real outcome joined on that key.
    const run = runStore.create({ projectId: PROJECT, pathId: "path-outcome", items: [{ joinKey: "jk-1", channel: "email" }], status: "staged" });
    resultStore.create({ projectId: PROJECT, joinKey: "jk-1", runId: run.id, pathId: "path-outcome", outcomeKind: "reply", source: "founder-entered" });

    const res = await fetch(`${base}/api/projects/${PROJECT}/outcomes`);
    assert.equal(res.status, 200);
    const report = await res.json();
    assert.equal(report.projectId, PROJECT);
    assert.ok(report.totals.staged >= 1, "the staged item is counted");
    assert.ok(report.totals.measured >= 1, "the joined outcome is counted as measured");
    const entry = report.paths.find((p) => p.pathId === "path-outcome");
    assert.ok(entry, "the path with an outcome appears in the report");
    assert.equal(entry.outcomes.reply, 1, "the reply outcome is tallied under the path");
    assert.equal(typeof entry.summary, "string");
  });
});

describe("promote route — a proven run becomes a repeatable motion, still gated", () => {
  it("wraps the run in a cadence motion and never sends", async () => {
    const run = runStore.create({ projectId: PROJECT, pathId: "path-promote", items: [{ joinKey: "jk-2" }], status: "staged" });
    const res = await fetch(`${base}/api/projects/${PROJECT}/runs/${run.id}/promote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cadence: "weekly" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.motion.sourceRunId, run.id, "the motion points back at the run it was promoted from");
    assert.equal(body.motion.cadence, "weekly");
    assert.ok(body.motion.nextRunAt, "a weekly cadence arms the next re-run");
    assert.ok(body.motion.nextRunTemplate, "the next-run template carries the proven run forward");
    assert.match(body.summary, /gate/i, "the summary tells the founder it still stops at the gate");
  });
});

describe("run-derivation seam — outcomes ingest on run completion", () => {
  it("ingests carried outcomes and joins them to the run on the durable key", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-deriv-ingest-"));
    const options = { root };
    try {
      const run = runStore.create({ projectId: "p1", pathId: "path-1", items: [{ joinKey: "k-99", channel: "linkedin" }], status: "staged" }, options);
      // A completion that carries a real outcome (a founder-entered reply) keyed to the staged item.
      const result = {
        graphId: "g1",
        runId: "run-1",
        pendingGates: [],
        nodes: {},
        outcomes: { "founder-entered": [{ joinKey: "k-99", outcomeKind: "reply" }] },
      };
      const out = recordRunDerivations({ projectId: "p1", graph: { id: "g1" }, result }, options);
      assert.ok(out.outcome, "the fifth derivation ran because outcomes were carried");
      assert.equal(out.outcome.joined, 1, "the outcome joined its staged run");
      const results = resultStore.list({ ...options, projectId: "p1" });
      assert.equal(results.length, 1, "a Result was recorded");
      assert.equal(results[0].runId, run.id, "the Result ties back to the staged run");
      assert.equal(results[0].outcomeKind, "reply");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("is an honest no-op when a completion carries no outcomes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-deriv-noop-"));
    const options = { root };
    try {
      const out = recordRunDerivations({ projectId: "p2", graph: { id: "g2" }, result: { runId: "r2", pendingGates: [], nodes: {} } }, options);
      assert.equal(out.outcome, null, "no outcomes → no Result fabricated");
      assert.equal(resultStore.list({ ...options, projectId: "p2" }).length, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
