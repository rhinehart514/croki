import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { it } from "node:test";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-model-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: modelRoutes } = await import("../../src/firm/model-routes.mjs");
const { createVenture, setVentureDoc } = await import("../../src/firm/venture-store.mjs");

async function call(method, pathname, body = null, headers = {}) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { "content-type": "application/json", ...founderHeaders({ method, path: pathname }), ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(value) { status = value; }, setHeader() {}, end(value) { raw += value ?? ""; } };
  const handled = await modelRoutes({ req, res, url: new URL(pathname, "http://local") });
  return { handled, status, body: raw ? JSON.parse(raw) : null };
}

it("HTTP model routes keep an agent change provisional until a selective founder merge", async () => {
  const venture = createVenture({ name: "Mutable Product", repository: process.cwd() }, { root });
  setVentureDoc(venture.id, "conversation", "direction", { id: "direction", ventureId: venture.id, role: "founder", content: "Try a service-led offer." }, { root });

  const created = await call("POST", `/api/ventures/${venture.id}/model/branches`, {
    name: "Service-led alternative",
    question: "Should onboarding begin with founder delivery?",
    sourceRefs: ["conversation:direction"],
  });
  assert.equal(created.status, 201);
  const branchId = created.body.branch.id;

  const proposed = await call("POST", `/api/ventures/${venture.id}/model/branches/${branchId}/changes`, {
    targetFamily: "objects",
    operation: "create",
    proposedRecord: { id: "manual-onboarding", type: "experience", name: "Founder onboarding", statement: "The founder delivers the first result manually.", properties: { territory: "both" }, assertion: "tentative" },
    rationale: "Learn the required experience before automating it.",
    sourceRefs: ["conversation:direction"],
  }, { "x-gtm-actor": "agent", "x-gtm-agent": "codex" });
  assert.equal(proposed.status, 201);

  const before = await call("GET", `/api/ventures/${venture.id}/model`);
  assert.equal(before.body.model.objects.some((object) => object.id === "manual-onboarding"), false);

  const merged = await call("POST", `/api/ventures/${venture.id}/model/branches/${branchId}/merge`, {
    selectedChangeRefs: [`model-change:${proposed.body.change.id}`],
    reason: "The manual path is justified.",
    resolvedConflicts: [],
  });
  assert.equal(merged.status, 200);
  assert.equal(merged.body.model.objects.some((object) => object.id === "manual-onboarding"), true);
  assert.equal(merged.body.receipt.selectedChangeRefs.length, 1);
});
