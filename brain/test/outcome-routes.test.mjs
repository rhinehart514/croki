// The outcome door (server.mjs): the write route that lands what actually happened. POST an outcome
// keyed off a staged item's joinKey; the server joins it back to the run + path that produced it and
// records a Result the GET report then reads. This proves the round trip through the real HTTP wiring
// (not a re-implementation): a posted outcome becomes a measured Result the outcome report reports.
//
// The wall is untouched — recording an outcome captures what ALREADY happened; it never sends.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the durable home BEFORE importing the server (and the stores), so route writes and test seeds
// share one temp dir.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-outcome-routes-"));
process.env.GTM_IDE_HOME = HOME;
process.env.HOST = "127.0.0.1";

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

const { gtmPathStore, runStore } = await import("../src/gtm-store.mjs");
const { server } = await import("../src/server.mjs");

if (!server.listening) await once(server, "listening");

const base = `http://127.0.0.1:${PORT}`;

after(() => {
  server.close();
  fs.rmSync(HOME, { recursive: true, force: true });
});

// Seed a project with a selected path and a staged run whose items carry durable joinKeys — the same
// shape run-compile stages at the founder gate.
function seedRun(projectId, items) {
  const gtmPath = gtmPathStore.create(
    {
      projectId,
      summary: "Reach solo founders in indie Discords with a launch nudge",
      bet: { buyer: "solo founders", channel: "indie-hacker Discord", offer: "free launch checklist" },
      status: "selected",
    },
    { projectId },
  );
  const run = runStore.create(
    {
      projectId,
      pathId: gtmPath.id,
      status: "staged",
      items: items ?? [
        { joinKey: "handle-ada", buyer: "Ada", channel: "discord", offer: "checklist", message: "hey Ada" },
        { joinKey: "handle-bo", buyer: "Bo", channel: "discord", offer: "checklist", message: "hey Bo" },
      ],
    },
    { projectId },
  );
  return { pathId: gtmPath.id, runId: run.id };
}

describe("outcome routes — the write door", () => {
  it("a posted outcome joins its run and becomes a measured Result the report reads", async () => {
    const projectId = "outcome-routes-single";
    const { pathId, runId } = seedRun(projectId);

    const res = await fetch(`${base}/api/projects/${projectId}/outcomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinKey: "handle-ada", outcomeKind: "reply", value: 1 }),
    });
    assert.equal(res.status, 200);
    const posted = await res.json();
    assert.equal(posted.joined, true);
    // Joined back to the exact run + path that produced the staged item.
    assert.equal(posted.result.runId, runId);
    assert.equal(posted.result.pathId, pathId);
    assert.equal(posted.result.outcomeKind, "reply");
    // A manual record with no explicit source defaults to founder-entered.
    assert.equal(posted.result.source, "founder-entered");

    // The read side now reports it as measured — a real Result, not a fabricated rate.
    const report = await fetch(`${base}/api/projects/${projectId}/outcomes`).then((r) => r.json());
    assert.equal(report.totals.staged, 2);
    assert.equal(report.totals.measured, 1);
    assert.equal(report.totals.unmeasured, 1);
    assert.equal(report.totals.results, 1);
    const line = report.paths.find((p) => p.pathId === pathId);
    assert.deepEqual(line.outcomes, { reply: 1 });
  });

  it("accepts a batch under the `outcomes` list, each joined on its key", async () => {
    const projectId = "outcome-routes-batch";
    const { pathId } = seedRun(projectId);

    const res = await fetch(`${base}/api/projects/${projectId}/outcomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcomes: [
          { joinKey: "handle-ada", outcomeKind: "meeting" },
          { joinKey: "handle-bo", outcomeKind: "signup" },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const posted = await res.json();
    assert.equal(posted.joined, 2);
    assert.equal(posted.unjoined, 0);

    const report = await fetch(`${base}/api/projects/${projectId}/outcomes`).then((r) => r.json());
    assert.equal(report.totals.measured, 2);
    const line = report.paths.find((p) => p.pathId === pathId);
    assert.deepEqual(line.outcomes, { meeting: 1, signup: 1 });
  });

  it("refuses a single outcome with no joinKey (400), without recording anything", async () => {
    const projectId = "outcome-routes-nokey";
    seedRun(projectId);
    const res = await fetch(`${base}/api/projects/${projectId}/outcomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcomeKind: "reply" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /joinKey/);

    const report = await fetch(`${base}/api/projects/${projectId}/outcomes`).then((r) => r.json());
    assert.equal(report.totals.results, 0);
  });
});
