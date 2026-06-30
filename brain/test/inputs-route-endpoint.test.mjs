// The Phase-5 server doors (server.mjs): POST /api/projects/:id/inputs/route works the inbox, and
// POST /api/operator/ambient/tick is the standing-brief scheduler hook. These pin two invariants on the
// real HTTP wiring: (1) ROUTING IS A SEPARATE, EXPLICIT DOOR — capturing a signal leaves it 'unrouted'
// until /route is called, so ingestion never auto-runs; (2) the tick hook is server-CALLABLE, not a
// module-scope timer (importing the server spins no interval), and with nothing due it wakes nothing.
//
// Boots the real route handler on an ephemeral port against an isolated store home.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-inputs-route-"));
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

const { listInputs } = await import("../src/inputs-store.mjs");
const { server } = await import("../src/server.mjs");

if (!server.listening) await once(server, "listening");

const base = `http://127.0.0.1:${PORT}`;

after(() => {
  server.close();
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("inputs routing + ambient tick — explicit doors, never auto-fired by capture", () => {
  it("captured signals stay unrouted until /route is explicitly called", async () => {
    const project = "default"; // the fresh catalog's project (no channels → unmatched signals ignore)
    for (const body of [{ kind: "commit", source: "github" }, { kind: "weather", source: "noaa" }]) {
      await fetch(`${base}/api/projects/${project}/inputs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    // Ingestion did NOT route: both signals sit unrouted.
    assert.equal(listInputs(project, { status: "unrouted" }).length, 2, "capture leaves signals unrouted");

    // The explicit door works the inbox. With no channels and no scorer wired, every signal ignores —
    // and critically, nothing is run or sent.
    const res = await fetch(`${base}/api/projects/${project}/inputs/route`, { method: "POST" });
    assert.equal(res.status, 200);
    const { count, results } = await res.json();
    assert.equal(count, 2);
    assert.ok(results.every((r) => r.route === "ignore"), "no channel + no scorer → every signal ignores");
    assert.ok(results.every((r) => r.sessionId === null), "ignore never starts an operator session");
    // The inbox is now fully worked; nothing left unrouted, nothing routed to a run.
    assert.equal(listInputs(project, { status: "unrouted" }).length, 0);
    assert.equal(listInputs(project, { status: "routed" }).length, 0);
  });

  it("a per-input founder decision routes ONE signal to a channel, or sets it aside — and only records", async () => {
    const project = "default";
    // Capture two fresh signals (the prior test worked the inbox empty).
    for (const body of [{ kind: "reply", source: "email" }, { kind: "star", source: "github" }]) {
      await fetch(`${base}/api/projects/${project}/inputs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    const unrouted = listInputs(project, { status: "unrouted" });
    assert.equal(unrouted.length, 2);
    const [first, second] = unrouted;

    // Route the first to a chosen channel/flow. The record flips to 'routed' with routedTo set; nothing
    // runs (the response is just the mutated record, no session).
    const routeRes = await fetch(`${base}/api/projects/${project}/inputs/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputId: first.id, routedTo: "flow-welcome" }),
    });
    assert.equal(routeRes.status, 200);
    const routed = (await routeRes.json()).input;
    assert.equal(routed.status, "routed");
    assert.equal(routed.routedTo, "flow-welcome");
    assert.equal("sessionId" in routed, false, "routing only records — it starts no session");

    // Ignore the second. It flips to 'ignored' with no target.
    const ignoreRes = await fetch(`${base}/api/projects/${project}/inputs/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputId: second.id, ignore: true }),
    });
    assert.equal(ignoreRes.status, 200);
    const ignored = (await ignoreRes.json()).input;
    assert.equal(ignored.status, "ignored");
    assert.equal(ignored.routedTo, null);

    // The inbox is now fully decided — nothing left unrouted.
    assert.equal(listInputs(project, { status: "unrouted" }).length, 0);
  });

  it("the ambient tick hook is server-callable and wakes nothing when nothing is due", async () => {
    const res = await fetch(`${base}/api/operator/ambient/tick`, { method: "POST" });
    assert.equal(res.status, 200);
    const { woken } = await res.json();
    assert.deepEqual(woken, [], "no due standing brief → nothing woken, nothing run");
  });
});
