import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-comparisons-route-"));
process.env.GTM_IDE_HOME = HOME;
process.env.GTM_IDE_PERSISTENCE = "json";

const { createProject } = await import("../src/project-store.mjs");
const { branchOperatorSessionForBoth, createOperatorSession } = await import("../src/operator-store.mjs");
const { default: handleOperatorRoute } = await import("../src/routes/operator.mjs");

after(() => fs.rmSync(HOME, { recursive: true, force: true }));

function responseCapture() {
  let status = null;
  let headers = null;
  let payload = null;
  return {
    response: {
      writeHead(nextStatus, nextHeaders) { status = nextStatus; headers = nextHeaders; },
      end(body) { payload = JSON.parse(body); },
    },
    result() { return { status, headers, payload }; },
  };
}

async function readSessions(projectId) {
  const capture = responseCapture();
  const handled = await handleOperatorRoute({
    req: { method: "GET" },
    res: capture.response,
    url: new URL(`/api/operator/sessions${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`, "http://drover.local"),
  });
  assert.equal(handled, true);
  return capture.result();
}

describe("operator comparison read projection route", () => {
  it("returns all durable groups for only the requested project and no decision authority", async () => {
    const a = createProject({ id: "route-comparison-a", name: "A" }).project;
    const b = createProject({ id: "route-comparison-b", name: "B" }).project;
    for (let index = 0; index < 2; index += 1) {
      const parent = createOperatorSession({ goal: `Compare A ${index}`, projectId: a.id });
      branchOperatorSessionForBoth(parent.id, {
        projectId: a.id, expectedRevision: 0, idempotencyKey: `route-a-${index}`,
      });
    }
    const parentB = createOperatorSession({ goal: "Compare B", projectId: b.id });
    branchOperatorSessionForBoth(parentB.id, {
      projectId: b.id, expectedRevision: 0, idempotencyKey: "route-b",
    });

    const { status, headers, payload } = await readSessions(a.id);
    assert.equal(status, 200);
    assert.equal(headers["Cache-Control"], "no-store");
    assert.equal(payload.comparisonGroups.length, 2);
    assert.ok(payload.comparisonGroups.every((group) => group.projectId === a.id));
    assert.ok(payload.comparisonGroups.every((group) => group.branches.length === 2));
    assert.ok(payload.comparisonGroups.flatMap((group) => group.branches).every((branch) => branch.projectId === a.id));
    assert.ok(payload.comparisonGroups.every((group) => !("selectedSessionId" in group) && !("winner" in group)));

    const unscoped = await readSessions();
    assert.deepEqual(unscoped.payload.comparisonGroups, [], "an unscoped list cannot leak cross-project comparisons");
  });
});
