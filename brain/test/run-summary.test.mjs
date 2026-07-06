import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { deriveRunSummary } from "../src/run-summary.mjs";
import { createChannel } from "../src/project-store.mjs";
import { loadFlow, recordFlowRun } from "../src/flow-store.mjs";

// Stage a flow run carrying a gate node with founder-decided items, exactly as flow-store persists it.
function stageRun(graphId, items, options, { runId = "run-1" } = {}) {
  const { graph } = loadFlow(graphId, null, options);
  recordFlowRun(
    graph ?? { id: graphId, name: graphId, nodes: [], edges: [], revision: 0 },
    {
      runId,
      ok: true,
      targetNodeId: null,
      pendingGates: [],
      nodes: { "gate-review": { category: "gate", items } },
    },
    options,
  );
}

describe("run-summary — what happened, honest or nothing", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "run-summary-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("returns null on a fresh project — no run ⇒ nothing to show, never fake zeros", () => {
    assert.equal(deriveRunSummary("default", options), null);
  });

  it("counts what was approved to go out and keeps unmeasured outcomes honestly null", () => {
    const { channel } = createChannel({ name: "Cold DM" }, options);
    stageRun(
      channel.graphId,
      [
        { email: "a@x.com", draft: "note a", approvalStatus: "approved", joinKey: "jk-1" },
        { email: "b@x.com", draft: "note b", approvalStatus: "rejected", joinKey: "jk-2" },
      ],
      options,
    );
    const run = deriveRunSummary("default", options);
    assert.equal(run.sent, 1, "one approved item ⇒ one to go out (the rejected one does not)");
    assert.equal(run.replies, null, "nothing came back ⇒ replies is null, not 0-dressed-up");
    assert.equal(run.calls, null);
    assert.equal(run.paid, null);
    assert.equal(run.revenue, null, "revenue is not tracked at this layer ⇒ honestly null");
    assert.match(run.note, /1 approved to go out/);
  });
});
