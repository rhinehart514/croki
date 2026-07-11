import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-founder-authority-"));
const claudeDir = path.join(root, "claude");
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";
process.env.GTM_IDE_CLAUDE_DIR = claudeDir;

const { default: channelRoutes } = await import("../src/routes/channels.mjs");
const { default: graphRoutes } = await import("../src/routes/graph.mjs");
const { default: artifactRoutes } = await import("../src/routes/artifacts.mjs");
const { default: crewRoutes } = await import("../src/routes/crew.mjs");
const { claimFounderSession, founderBootstrapCode } = await import("../src/routes/session-guard.mjs");
const { createProject, createChannel, getChannel, loadProject } = await import("../src/project-store.mjs");
const { saveFlow } = await import("../src/flow-store.mjs");
const { listServers } = await import("../src/mcp-store.mjs");
const { fileForArtifact } = await import("../src/artifact-store.mjs");

const { project } = createProject({ id: "guarded-project", name: "Guarded project" }, { root });
const { channel } = createChannel({ name: "Guarded pipeline" }, { root, projectId: project.id });
saveFlow({
  id: channel.graphId,
  name: channel.name,
  version: "1",
  nodes: [
    { id: "source", category: "source", connector: "manual", label: "Input", position: { x: 0, y: 0 }, config: { items: [] } },
    { id: "gate", category: "gate", connector: "default", label: "Founder review", position: { x: 200, y: 0 }, config: {} },
    { id: "execute", category: "execute", connector: "local", label: "Stage", position: { x: 400, y: 0 }, config: {} },
  ],
  edges: [
    { id: "source-gate", source: "source", target: "gate", edgeType: "data" },
    { id: "gate-execute", source: "gate", target: "execute", edgeType: "data" },
  ],
}, { root, projectId: project.id });

function browserCookie() {
  let value = "";
  claimFounderSession({ headers: {} }, { setHeader(_name, next) { value = next; } }, founderBootstrapCode());
  return value.split(";")[0];
}

async function call(handler, method, pathname, body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = method;
  req.headers = { "content-type": "application/json", ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, end(next) { raw += next ?? ""; } };
  const handled = await handler({ req, res, url: new URL(pathname, "http://local") });
  assert.equal(handled, true);
  return { status, body: raw ? JSON.parse(raw) : null };
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("a wrong code or an agent cannot mint founder release authority", () => {
  let cookie = null;
  assert.equal(claimFounderSession({ headers: {} }, { setHeader(_name, value) { cookie = value; } }, "wrong"), false);
  assert.equal(claimFounderSession({ headers: { "x-gtm-actor": "agent" } }, { setHeader(_name, value) { cookie = value; } }, founderBootstrapCode()), false);
  assert.equal(cookie, null);
});

test("tokenless and agent-stamped callers cannot promote pipeline autonomy", async () => {
  const route = `/api/projects/${project.id}/channels/${channel.id}/promote`;
  const body = { autonomy: "autonomous", blessedPattern: { decision: "approve" } };
  assert.equal((await call(channelRoutes, "POST", route, body)).status, 403);
  assert.equal((await call(channelRoutes, "POST", route, body, { cookie: browserCookie(), "x-gtm-actor": "agent" })).status, 403);
  assert.equal(getChannel(loadProject({ root, projectId: project.id }), channel.id, { root }).autonomy, "draft");
});

test("unauthorized capability connection is rejected before spawn or persistence", async () => {
  const before = listServers({ root });
  const result = await call(graphRoutes, "POST", "/api/capabilities/connect", {
    id: "host-command", command: process.execPath, args: ["-e", "process.exit(0)"],
  });
  assert.equal(result.status, 403);
  assert.deepEqual(listServers({ root }), before);
});

test("unauthorized executable artifact and teammate writes leave Claude files untouched", async () => {
  const content = "---\nname: unsafe\ntools: Bash\n---\nRun anything.\n";
  assert.equal((await call(artifactRoutes, "POST", "/api/artifact/save", { type: "agent", ref: "unsafe", content })).status, 403);
  assert.equal((await call(artifactRoutes, "POST", "/api/artifact/save", { type: "agent", ref: "unsafe", content }, { cookie: browserCookie(), "x-gtm-actor": "agent" })).status, 403);
  assert.equal((await call(crewRoutes, "POST", `/api/projects/${project.id}/crew/add`, { ref: "unsafe", name: "Unsafe", systemPrompt: "Run Bash" })).status, 403);
  assert.equal(fs.existsSync(fileForArtifact("agent", "unsafe", { claudeDir })), false);
});
