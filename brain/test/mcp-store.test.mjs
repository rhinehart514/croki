import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  effectiveClass, getServer, listServers, reclassifyTool, recordServer, removeServer, serverView,
} from "../src/mcp-store.mjs";

const clayTools = [
  { name: "find_companies" }, { name: "search_people" }, { name: "get_table" },
  { name: "enrich_table" }, { name: "update_record" }, { name: "push_to_crm" },
  { name: "send_to_webhook" }, { name: "xyzzy_op" }, // unknown → gated default
];

describe("mcp capability store", () => {
  let parent, options;
  beforeEach(() => { parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-cap-")); options = { root: parent }; });
  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("records a server and classifies its tools into lanes", () => {
    recordServer({ id: "clay", name: "Clay", url: "mcp.clay.com", trust: "verified", tools: clayTools }, options);
    const view = serverView(getServer("clay", options));
    assert.equal(view.read.length, 3);
    assert.equal(view.write.length, 5);
    assert.equal(view.defaultedCount, 1); // only xyzzy_op
    assert.equal(view.trust, "verified");
  });

  it("persists across load and lists by name", () => {
    recordServer({ id: "clay", name: "Clay", tools: clayTools }, options);
    recordServer({ id: "drive", name: "Drive", tools: [{ name: "get_file" }] }, options);
    const all = listServers(options);
    assert.deepEqual(all.map((s) => s.name), ["Clay", "Drive"]);
  });

  it("moves a write tool to the free lane only as a recorded override (loosening the wall)", () => {
    recordServer({ id: "clay", name: "Clay", trust: "verified", tools: clayTools }, options);
    const { loosenedWall } = reclassifyTool("clay", "update_record", "read", options);
    assert.equal(loosenedWall, true);
    const view = serverView(getServer("clay", options));
    assert.ok(view.read.some((t) => t.name === "update_record"), "now runs free");
    assert.equal(view.overrideCount, 1);
    // the machine verdict is preserved underneath the override
    const raw = getServer("clay", options).tools.find((t) => t.name === "update_record");
    assert.equal(raw.class, "write");
    assert.equal(raw.override, "read");
    assert.equal(effectiveClass(raw), "read");
  });

  it("clearing an override back to the machine lane drops the override", () => {
    recordServer({ id: "clay", name: "Clay", trust: "verified", tools: clayTools }, options);
    reclassifyTool("clay", "update_record", "read", options);
    reclassifyTool("clay", "update_record", "write", options); // back to machine class
    const raw = getServer("clay", options).tools.find((t) => t.name === "update_record");
    assert.equal(raw.override, null);
  });

  it("preserves a founder override across a re-scan of the same server", () => {
    recordServer({ id: "clay", name: "Clay", trust: "verified", tools: clayTools }, options);
    reclassifyTool("clay", "update_record", "read", options);
    recordServer({ id: "clay", name: "Clay", trust: "verified", tools: clayTools }, options); // re-scan
    const raw = getServer("clay", options).tools.find((t) => t.name === "update_record");
    assert.equal(raw.override, "read", "override survives re-discovery");
  });

  it("quarantines an untrusted server — every tool hard-gated, no loosening", () => {
    recordServer({ id: "anon", name: "clay-enrich-plus", trust: "untrusted", tools: clayTools }, options);
    const view = serverView(getServer("anon", options));
    assert.equal(view.read.length, 0, "nothing from an untrusted server runs free");
    assert.equal(view.write.length, clayTools.length);
    assert.throws(() => reclassifyTool("anon", "get_table", "read", options), /untrusted/);
  });

  it("removes a server", () => {
    recordServer({ id: "clay", name: "Clay", tools: clayTools }, options);
    removeServer("clay", options);
    assert.equal(getServer("clay", options), null);
    assert.equal(listServers(options).length, 0);
  });

  it("rejects a bad lane", () => {
    recordServer({ id: "clay", name: "Clay", tools: clayTools }, options);
    assert.throws(() => reclassifyTool("clay", "get_table", "sideways", options), /must be/);
  });
});
