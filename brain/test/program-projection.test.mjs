import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { executeDomainCommand } from "../src/domain-commands.mjs";
import { listDomainEvents } from "../src/domain-events.mjs";
import { createProject, loadProject } from "../src/project-store.mjs";
import { listProductModels } from "../src/product-model-store.mjs";
import { rebuildProjectState } from "../src/program-projection.mjs";

describe("product-model projection — events are the authoritative history", () => {
  let parent;
  let options;
  let project;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-projection-"));
    options = { root: parent };
    createProject({ name: "GTM IDE" }, options);
    project = loadProject(options);
    project.sharedContext.repository = {
      repo: path.join(parent, "repo"),
      outcome: "meeting_booked",
      evidence: [{ label: "win", file: "app.ts", line: 1, text: "analytics.track('meeting_booked')" }],
    };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("rebuilds the ProductModel aggregate purely from events: derive → revise → record-signal", async () => {
    const cmd = (name, input) => executeDomainCommand(name, { ...input, projectId: project.id }, { ...options, projectId: project.id });

    // A fake generator standing in for the rented intelligence — returns the four bags; the host
    // stamps ids/versions/provenance and demotes the evidence-free "derived" guess.
    const generate = async () => ({
      ok: true,
      meta: { blank: false },
      model: {
        things: [
          { name: "Project", kind: "entity", summary: "A work record", provenance: "derived", evidence: [{ label: "win", file: "app.ts", line: 1, text: "track('project_created')" }] },
          { name: "Operator", kind: "actor", summary: "Who runs it", provenance: "derived", evidence: [] }, // demoted to speculative
        ],
        relationships: [{ from: "Operator", to: "Project", label: "creates", provenance: "speculative" }],
        userGoals: [{ actor: "Operator", goal: "ship faster", provenance: "speculative" }],
        states: [{ thingId: "Project", name: "draft", provenance: "speculative" }],
      },
    });

    const derived = await executeDomainCommand("DeriveProductModel", { projectId: project.id, grounding: {} }, { ...options, projectId: project.id, generate });
    assert.equal(derived.version, 1);
    assert.equal(derived.generatedBy, "claude");
    assert.equal(derived.things.length, 2);
    assert.equal(derived.things.find((t) => t.name === "Operator").provenance, "speculative");

    const revised = await cmd("ReviseProductModel", {
      modelId: derived.id,
      things: [
        { name: "Project", kind: "entity", summary: "A work record (edited)", provenance: "derived", evidence: [{ label: "win", file: "app.ts", line: 1, text: "track('project_created')" }] },
      ],
    });
    assert.equal(revised.id, derived.id);
    assert.equal(revised.version, 2);
    assert.equal(revised.previousModelId, derived.id);
    assert.equal(revised.lineageId, derived.lineageId);

    const pinned = await cmd("RecordProductSignal", {
      modelId: derived.id,
      signalId: "signal-real-customer",
      target: { kind: "thing", id: "thing-project" },
      type: "ObservedOutcome",
      summary: "A real operator created a project",
    });
    assert.equal(pinned.pinnedSignals.length, 1);
    assert.equal(pinned.pinnedSignals[0].signalId, "signal-real-customer");

    // ── The reconciliation: rebuild purely from events, compare to the stored snapshot ──
    const rebuilt = rebuildProjectState(project.id, { ...options, projectId: project.id });
    const stored = listProductModels(project.id, { ...options, projectId: project.id });
    assert.equal(stored.length, 1);
    assert.equal(rebuilt.productModels.length, 1);
    assert.deepEqual(rebuilt.productModels, stored);

    // The terminal model reflects the revision (version 2) AND the pinned signal survives rebuild.
    const rebuiltModel = rebuilt.productModels[0];
    assert.equal(rebuiltModel.version, 2);
    assert.equal(rebuiltModel.things.length, 1);
    assert.equal(rebuiltModel.pinnedSignals.length, 1);
    assert.equal(rebuiltModel.pinnedSignals[0].signalId, "signal-real-customer");

    // The event log carries all three product-model event types.
    const events = listDomainEvents(project.id, { ...options, projectId: project.id });
    const types = new Set(events.map((e) => e.type));
    for (const required of ["ProductModelDerived", "ProductModelRevised", "ProductSignalRecorded"]) {
      assert.ok(types.has(required), `missing event: ${required}`);
    }
  });
});
