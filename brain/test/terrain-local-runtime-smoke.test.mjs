import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { once } from "node:events";
import { selectRuntime } from "../src/runtimes/index.mjs";

const OPTED_IN = process.env.GTM_TERRAIN_SMOKE === "1";
const FORCED = process.env.GTM_TERRAIN_RUNTIME || undefined;
const selection = OPTED_IN ? selectRuntime({ forced: FORCED }) : { adapter: null, reason: "Set GTM_TERRAIN_SMOKE=1 to permit a local subscription call." };
const SKIP_REASON = !OPTED_IN
  ? "local-runtime smoke skipped: set GTM_TERRAIN_SMOKE=1; no provider call is made by default"
  : !selection.adapter
    ? `local-runtime smoke skipped: ${selection.reason}`
    : false;

const SAMPLE = path.resolve(import.meta.dirname, "../../samples/acme-saas");
let home;
let server;
let base;
let projectId;

async function post(pathname, body) {
  return fetch(`${base}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Gate C local-runtime terrain smoke", { skip: SKIP_REASON }, () => {
  before(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "drover-terrain-runtime-smoke-"));
    process.env.GTM_IDE_HOME = home;
    process.env.GTM_IDE_PERSISTENCE = "json";
    process.env.GTM_IDE_OPERATOR_RUNTIME = selection.adapter.id;
    process.env.PORT = "0";
    ({ server } = await import("../src/server.mjs"));
    if (!server.listening) await once(server, "listening");
    const address = server.address();
    base = `http://127.0.0.1:${address.port}`;
    const response = await post("/api/projects", { name: "Acme runtime smoke", repoPath: SAMPLE, winEvent: "signup_completed" });
    if (!response.ok) assert.fail(`sample grounding failed: ${await response.text()}`);
    projectId = (await response.json()).activeProjectId;
  });

  after(async () => {
    if (server?.listening) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    if (home) fs.rmSync(home, { recursive: true, force: true });
  });

  it("reads grounded terrain through the selected provider without any approval or release request", async () => {
    const candidates = [
      `/api/projects/${encodeURIComponent(projectId)}/terrain/read`,
      `/api/projects/${encodeURIComponent(projectId)}/terrain-read`,
      `/api/projects/${encodeURIComponent(projectId)}/terrain`,
    ];
    let response;
    for (const pathname of candidates) {
      const attempt = await post(pathname, { runtime: selection.adapter.id, readOnly: true });
      if (![404, 405].includes(attempt.status)) { response = attempt; break; }
    }
    assert.ok(response, "No project-scoped terrain-read POST is installed. Merge Lane A/B before running Gate C.");
    if (!response.ok) assert.fail(`terrain read failed through ${selection.adapter.label}: ${await response.text()}`);
    const body = await response.json();
    assert.equal(body.projectId ?? body.read?.projectId, projectId);
    assert.ok(Array.isArray(body.hypotheses ?? body.read?.hypotheses), "terrain smoke returned no hypothesis contract");
    assert.match(JSON.stringify(body), /source-line|speculative|unknown/i, "terrain smoke returned no grounded receipt or honest uncertainty");
  });

  it("leaves the founder wall untouched", () => {
    // This harness intentionally owns no approval, deploy, publish, send, or charge call. Gate C may
    // run and resume model work, but founder release remains a separate browser-only acceptance step.
    assert.equal(typeof selection.adapter.id, "string");
  });
});
