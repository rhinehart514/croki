// Inputs ingestion routes (server.mjs): the front door of the world-signal inbox. A webhook appends one
// captured signal, a CSV drop appends N, and the gtm-signal-github scout's found repo-signals POST in as
// captured inputs. The non-negotiable invariant these tests pin: ingestion only CAPTURES — every route
// lands its signal(s) 'unrouted' and stops. Nothing routes, runs, sends, or auto-approves; routing and any
// run are downstream and still hit the founder gate.
//
// Boots the real route handler on an ephemeral port against an isolated store home, so this exercises the
// actual HTTP wiring, not a re-implementation.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the durable home BEFORE importing the server (and inputs-store), so every write lands in a temp
// dir that the routes and the test reader share.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-inputs-ingestion-"));
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

const { listInputs, listUnroutedInputs } = await import("../src/inputs-store.mjs");
const { server } = await import("../src/server.mjs");

if (!server.listening) await once(server, "listening");

const base = `http://127.0.0.1:${PORT}`;

after(() => {
  server.close();
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("inputs ingestion — capture only, never route or run", () => {
  it("webhook POST appends one unrouted input with provenance", async () => {
    const project = "webhook-test";
    const res = await fetch(`${base}/api/projects/${project}/inputs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "signup", source: "landing-page", payload: { email: "x@y.z" } }),
    });
    assert.equal(res.status, 201);
    const { input } = await res.json();
    assert.equal(input.kind, "signup");
    assert.equal(input.source, "landing-page");
    assert.equal(input.status, "unrouted");
    assert.equal(input.routedTo, null);
    assert.equal(input.payload.email, "x@y.z");
    assert.ok(input.provenance && input.provenance.source === "webhook", "stamps a webhook provenance");

    // Durable: the store has exactly the one captured signal, still unrouted.
    const stored = listInputs(project);
    assert.equal(stored.length, 1);
    assert.equal(listUnroutedInputs(project).length, 1);
  });

  it("webhook rejects a signal with no kind or no source (400)", async () => {
    const project = "webhook-validation";
    const noKind = await fetch(`${base}/api/projects/${project}/inputs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "github" }),
    });
    assert.equal(noKind.status, 400);
    const noSource = await fetch(`${base}/api/projects/${project}/inputs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "star" }),
    });
    assert.equal(noSource.status, 400);
    assert.equal(listInputs(project).length, 0, "a rejected signal is never captured");
  });

  it("CSV drop appends N inputs, each unrouted, with per-row kind override", async () => {
    const project = "csv-test";
    const csv = [
      "kind,handle,note",
      "star,alice,loved the readme",
      "fork,bob,\"forked, then opened an issue\"",
      "star,carol,",
    ].join("\n");
    const res = await fetch(`${base}/api/projects/${project}/inputs/csv?source=github`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: csv,
    });
    assert.equal(res.status, 201);
    const { count, inputs } = await res.json();
    assert.equal(count, 3);
    assert.equal(inputs.length, 3);
    // Per-row kind column overrode the default; the query-string source applied to every row.
    assert.deepEqual(inputs.map((i) => i.kind), ["star", "fork", "star"]);
    assert.ok(inputs.every((i) => i.source === "github"));
    // Quoted comma survived the parse; remaining columns landed in payload.
    assert.equal(inputs[1].payload.note, "forked, then opened an issue");
    assert.equal(inputs[0].payload.handle, "alice");
    // Every imported row is unrouted — a CSV drop captures, it never routes or runs.
    assert.ok(inputs.every((i) => i.status === "unrouted" && i.routedTo === null));
    assert.equal(listUnroutedInputs(project).length, 3);
  });

  it("CSV with only a header (no data rows) is rejected (400), nothing captured", async () => {
    const project = "csv-empty";
    const res = await fetch(`${base}/api/projects/${project}/inputs/csv?kind=signup&source=csv`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: "kind,source,email\n",
    });
    assert.equal(res.status, 400);
    assert.equal(listInputs(project).length, 0);
  });

  it("gtm-signal-github output ingests as inputs stamped provenance source='gtm-signal-github'", async () => {
    const project = "github-signals-test";
    const signals = [
      { action: "star", handle: "founder-a", repo: "leverage", icpFit: "high" },
      { action: "fork", handle: "founder-b", repo: "buffalo-projects-mcp" },
      { handle: "founder-c", repo: "founder-os" }, // no action -> defaults to repo-signal
    ];
    const res = await fetch(`${base}/api/projects/${project}/inputs/github-signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signals, runId: "run-42" }),
    });
    assert.equal(res.status, 201);
    const { count, inputs } = await res.json();
    assert.equal(count, 3);
    assert.deepEqual(inputs.map((i) => i.kind), ["star", "fork", "repo-signal"]);
    assert.ok(inputs.every((i) => i.source === "github"));
    assert.ok(inputs.every((i) => i.provenance.source === "gtm-signal-github"), "provenance carries the scout");
    assert.ok(inputs.every((i) => i.provenance.runId === "run-42"));
    assert.equal(inputs[0].payload.icpFit, "high");
    // The whole point of the wall: a captured pull-signal is never replied to or run — it sits unrouted.
    assert.ok(inputs.every((i) => i.status === "unrouted" && i.routedTo === null));
  });

  it("ingestion NEVER routes or runs: across every door, every captured input stays unrouted", async () => {
    const project = "no-run-proof";
    await fetch(`${base}/api/projects/${project}/inputs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "reply", source: "gmail" }),
    });
    await fetch(`${base}/api/projects/${project}/inputs/csv?kind=signup&source=landing`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: "email\na@b.co\nc@d.co",
    });
    await fetch(`${base}/api/projects/${project}/inputs/github-signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signals: [{ action: "star", handle: "z" }] }),
    });

    const all = listInputs(project);
    assert.equal(all.length, 4); // 1 webhook + 2 csv + 1 github
    // No route promoted ANY signal past the inbox: nothing routed, everything still waiting.
    assert.equal(all.filter((i) => i.status === "routed").length, 0);
    assert.equal(all.filter((i) => i.routedTo !== null).length, 0);
    assert.equal(listUnroutedInputs(project).length, all.length);
  });
});
