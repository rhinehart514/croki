import { test } from "node:test";
import assert from "node:assert/strict";

import { proposeTool, gateToolBirth, isCallable } from "../src/tool-birth.mjs";

const spec = {
  name: "score-lead",
  description: "Deterministic lead scorer crystallized from repeated manual scoring.",
  code: "export function scoreLead(lead) { return lead.signals.length; }",
  test: "assert.equal(scoreLead({ signals: [1,2] }), 2);",
};

test("a proposed tool is born proposed and is NEVER callable", () => {
  const tool = proposeTool(spec);
  assert.equal(tool.status, "proposed");
  assert.equal(tool.provenance, "self-built");
  assert.equal(isCallable(tool), false); // the wall: proposed != callable
});

test("propose throws when name/description/code/test are missing", () => {
  assert.throws(() => proposeTool({ ...spec, name: "" }));
  assert.throws(() => proposeTool({ ...spec, description: undefined }));
  assert.throws(() => proposeTool({ ...spec, code: "" }));
  assert.throws(() => proposeTool({ ...spec, test: "  " }));
});

test("only an explicit approve makes a tool callable", () => {
  const proposed = proposeTool(spec);
  const approved = gateToolBirth(proposed, "approve");
  assert.equal(approved.status, "approved");
  assert.equal(isCallable(approved), true);
  // the original is untouched (reversible, like a graph change)
  assert.equal(proposed.status, "proposed");
  assert.equal(isCallable(proposed), false);
});

test("reject yields a rejected, non-callable tool", () => {
  const rejected = gateToolBirth(proposeTool(spec), { decision: "reject", note: "too narrow" });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.decisionNote, "too narrow");
  assert.equal(isCallable(rejected), false);
});

test("there is no path to a callable tool without an explicit approve", () => {
  // anything that isn't a real decision is refused outright -> no ambiguous live tool
  assert.throws(() => gateToolBirth(proposeTool(spec), "maybe"));
  assert.throws(() => gateToolBirth(proposeTool(spec), {}));
  assert.throws(() => gateToolBirth(proposeTool(spec), "live"));
  // and a freshly proposed tool stays inert
  assert.equal(isCallable(proposeTool(spec)), false);
});

test("founder-shipped provenance is honored", () => {
  const tool = proposeTool({ ...spec, provenance: "founder-shipped" });
  assert.equal(tool.provenance, "founder-shipped");
  assert.equal(tool.status, "proposed"); // even founder-shipped is born proposed
});
