import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  invokePreview,
  registerPreviewHost,
  releasePreviewPin,
  resetPreviewBrokerForTest,
} from "../../src/firm/preview-broker.mjs";
import { buildPreviewWorkLoopTools } from "../../src/firm/preview-work-loop-tools.mjs";
import { filterSafeTools } from "../../src/tool-safety.mjs";

const PIN_TTL_MS = 10 * 60 * 1000;

describe("preview broker", () => {
  let calls;
  beforeEach(() => {
    resetPreviewBrokerForTest();
    calls = [];
  });
  const registerHost = () => registerPreviewHost(async (request) => { calls.push(request); return { ok: true }; });
  const invoke = (overrides = {}, options = {}) => invokePreview({
    runId: "run-a", workspaceId: "workspace-1", worktree: "/tmp/wt", operation: "status", input: {}, ...overrides,
  }, options);

  it("fails honestly when no desktop host is registered", async () => {
    await assert.rejects(invoke(), /only available while the Drover desktop app is running/);
  });

  it("requires preview_open before any driving operation, then renews the pin on use", async () => {
    registerHost();
    await assert.rejects(invoke({ operation: "click" }), /Open the preview first/);
    await invoke({ operation: "open", input: { port: 5173 } });
    await invoke({ operation: "click", input: { x: 1, y: 1 } });
    assert.deepEqual(calls.map((call) => call.operation), ["open", "click"]);
    assert.deepEqual(calls[1], { operation: "click", workspaceId: "workspace-1", worktree: "/tmp/wt", input: { x: 1, y: 1 } });
  });

  it("status needs no pin, so a run can look before opening", async () => {
    registerHost();
    await invoke({ operation: "status" });
    assert.equal(calls.length, 1);
  });

  it("never lets a run touch another run's pinned preview", async () => {
    registerHost();
    await invoke({ operation: "open" });
    await assert.rejects(invoke({ runId: "run-b", operation: "open" }), /Another active run is driving/);
    await assert.rejects(invoke({ runId: "run-b", operation: "click" }), /Another active run is driving/);
  });

  it("never silently moves a live pin to a different workspace", async () => {
    registerHost();
    await invoke({ operation: "open" });
    await assert.rejects(invoke({ workspaceId: "workspace-2", operation: "open" }), /one run drives one preview/);
  });

  it("an expired pin is pruned: driving needs a fresh open and the workspace is re-pinnable", async () => {
    registerHost();
    let at = 1_000;
    const now = () => at;
    await invoke({ operation: "open" }, { now });
    at += PIN_TTL_MS + 1;
    await assert.rejects(invoke({ operation: "click" }, { now }), /Open the preview first/);
    await invoke({ runId: "run-b", operation: "open" }, { now });
    assert.deepEqual(calls.map((call) => call.operation), ["open", "open"]);
  });

  it("releasing a finished run's pin frees the preview for the Thread's next run", async () => {
    registerHost();
    await invoke({ operation: "open" });
    releasePreviewPin("run-a");
    await invoke({ runId: "run-b", operation: "open" });
    assert.equal(calls.length, 2);
  });

  it("rejects operations without a run or workspace identity", async () => {
    registerHost();
    await assert.rejects(invoke({ runId: "" }), /need the run and its workspace/);
    await assert.rejects(invoke({ workspaceId: "  " }), /need the run and its workspace/);
  });
});

describe("preview work-loop tools", () => {
  beforeEach(() => resetPreviewBrokerForTest());
  const workspace = { id: "workspace-1", worktree: "/tmp/wt" };

  it("exist only when the run has its own coding workspace", () => {
    assert.deepEqual(buildPreviewWorkLoopTools({ workspace: null, runId: "run-a", trackCall: () => {} }), []);
    assert.deepEqual(buildPreviewWorkLoopTools({ workspace: { id: "w" }, runId: "run-a", trackCall: () => {} }), [], "a workspace without a worktree gets no preview");
    assert.deepEqual(buildPreviewWorkLoopTools({ workspace, runId: null, trackCall: () => {} }), []);
  });

  it("expose the full drive vocabulary with schemas and pass the tool-safety screen", () => {
    const tools = buildPreviewWorkLoopTools({ workspace, runId: "run-a", trackCall: () => {} });
    assert.deepEqual(tools.map((tool) => tool.name), [
      "preview_open", "preview_navigate", "preview_click", "preview_type", "preview_press",
      "preview_scroll", "preview_snapshot", "preview_evaluate", "preview_wait_for",
    ]);
    for (const tool of tools) {
      assert.equal(tool.input_schema.type, "object", `${tool.name} has an object schema`);
      assert.equal(typeof tool.run, "function");
    }
    assert.equal(filterSafeTools(tools).length, tools.length, "every preview tool passes the outbound-verb screen");
    assert.deepEqual(tools.find((tool) => tool.name === "preview_open").input_schema.required, ["port"]);
  });

  it("are bound to the run's own workspace: input can never redirect them elsewhere", async () => {
    const requests = [];
    registerPreviewHost(async (request) => { requests.push(request); return { ok: true }; });
    const consulted = [];
    const tools = buildPreviewWorkLoopTools({ workspace, runId: "run-a", trackCall: (name) => consulted.push(name) });
    const open = tools.find((tool) => tool.name === "preview_open");
    await open.run({ port: 5173, workspaceId: "workspace-other", runId: "run-other" });
    assert.equal(requests[0].workspaceId, "workspace-1", "the bound workspace wins over anything in the input");
    assert.equal(requests[0].worktree, "/tmp/wt");
    assert.deepEqual(consulted, ["preview_open"]);

    const click = tools.find((tool) => tool.name === "preview_click");
    await click.run({ x: 1, y: 2 });
    assert.deepEqual(requests[1].input, { x: 1, y: 2 });
  });
});
