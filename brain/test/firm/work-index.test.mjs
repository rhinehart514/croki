import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test, { describe, it } from "node:test";

import { projectWorkIndex } from "../../src/firm/work-index.mjs";
import { founderHeaders } from "../helpers/founder-capability.mjs";

function thread(id, name = `Direction ${id}`, extra = {}) {
  return {
    id,
    name,
    messageRefs: [],
    subjectRefs: [],
    participantRefs: [],
    parentThreadRef: "thread:venture-root",
    lifecycle: "open",
    reviewedThrough: null,
    properties: {},
    createdAt: "2026-07-18T10:00:00.000Z",
    updatedAt: "2026-07-18T10:00:00.000Z",
    ...extra,
  };
}

function run(id, threadId, extra = {}) {
  return {
    id,
    threadRef: `thread:${threadId}`,
    betRefs: [], eventRefs: [], workRefs: [], decisionRefs: [], outcomeRefs: [], scopeRefs: [], participantRefs: [],
    properties: {}, modelRevision: null,
    createdAt: "2026-07-18T10:01:00.000Z",
    completedAt: "2026-07-18T10:02:00.000Z",
    ...extra,
  };
}

function receipt(runId, kind, at = "2026-07-18T10:03:00.000Z") {
  return { id: `receipt-${runId}`, runRef: `run:${runId}`, terminal: { kind, at, summary: `${kind} result` }, createdAt: at };
}

function model({ threads = [], runs = [], objects = [], relationships = [], revision = 1 } = {}) {
  return { revision, threads, runs, objects, relationships, compatibility: { architecture: { revision } } };
}

describe("production work-index projection", () => {
  it("has an honest empty state and identifies legacy root runs instead of inventing rows", () => {
    const legacyRun = run("legacy", "venture-root");
    const index = projectWorkIndex({ ventureId: "venture-a", model: model({ runs: [legacyRun] }) });
    assert.deepEqual(index.items, []);
    assert.deepEqual(index.counts, { total: 0, attention: 0, active: 0, unread: 0 });
    assert.equal(index.legacy.unindexedRunCount, 1);
  });

  it("keeps lifecycle, activity, attention, terminal, and unread as independent facets", () => {
    const threads = [
      thread("decision", "Approve the launch"),
      thread("failure", "Repair the provider"),
      thread("active", "Interview the market"),
      thread("reviewed", "Read the result", { lifecycle: "closed", reviewedThrough: "run:r-reviewed#terminal" }),
    ];
    const runs = [
      run("r-decision-old", "decision", {
        decisionRefs: ["decision:wall-1"],
        createdAt: "2026-07-18T09:00:00.000Z",
        completedAt: "2026-07-18T09:01:00.000Z",
      }),
      run("r-decision", "decision"),
      run("r-failure", "failure", { completedAt: null }),
      run("r-active", "active", { completedAt: null }),
      run("r-reviewed", "reviewed"),
    ];
    const index = projectWorkIndex({
      ventureId: "venture-a",
      model: model({ threads, runs }),
      activeDrives: [{ id: "r-active", startedAt: "2026-07-18T10:04:00.000Z", abortRequestedAt: "2026-07-18T10:05:00.000Z" }],
      receipts: [receipt("r-decision", "completed"), receipt("r-reviewed", "completed")],
      decisions: [{ id: "wall-1", decision: null, createdAt: "2026-07-18T10:03:30.000Z" }],
    });

    assert.deepEqual(index.items.map((item) => item.attention), ["decision", "failure", "none", "none"]);
    assert.equal(index.items[0].latestMeaningfulEvent.ref, "decision:wall-1");
    const failure = index.items.find((item) => item.threadRef === "thread:failure");
    assert.equal(failure.terminal, "interrupted");
    assert.equal(failure.activity, "idle");
    const active = index.items.find((item) => item.threadRef === "thread:active");
    assert.equal(active.activity, "stopping");
    assert.equal(active.terminal, null);
    const reviewed = index.items.find((item) => item.threadRef === "thread:reviewed");
    assert.equal(reviewed.lifecycle, "closed");
    assert.equal(reviewed.unread, false);
    assert.equal(reviewed.attention, "none");
  });

  it("preserves every production terminal kind and derives missing settlement as interrupted", () => {
    const kinds = ["completed", "failed", "cancelled", "paused", "budget-exhausted"];
    const threads = [...kinds, "interrupted"].map((kind) => thread(kind));
    const runs = [...kinds, "interrupted"].map((kind) => run(`run-${kind}`, kind));
    const receipts = kinds.map((kind) => receipt(`run-${kind}`, kind));
    const index = projectWorkIndex({ ventureId: "venture-a", model: model({ threads, runs }), receipts });
    for (const kind of kinds) assert.equal(index.items.find((item) => item.threadRef === `thread:${kind}`).terminal, kind);
    assert.equal(index.items.find((item) => item.threadRef === "thread:interrupted").terminal, "interrupted");
  });

  it("stays deterministic at 200 rows and never truncates the founder's durable intent", () => {
    const longIntent = "A precise founder direction ".repeat(20).trim();
    const threads = Array.from({ length: 200 }, (_, index) => thread(`t-${String(index).padStart(3, "0")}`, index === 0 ? longIntent : undefined, {
      createdAt: `2026-07-18T10:${String(index % 60).padStart(2, "0")}:00.000Z`,
      updatedAt: `2026-07-18T10:${String(index % 60).padStart(2, "0")}:00.000Z`,
    }));
    const index = projectWorkIndex({ ventureId: "venture-scale", model: model({ threads }) });
    assert.equal(index.items.length, 200);
    assert.equal(index.counts.unread, 200);
    assert.equal(index.items.find((item) => item.threadRef === "thread:t-000").founderIntent, longIntent);
    assert.deepEqual(index.items.map((item) => item.threadRef), [...index.items.map((item) => item.threadRef)].sort((a, b) => {
      const left = threads.find((entry) => `thread:${entry.id}` === a);
      const right = threads.find((entry) => `thread:${entry.id}` === b);
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || a.localeCompare(b);
    }));
  });

  it("projects Product/GTM objects and nests each thought under the canonical subjects it changes", () => {
    const objects = [
      { id: "onboarding", type: "experience", name: "Onboarding", statement: "Reach first value quickly.", properties: { architecture: { role: "product-loop" } }, assertion: "founder-asserted" },
      { id: "buyers", type: "audience", name: "First buyers", statement: "The narrow reachable segment.", properties: { territory: "gtm", architecture: { role: "concept" } }, assertion: "tentative" },
    ];
    const threads = [
      thread("product-thought", "Remove setup", { subjectRefs: ["architecture:onboarding"] }),
      thread("gtm-thought", "Interview operators", { subjectRefs: ["object:buyers"] }),
      thread("unplaced", "Think about the venture"),
    ];
    const relationships = [{
      id: "need-to-experience", fromRef: "object:buyers", toRef: "object:onboarding",
      label: "needs", type: "needs", assertion: "founder-asserted", sourceRefs: ["repository:proof"],
    }];
    const index = projectWorkIndex({ ventureId: "venture-a", model: model({ objects, relationships, threads, revision: 7 }) });

    assert.equal(index.outline.architectureRevision, 7);
    assert.deepEqual(index.outline.objects.map((object) => [object.id, object.territory, object.sectionId]), [
      ["onboarding", "product", "experiences"],
      ["buyers", "gtm", "audiences"],
    ]);
    assert.deepEqual(index.outline.objects[0].threadRefs, ["thread:product-thought"]);
    assert.deepEqual(index.outline.objects[1].threadRefs, ["thread:gtm-thought"]);
    assert.deepEqual(index.outline.relationships, [relationships[0]]);
    assert.deepEqual(index.outline.unplacedThreadRefs, ["thread:unplaced"]);
  });
});

const routeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "drover-work-index-routes-"));
process.env.GTM_IDE_HOME = routeRoot;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: workIndexRoutes } = await import("../../src/firm/work-index-routes.mjs");
const { driveTeammate } = await import("../../src/firm/work-loop.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");

async function call(method, pathname, body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { "content-type": "application/json", ...founderHeaders({ method, path: pathname }), ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const handled = await workIndexRoutes({ req, res, url: new URL(pathname, "http://local") });
  assert.equal(handled, true);
  return { status, body: raw ? JSON.parse(raw) : null };
}

test.after(() => fs.rmSync(routeRoot, { recursive: true, force: true }));

test("work-index route returns child directions and durably advances an exact review cursor", async () => {
  const options = { root: routeRoot, seedFoundingCrew: false };
  const venture = createVenture({ name: "Review cursor" }, options);
  await driveTeammate({
    ventureId: venture.id,
    teammateRef: "founding-teammate",
    goal: "Find the narrow opening",
    initiatedBy: "founder",
    options,
    deps: { runtime: { id: "index-runtime", label: "Index runtime", async drive() { return { kind: "completed", summary: "Opening found" }; } } },
  });

  const first = await call("GET", `/api/ventures/${venture.id}/work-index`);
  assert.equal(first.status, 200);
  assert.equal(first.body.workIndex.items.length, 1);
  const item = first.body.workIndex.items[0];
  assert.equal(item.founderIntent, "Find the narrow opening");
  assert.equal(item.unread, true);

  const threadId = item.threadRef.replace(/^thread:/, "");
  const reviewed = await call("PUT", `/api/ventures/${venture.id}/work-index/${threadId}/reviewed-through`, {
    reviewedThrough: item.latestMeaningfulEvent.ref,
  });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.body.item.unread, false);
  assert.equal(reviewed.body.item.reviewedThrough, item.latestMeaningfulEvent.ref);

  const stale = await call("PUT", `/api/ventures/${venture.id}/work-index/${threadId}/reviewed-through`, {
    reviewedThrough: `${item.threadRef}#stale`,
  });
  assert.equal(stale.status, 409);
});

test("work-index read fails closed for an unknown venture", async () => {
  const response = await call("GET", "/api/ventures/no-such-venture/work-index");
  assert.equal(response.status, 404);
});
