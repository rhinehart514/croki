// The founder-facing teammate card, at the route level: GET a teammate's soul as a plain-words view,
// and POST the founder's blessing (promote) or "not yet" (dismiss). Two invariants under test:
//   1. Real signals only + round-trip: a lesson the founder has actually corrected enough times shows
//      as "ready"; the founder's explicit promote makes it permanent; dismiss sets it aside. Nothing is
//      seeded — a teammate with no soul reads empty, never a fake number.
//   2. The founder never reads machinery: the route body never carries a systemPrompt, a steeringPrompt,
//      a rawPrompt, or a soul's internal status/occurrences/source plumbing.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import handleCrew from "../src/routes/crew.mjs";
import { teammateSoulStore as store } from "../src/teammate-soul-store.mjs";
import { patternKeyFor } from "../src/teammate-soul.mjs";
import { claimFounderSession, founderBootstrapCode } from "../src/routes/session-guard.mjs";

const PROJECT = "rodentradar";
const REF = "outreach-writer";

// One isolated on-disk root for the whole file, wired through the env the default persistence reads —
// the route calls the store with no opts, so it must resolve to the same root the test seeds.
let root;
let prevHome;
let prevBackend;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "crew-fv-"));
  prevHome = process.env.GTM_IDE_HOME;
  prevBackend = process.env.GTM_IDE_PERSISTENCE;
  process.env.GTM_IDE_HOME = root;
  process.env.GTM_IDE_PERSISTENCE = "json";
});
after(() => {
  if (prevHome === undefined) delete process.env.GTM_IDE_HOME; else process.env.GTM_IDE_HOME = prevHome;
  if (prevBackend === undefined) delete process.env.GTM_IDE_PERSISTENCE; else process.env.GTM_IDE_PERSISTENCE = prevBackend;
  fs.rmSync(root, { recursive: true, force: true });
});

// Drive the real route handler with a minimal request/response, return { status, body }.
function browserCookie() {
  let value = "";
  claimFounderSession({ headers: {} }, { setHeader(_name, next) { value = next; } }, founderBootstrapCode());
  return value.split(";")[0];
}

async function call(method, pathname, payload, headers = method === "POST" ? { cookie: browserCookie() } : {}) {
  const req = Readable.from([payload ? JSON.stringify(payload) : ""]);
  req.method = method;
  req.headers = headers;
  let status = 0;
  let raw = "";
  const res = {
    writeHead(s) { status = s; },
    end(str) { raw = str || ""; },
  };
  const url = new URL(`http://x${pathname}`);
  const handled = await handleCrew({ req, res, url });
  assert.equal(handled, true, `route should handle ${method} ${pathname}`);
  return { status, body: raw ? JSON.parse(raw) : null, raw };
}

// Correct the same wording enough times, across enough distinct tasks, to clear the graduation bar.
function makeReady(text, key = "run") {
  store.record(PROJECT, REF, { text, taskId: `${key}1` });
  store.record(PROJECT, REF, { text, taskId: `${key}2` });
  store.record(PROJECT, REF, { text, taskId: `${key}2` });
}

describe("crew founder-view route: real signals + one-tap graduation", () => {
  it("a never-touched teammate reads empty — no name, zero record, no fake lessons", async () => {
    const { status, body } = await call("GET", `/api/projects/${PROJECT}/crew/never-born/profile`);
    assert.equal(status, 200);
    assert.equal(body.profile.name, null);
    assert.deepEqual(body.profile.record, { runs: 0, sent: 0, replies: 0, wins: 0 });
    assert.deepEqual(body.profile.learned, []);
    assert.deepEqual(body.profile.ready, []);
    assert.deepEqual(body.profile.stillFiguring, []);
  });

  it("surfaces a ready lesson, a still-figuring one, and the real name", async () => {
    makeReady("lead with their trigger");
    // A single correction is not yet ready — it should read as "still figuring out".
    store.record(PROJECT, REF, { text: "keep it under three sentences", taskId: "solo" });

    const { status, body } = await call("GET", `/api/projects/${PROJECT}/crew/${REF}/profile`);
    assert.equal(status, 200);
    assert.ok(body.profile.name, "a born teammate carries its regular name");
    assert.equal(body.profile.ready.length, 1);
    assert.equal(body.profile.ready[0].text, "lead with their trigger");
    assert.ok(body.profile.ready[0].patternKey, "ready carries an opaque handle for the blessing");
    assert.equal(body.profile.stillFiguring.length, 1);
    assert.equal(body.profile.stillFiguring[0].text, "keep it under three sentences");
    assert.deepEqual(body.profile.learned, []);
  });

  it("promote via the route makes the lesson permanent and round-trips", async () => {
    const key = patternKeyFor("lead with their trigger");
    const { status, body } = await call("POST", `/api/projects/${PROJECT}/crew/${REF}/promote`, { patternKey: key });
    assert.equal(status, 200);
    assert.equal(body.profile.learned.length, 1);
    assert.equal(body.profile.learned[0].text, "lead with their trigger");
    // No longer pending on the founder.
    assert.deepEqual(body.profile.ready, []);
    // And it sticks on a fresh read.
    const again = await call("GET", `/api/projects/${PROJECT}/crew/${REF}/profile`);
    assert.equal(again.body.profile.learned.length, 1);
  });

  it("dismiss via the route sets a ready lesson aside and round-trips", async () => {
    makeReady("mention the case study", "cs");
    const key = patternKeyFor("mention the case study");
    // It's ready before the founder decides.
    const before = await call("GET", `/api/projects/${PROJECT}/crew/${REF}/profile`);
    assert.ok(before.body.profile.ready.some((l) => l.patternKey === key));

    const { status, body } = await call("POST", `/api/projects/${PROJECT}/crew/${REF}/dismiss`, { patternKey: key });
    assert.equal(status, 200);
    assert.ok(!body.profile.ready.some((l) => l.patternKey === key), "dismissed lesson stops asking to graduate");
    assert.ok(!body.profile.learned.some((l) => l.text === "mention the case study"), "dismiss never promotes");
  });

  it("promote and dismiss reject a missing patternKey", async () => {
    const p = await call("POST", `/api/projects/${PROJECT}/crew/${REF}/promote`, {});
    assert.equal(p.status, 400);
    const d = await call("POST", `/api/projects/${PROJECT}/crew/${REF}/dismiss`, {});
    assert.equal(d.status, 400);
  });
});

describe("crew founder-view route: no machinery ever reaches the founder", () => {
  it("never emits a prompt, a source tag, or soul plumbing on any of the three calls", async () => {
    makeReady("no em-dashes ever", "em");
    const key = patternKeyFor("no em-dashes ever");
    const bodies = [
      (await call("GET", `/api/projects/${PROJECT}/crew/${REF}/profile`)).raw,
      (await call("POST", `/api/projects/${PROJECT}/crew/${REF}/promote`, { patternKey: key })).raw,
      (await call("POST", `/api/projects/${PROJECT}/crew/${REF}/dismiss`, { patternKey: key })).raw,
    ];
    // patternKey is a plain-words handle (never rendered), but a prompt / raw provenance tag / scratch
    // status must never travel to the founder surface at all.
    for (const raw of bodies) {
      for (const banned of ["systemPrompt", "steeringPrompt", "rawPrompt", "\"source\"", "occurrences", "\"status\"", "\"soul\""]) {
        assert.equal(raw.includes(banned), false, `founder-view body leaked machinery: ${banned}\n${raw}`);
      }
    }
  });
});
