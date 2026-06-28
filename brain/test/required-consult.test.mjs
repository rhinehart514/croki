import { test } from "node:test";
import assert from "node:assert/strict";

import {
  wasConsulted,
  assertMoatConsulted,
  MOAT_TOOLS,
} from "../src/consult-guard.mjs";

// ─── wasConsulted — predicate ─────────────────────────────────────────────────

test("wasConsulted returns true when the tool appears in the call list", () => {
  assert.equal(wasConsulted(["get_product", "get_taste", "get_market"], "get_taste"), true);
});

test("wasConsulted returns false when the tool is absent", () => {
  assert.equal(wasConsulted(["get_product", "get_market"], "get_taste"), false);
});

test("wasConsulted returns false on an empty list", () => {
  assert.equal(wasConsulted([], "get_taste"), false);
});

test("wasConsulted returns false on non-array input", () => {
  assert.equal(wasConsulted(null, "get_taste"), false);
  assert.equal(wasConsulted(undefined, "get_taste"), false);
});

// ─── MOAT_TOOLS — canonical names match retrieval-tools surface ───────────────

test("MOAT_TOOLS names are the expected retrieval tool identifiers", () => {
  assert.equal(MOAT_TOOLS.TASTE, "get_taste");
  assert.equal(MOAT_TOOLS.DESIGN, "get_design");
});

// ─── assertMoatConsulted — main rule ─────────────────────────────────────────

test("draft without get_taste is NOT ok", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_product", "get_market"],
    producedDraft: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("get_taste"), "missing must name get_taste");
  assert.match(result.note, /get_taste/);
  assert.match(result.note, /draft/i);
});

test("draft with get_taste is ok", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_taste", "get_market"],
    producedDraft: true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.match(result.note, /taste/i);
});

test("draft with get_taste but missing get_design is ok (design only required for visual)", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_taste"],
    producedDraft: true,
    producedVisual: false,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("visual artifact without get_taste and get_design is NOT ok — both are missing", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_product"],
    producedDraft: false,
    producedVisual: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("get_taste"), "get_taste must be in missing");
  assert.ok(result.missing.includes("get_design"), "get_design must be in missing");
});

test("visual artifact with get_taste but without get_design is NOT ok", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_taste", "get_market"],
    producedDraft: false,
    producedVisual: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("get_design"), "get_design must be in missing");
  assert.ok(!result.missing.includes("get_taste"), "get_taste must NOT be in missing");
});

test("visual artifact with get_taste AND get_design is ok", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_taste", "get_design", "get_product"],
    producedDraft: false,
    producedVisual: true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.match(result.note, /taste.*design|design.*taste/i);
});

test("non-draft, non-visual work is always ok regardless of tool calls", () => {
  // Research, enrichment, discovery, planning — no moat requirement.
  const noTools = assertMoatConsulted({ toolCalls: [], producedDraft: false, producedVisual: false });
  assert.equal(noTools.ok, true);
  assert.deepEqual(noTools.missing, []);

  const someTools = assertMoatConsulted({
    toolCalls: ["get_product", "get_market"],
    producedDraft: false,
    producedVisual: false,
  });
  assert.equal(someTools.ok, true);
});

test("default call (no args) is treated as non-draft work — always ok", () => {
  const result = assertMoatConsulted();
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("producedVisual implies draft-grade requirement — get_taste is still required", () => {
  // producedVisual: true, producedDraft: false — get_taste still required
  const missingTaste = assertMoatConsulted({
    toolCalls: ["get_design"],
    producedVisual: true,
  });
  assert.equal(missingTaste.ok, false);
  assert.ok(missingTaste.missing.includes("get_taste"));
});

test("both producedDraft and producedVisual true requires both moat tools", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_taste"],
    producedDraft: true,
    producedVisual: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("get_design"), "need get_design for visual even when draft is set");
});
