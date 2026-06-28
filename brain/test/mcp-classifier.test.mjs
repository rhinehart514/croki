import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyTool, classifyTools, READ_CLASS, WRITE_CLASS } from "../src/mcp-classifier.mjs";

describe("mcp read/write classifier — the wall over arbitrary tools", () => {
  it("classifies clear read verbs as read-class (runs free)", () => {
    for (const name of ["find_companies", "search_people", "get_table", "list_sources", "lookup_domain"]) {
      assert.equal(classifyTool({ name }).class, READ_CLASS, `${name} should run free`);
    }
  });

  it("classifies clear write verbs as write-class (behind the gate)", () => {
    for (const name of ["enrich_table", "update_record", "push_to_crm", "send_to_webhook", "delete_row", "create_deal"]) {
      assert.equal(classifyTool({ name }).class, WRITE_CLASS, `${name} should be gated`);
    }
  });

  it("defaults an unrecognizable tool behind the gate (fail-safe)", () => {
    const r = classifyTool({ name: "frobnicate_widget" });
    assert.equal(r.class, WRITE_CLASS);
    assert.equal(r.source, "default");
  });

  it("treats readOnlyHint as a CLAIM — a write-named tool stays gated despite it", () => {
    const r = classifyTool({ name: "update_record", annotations: { readOnlyHint: true } });
    assert.equal(r.class, WRITE_CLASS, "a mislabeled writer must not slip free");
    assert.match(r.reason, /overrides its read-only claim/);
  });

  it("honors a truthful readOnlyHint when the name carries no write signal", () => {
    const r = classifyTool({ name: "frobnicate", annotations: { readOnlyHint: true } });
    assert.equal(r.class, READ_CLASS);
    assert.equal(r.source, "annotation");
  });

  it("gates anything declared destructive, strongest signal", () => {
    const r = classifyTool({ name: "get_thing", annotations: { destructiveHint: true } });
    assert.equal(r.class, WRITE_CLASS, "destructive beats a read-looking name");
    assert.equal(r.source, "annotation");
  });

  it("handles namespaced and camelCase tool names by lead verb", () => {
    assert.equal(classifyTool({ name: "crm.pushDeal" }).class, WRITE_CLASS);
    assert.equal(classifyTool({ name: "drive.getFile" }).class, READ_CLASS);
    assert.equal(classifyTool({ name: "getRecord" }).class, READ_CLASS);
    assert.equal(classifyTool({ name: "sendEmail" }).class, WRITE_CLASS);
  });

  it("a read-looking tool with a write verb anywhere is still gated", () => {
    // "export" is a write verb; "get_and_export" must gate.
    assert.equal(classifyTool({ name: "get_and_export_list" }).class, WRITE_CLASS);
  });

  it("splits a Clay-like toolset into the two lanes with a defaulted count", () => {
    const tools = [
      { name: "find_companies" }, { name: "search_people" }, { name: "get_table" },
      { name: "enrich_table" }, { name: "update_record" }, { name: "push_to_crm" },
      { name: "send_to_webhook" },
      { name: "run_recipe" }, { name: "trigger_workflow" }, // unknown→write
    ];
    const { read, write, defaulted } = classifyTools(tools);
    assert.equal(read.length, 3);
    assert.equal(write.length, 6);
    // run_recipe (run) and trigger_workflow (trigger) are write VERBS, not defaults
    assert.equal(defaulted.length, 0);
  });

  it("a genuinely opaque tool lands in the defaulted set, gated", () => {
    const { write, defaulted } = classifyTools([{ name: "xyzzy" }, { name: "get_x" }]);
    assert.equal(defaulted.length, 1);
    assert.equal(defaulted[0].name, "xyzzy");
    assert.ok(write.some((t) => t.name === "xyzzy"));
  });

  it("never throws on malformed input", () => {
    assert.equal(classifyTool({}).class, WRITE_CLASS);
    assert.equal(classifyTool({ name: "" }).class, WRITE_CLASS);
    assert.equal(classifyTool(null).class, WRITE_CLASS);
  });
});
