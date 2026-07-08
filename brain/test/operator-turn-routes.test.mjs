// The composer fast-lane routes (routes/operator.mjs): the read-only briefing snapshot and the
// session-optional turn endpoint. Boots the real route handler on an ephemeral port against an isolated
// store root, so this exercises the actual HTTP wiring, not a re-implementation.
//
// What it proves:
//  - GET /api/operator/briefing returns the composer `briefing` prop shape (eyebrow / rows / summary),
//    with an honest non-empty summary and rows:[] on a fresh home.
//  - POST /api/operator/turn with a STATUS message returns a FAST deterministic answer and NEVER spawns
//    the autonomous drive (zero sessions created).
//  - POST /api/operator/turn with an ACT/RUN message returns mode:"drive" with session:null when
//    allowDrive is false — deferring the create to the client's existing path (still zero sessions).
//  - THE WALL: none of these routes ever create/drive/send. Only the unchanged gate route releases.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the durable home BEFORE importing the server, so every write lands in a temp dir.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-turn-routes-"));
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

const { listOperatorSessions } = await import("../src/operator-store.mjs");
const { server } = await import("../src/server.mjs");

if (!server.listening) await once(server, "listening");

const base = `http://127.0.0.1:${PORT}`;

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("composer fast-lane routes — briefing read + turn", () => {
  it("GET /api/operator/briefing returns the composer prop shape with an honest summary on a fresh home", async () => {
    const res = await fetch(`${base}/api/operator/briefing`);
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.ok(typeof b.eyebrow === "string" && b.eyebrow.length > 0, "eyebrow is a non-empty string");
    assert.ok(Array.isArray(b.rows), "rows is an array");
    assert.equal(b.rows.length, 0, "a fresh home has no pipelines");
    assert.equal(
      b.summary,
      "Nothing is waiting at your gate, and no pipeline has run yet.",
      "the summary is a deterministic honest line, never a fake number",
    );
  });

  it("POST /api/operator/turn with a STATUS message answers fast and NEVER drives", async () => {
    const before = listOperatorSessions({}).length;

    const res = await fetch(`${base}/api/operator/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "what is waiting?", allowDrive: false }),
    });
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.equal(out.mode, "fast");
    assert.equal(out.intent, "status");
    assert.equal(out.answer, "Nothing is waiting at your gate, and no pipeline has run yet.");
    assert.ok(out.briefing && typeof out.briefing === "object", "a status turn carries the raw briefing");

    // THE PROOF: no autonomous session was created by answering a status question.
    assert.equal(listOperatorSessions({}).length, before, "the status turn created no session");
  });

  it("POST /api/operator/turn with an ACT message defers to the client create path (drive + null) and drives nothing", async () => {
    const before = listOperatorSessions({}).length;

    const res = await fetch(`${base}/api/operator/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "draft an outreach email", allowDrive: false }),
    });
    assert.equal(res.status, 202);
    const out = await res.json();
    assert.equal(out.mode, "drive");
    assert.equal(out.intent, "act");
    assert.equal(out.session, null, "with allowDrive false the server never resumes/creates — the client does");

    // THE WALL / no-cage: the turn endpoint created and drove nothing.
    assert.equal(listOperatorSessions({}).length, before, "the act turn created no session");
  });

  it("POST /api/operator/turn with an empty input still classifies to a drive default, never a rejection (no cage)", async () => {
    const res = await fetch(`${base}/api/operator/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "", allowDrive: false }),
    });
    assert.equal(res.status, 202);
    const out = await res.json();
    assert.equal(out.mode, "drive");
    assert.equal(out.intent, "act", "ambiguous/empty defaults to act — never a rejection or a fixed taxonomy");
    assert.equal(out.session, null);
  });
});
