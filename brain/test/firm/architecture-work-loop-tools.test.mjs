import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ARCHITECTURE_OPERATIONS } from "../../src/firm/architecture.mjs";
import { THEORY_OPERATIONS } from "../../src/firm/architecture-proposals.mjs";
import { buildArchitectureWorkLoopTools } from "../../src/firm/architecture-work-loop-tools.mjs";

// Regression: a driving teammate learns a proposal tool's operation vocabulary only from its
// input_schema. When the operation items were a bare `{ type: "object" }` the `op` enum was invisible,
// so the teammate guessed values ("assert", "note", "observe", …) and every call was rejected as an
// "Unsupported working-theory operation" — a hard, silent blocker. The schema must expose exactly the
// `op` values the validator enforces, and must stay in sync with that vocabulary.
describe("architecture work-loop tool schemas expose their operation vocabulary", () => {
  const tools = buildArchitectureWorkLoopTools({});
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  it("record_working_theory declares the exact working-theory op enum the validator accepts", () => {
    const items = byName.get("record_working_theory").input_schema.properties.operations.items;
    assert.deepEqual(items.properties.op.enum.slice().sort(), [...THEORY_OPERATIONS].sort());
    assert.deepEqual(items.required, ["op", "id"]);
  });

  it("propose_architecture_change declares the exact architecture op enum the validator accepts", () => {
    const items = byName.get("propose_architecture_change").input_schema.properties.operations.items;
    assert.deepEqual(items.properties.op.enum.slice().sort(), [...ARCHITECTURE_OPERATIONS].slice().sort());
  });
});
