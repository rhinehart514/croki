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

const { createOperatorSession, getOperatorSession, listOperatorSessions } = await import("../src/operator-store.mjs");
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
    // Wave 5: the ANSWER is now crew-written from the briefing (voiced), not the raw summary string.
    // The raw honest briefing still rides back on out.briefing for the UI. Either the model wrote a
    // real answer, or (no subscription) it fell back to that exact honest line — both are non-empty.
    assert.ok(typeof out.answer === "string" && out.answer.length > 0, "a voiced status answer");
    assert.ok(out.briefing && typeof out.briefing === "object", "a status turn carries the raw briefing");
    assert.equal(
      out.briefing.summary,
      "Nothing is waiting at your gate, and no pipeline has run yet.",
      "the raw briefing summary is still the deterministic honest line",
    );

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

  it("POST /api/operator/turn with an empty input is answered, never rejected (no cage)", async () => {
    const res = await fetch(`${base}/api/operator/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "", allowDrive: false }),
    });
    // Wave 5: empty/ambiguous input is a low-confidence catch-all, so it becomes a real conversational
    // turn (a fast answer) rather than silently driving the builder. The no-cage property is intact —
    // it is answered, never rejected with an error or forced into a fixed taxonomy.
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.equal(out.mode, "fast");
    assert.equal(out.intent, "converse", "ambiguous/empty is a chat turn, not a silent build");
    assert.ok(typeof out.answer === "string" && out.answer.length > 0, "the founder still gets a reply");
  });

  it("binds semantic view context on the next composer turn without starting work", async () => {
    const session = createOperatorSession({ goal: "Read the terrain.", projectId: "view-project" });
    const res = await fetch(`${base}/api/operator/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "view-project", sessionId: session.id, input: "draft a terrain move", allowDrive: false,
        surface: "terrain", lens: "operator", focusRef: "question:q-1",
        contextRefs: ["question:q-1", "product-truth:truth-1"],
      }),
    });
    assert.equal(res.status, 202);
    const persisted = getOperatorSession(session.id);
    assert.equal(persisted.surface, "terrain");
    assert.equal(persisted.lens, "operator");
    assert.deepEqual(persisted.focusRef, { type: "question", id: "q-1" });
    assert.ok(persisted.contextRefs.some((ref) => ref.type === "product-truth" && ref.id === "truth-1"));
    assert.equal(persisted.status, "ready", "a view update rides the turn and does not launch the operator");

    const crossed = await fetch(`${base}/api/operator/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "other-project", sessionId: session.id, input: "what is waiting?", allowDrive: false,
        surface: "pipeline", lens: "engineer", focusRef: "pipeline:other-pipeline",
      }),
    });
    assert.equal(crossed.status, 409);
    assert.deepEqual(getOperatorSession(session.id).focusRef, { type: "question", id: "q-1" }, "another project cannot replace the focus");
  });
});
