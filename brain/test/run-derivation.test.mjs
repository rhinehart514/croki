import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { recordRunDerivations } from "../src/run-derivation.mjs";
import { loadProject } from "../src/project-store.mjs";
import { listPeople } from "../src/person-store.mjs";
import { loadFeedbackLedger } from "../src/feedback-ledger.mjs";

describe("recordRunDerivations — one seam for all three run-completion derivers", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-runderiv-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  const graph = {
    id: "cold-outbound",
    name: "Cold outbound",
    objective: "Get 5 pilot conversations",
    nodes: [
      { id: "src", category: "source", label: "Founder list" },
      { id: "draft", kind: "agent", label: "Draft opener" },
      { id: "gate", category: "gate", label: "Founder review" },
    ],
  };

  it("fires the feedback ledger, People promotion, and experiment derivation in one call", () => {
    const result = {
      graphId: "cold-outbound",
      runId: "run-1",
      pendingGates: [],
      nodes: {
        gate: {
          category: "gate",
          items: [
            { id: "a", name: "Jane Roe", email: "jane@acme.com", approvalStatus: "approved", draft: "Hi Jane, saw your launch." },
            { id: "b", name: "John Doe", email: "john@globex.com", approvalStatus: "rejected", draft: "Hello there." },
          ],
        },
      },
    };

    const out = recordRunDerivations({ projectId: "default", graph, result }, options);

    // Feedback: the approval and rejection banked as taste signals.
    assert.ok(out.feedback, "feedback result returned");
    assert.ok(Array.isArray(out.feedback.signals), "feedback carries signals");
    const ledger = loadFeedbackLedger("default", options);
    assert.ok(ledger.signals.some((s) => s.type === "FounderApproval"), "approval banked in the ledger");

    // People: both gate entrants promoted into durable identities.
    assert.equal(out.promotion.peopleCount, 2);
    const people = listPeople("default", options);
    assert.equal(people.length, 2);

    // Experiment: one live hypothesis derived for the channel.
    assert.equal(out.experiment.id, "exp-cold-outbound");
    const project = loadProject(options);
    assert.ok(project.sharedContext.experiments.some((e) => e.id === "exp-cold-outbound"));
  });

  it("never throws on a malformed or empty run", () => {
    assert.doesNotThrow(() => recordRunDerivations({ projectId: "default", graph: {}, result: {} }, options));
    assert.doesNotThrow(() => recordRunDerivations({ projectId: "default" }, options));
    assert.doesNotThrow(() => recordRunDerivations({}, options));
    const out = recordRunDerivations({ projectId: "default", graph: null, result: { nodes: null } }, options);
    // A malformed run still returns the seam's shape, just with empty/null derivations.
    assert.ok("feedback" in out && "promotion" in out && "experiment" in out);
  });
});
