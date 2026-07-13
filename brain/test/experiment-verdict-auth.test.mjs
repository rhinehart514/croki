// experiment-verdict-auth.test.mjs — EXPERIMENT-MACHINE-SPEC rail 2, FIX 3: only the founder can kill.
//
// THE HOLE (Codex review): the experiment-verdict / kill endpoint was UNAUTHENTICATED — a tokenless or
// agent-stamped POST could end an experiment, and belief-writeback trusted a caller-supplied `decidedBy`
// defaulting to "founder". THE FIX: the route is guarded with the SAME two-factor founder check the gate
// uses, and the actor is derived from the authenticated session, never the body.
//
// What this proves:
//   - A tokenless POST to .../verdict is refused (403); the experiment is NOT killed.
//   - An agent-stamped POST is refused even with a cookie.
//   - The authenticated founder browser CAN kill, and the stamp is the derived actor (never body.decidedBy).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-verdict-auth-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: measureRoutes } = await import("../src/routes/measure.mjs");
const { claimFounderSession, founderBootstrapCode } = await import("../src/routes/session-guard.mjs");
const { createProject, loadProject } = await import("../src/project-store.mjs");
const { upsertStatedExperiment } = await import("../src/stated-experiment.mjs");

const { project } = createProject({ id: "verdict-project", name: "Verdict project" }, { root });
upsertStatedExperiment(
  { projectId: project.id, experiment: { id: "exp-kill-me", hypothesis: "A bet worth testing", variable: "message" } },
  { root },
);

function browserCookie() {
  let value = "";
  claimFounderSession({ headers: {} }, { setHeader(_name, next) { value = next; } }, founderBootstrapCode());
  return value.split(";")[0];
}

async function callVerdict(body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = "POST";
  req.headers = { "content-type": "application/json", ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const pathname = `/api/projects/${project.id}/experiments/exp-kill-me/verdict`;
  const handled = await measureRoutes({ req, res, url: new URL(pathname, "http://local") });
  return { handled, status, body: raw ? JSON.parse(raw) : null };
}

function verdictOf() {
  const exp = (loadProject({ root, projectId: project.id }).sharedContext?.experiments ?? []).find((e) => e.id === "exp-kill-me");
  return exp?.verdict ?? null;
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("a tokenless POST cannot kill an experiment", async () => {
  const res = await callVerdict({ verdict: { decision: "kill", decidedBy: "impostor" } });
  assert.equal(res.status, 403, "tokenless verdict is refused");
  assert.equal(verdictOf(), null, "the experiment was NOT killed — no verdict stamped");
});

test("an agent-stamped POST cannot kill an experiment, even with a cookie", async () => {
  const res = await callVerdict(
    { verdict: { decision: "kill" } },
    { cookie: browserCookie(), "x-gtm-actor": "agent" },
  );
  assert.equal(res.status, 403);
  assert.equal(verdictOf(), null, "still not killed");
});

test("the authenticated founder CAN kill — and the actor is derived, not caller-supplied", async () => {
  const res = await callVerdict(
    { verdict: { decision: "kill", decidedBy: "impostor" } },
    { cookie: browserCookie() },
  );
  assert.equal(res.status, 200);
  const v = verdictOf();
  assert.ok(v, "the founder killed the experiment");
  assert.equal(v.decision, "kill");
  assert.notEqual(v.decidedBy, "impostor", "the caller-supplied decidedBy is IGNORED — the actor is derived from the session");
});
