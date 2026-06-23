import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getEngineState, deriveMeasure } from "../src/engine.mjs";

function subsystemOf(state, id) {
  return state.subsystems.find((s) => s.id === id);
}

function measureOf(state) {
  return subsystemOf(state, "measure");
}

// Scan report shapes, trimmed to the fields deriveMeasure actually reads.
const NO_WIN = { winEvent: { name: "project_created", found: false, attributionProperties: [] }, headline: "Blind: project_created could not be confirmed." };
const BLIND_ATTRIBUTION = { winEvent: { name: "project_created", found: true, attributionProperties: [] }, headline: "Tracking gap proven: attribution is captured but missing from project_created." };
const INSTRUMENTED = { winEvent: { name: "project_created", found: true, attributionProperties: ["source"] }, headline: "Instrumented: project_created carries source." };

// A real send connector declares a send-class action; the default local
// connector only stages, so it must NOT count as send-ready.
const SEND_READY = [{ category: "execute", configured: true, stub: false, name: "Gmail", approvalRequired: ["send_email"] }];
const LOCAL_STAGER = [{ category: "execute", configured: true, stub: false, name: "Local execution queue", allowed: ["stage_approved_action", "export_for_manual_execution"], blocked: ["send", "publish", "deploy"] }];
const runWithSends = (n) => [{ result: { nodes: { "exe-email": { category: "execute", items: Array.from({ length: n }, () => ({})) } } } }];

describe("engine — Measure is derived from real scan + ledger, not seeded", () => {
  it("is blind when no workspace has been scanned", () => {
    const m = measureOf(getEngineState());
    assert.equal(m.derived, true);
    assert.equal(m.health, 0);
    assert.match(m.activeIssues.join(" "), /no outcome defined/i);
  });

  it("is critical when the win event is not proven in code", () => {
    const m = measureOf(getEngineState({ report: NO_WIN }));
    assert.ok(m.health < 50, `expected critical health, got ${m.health}`);
    assert.match(m.activeIssues.join(" "), /not proven/i);
  });

  it("flags blind attribution for the Buffalo-Projects tracking-gap case", () => {
    const m = measureOf(getEngineState({ report: BLIND_ATTRIBUTION }));
    assert.ok(m.health < 50, `expected critical health, got ${m.health}`);
    assert.match(m.activeIssues.join(" "), /attribution is blind/i);
    assert.match(m.suggestedActions.join(" "), /project_created/);
  });

  it("rises once the win event carries attribution", () => {
    const gap = measureOf(getEngineState({ report: BLIND_ATTRIBUTION }));
    const ok = measureOf(getEngineState({ report: INSTRUMENTED }));
    assert.ok(ok.health > gap.health, `expected ${ok.health} > ${gap.health}`);
    assert.ok(ok.confidence > 80);
  });

  it("counts staged sends from the ledger and reads send-connector readiness", () => {
    const ready = deriveMeasure(INSTRUMENTED, runWithSends(3), SEND_READY);
    assert.equal(ready.health, 86);
    // With a real send connector wired, the "no send connector" issue is gone.
    assert.ok(!ready.activeIssues.some((i) => /no send connector/i.test(i)));

    const staged = deriveMeasure(INSTRUMENTED, [], []);
    assert.equal(staged.health, 72);
    assert.ok(staged.activeIssues.some((i) => /no send connector/i.test(i)));
  });

  it("does not treat the local staging queue as a real send connector", () => {
    // 3 items staged locally, but the only execute connector stages, never sends.
    const m = deriveMeasure(INSTRUMENTED, runWithSends(3), LOCAL_STAGER);
    assert.equal(m.health, 72, "staged-locally must not reach the real-send band");
    assert.ok(m.activeIssues.some((i) => /no send connector/i.test(i)));
  });

  it("surfaces a real measure investigation tied to the scanned win event", () => {
    const state = getEngineState({ report: BLIND_ATTRIBUTION });
    const inv = state.investigations.find((i) => i.subsystem === "measure");
    assert.ok(inv, "expected a derived measure investigation");
    assert.match(inv.evidence.join(" "), /project_created/);
  });

  it("derives every subsystem from real state — nothing is seeded", () => {
    const state = getEngineState();
    assert.equal(state.subsystems.length, 10);
    assert.ok(state.subsystems.every((s) => s.derived === true));
    // No fabricated content: agents and experiments stay empty until real.
    assert.deepEqual(state.agents, []);
    assert.deepEqual(state.experiments, []);
  });
});

describe("engine — flow subsystems derive from the run ledger + connectors", () => {
  const sourceReady = [{ category: "source", configured: true, stub: false, name: "Exa" }];

  it("flags an unconfigured stage and names the available connector", () => {
    const s = subsystemOf(getEngineState({ connectors: [{ category: "source", configured: false, stub: false, name: "Exa" }] }), "source");
    assert.ok(s.health < 50, `expected unconfigured stage to be low, got ${s.health}`);
    assert.match(s.activeIssues.join(" "), /connector is configured/i);
    assert.match(s.activeIssues.join(" "), /Exa/);
  });

  it("reports live throughput when a stage produced items", () => {
    const runs = [{ result: { nodes: { "src-find": { category: "source", ok: true, items: [{}, {}, {}] } } } }];
    const s = subsystemOf(getEngineState({ runs, connectors: sourceReady }), "source");
    assert.equal(s.throughput, 3);
    assert.ok(s.health >= 85);
  });

  it("surfaces a node error as the subsystem issue and a finding", () => {
    const runs = [{ createdAt: new Date().toISOString(), result: { nodes: { "src-find": { nodeId: "src-find", category: "source", ok: false, error: "Exa requires EXA_API_KEY." } } } }];
    const state = getEngineState({ runs, connectors: sourceReady });
    const s = subsystemOf(state, "source");
    assert.ok(s.health < 50);
    assert.match(s.activeIssues.join(" "), /EXA_API_KEY/);
    assert.match(state.recentFindings[0].summary, /EXA_API_KEY/);
  });
});

describe("engine — one health number: the rail equals the node badge", () => {
  it("every investigation carries the same health as its subsystem", () => {
    // No decisions recorded → learn is a real problem (health 1–49) with an issue.
    const state = getEngineState();
    for (const inv of state.investigations) {
      const sub = subsystemOf(state, inv.subsystem);
      assert.equal(inv.health, sub.health, `investigation ${inv.subsystem} must report subsystem health`);
    }
    assert.ok(state.investigations.some((i) => i.subsystem === "learn"));
  });
});

describe("engine — connector-stage problems are graph-aware (no phantom taxonomy)", () => {
  const unconfiguredGenerate = [{ category: "generate", configured: false, stub: false, name: "Claude" }];
  const hasGenerateInvestigation = (state) =>
    state.investigations.some((i) => i.subsystem === "generate");

  it("legacy callers (no graph) still derive every stage from the registry", () => {
    assert.ok(hasGenerateInvestigation(getEngineState({ connectors: unconfiguredGenerate })));
  });

  it("suppresses the generate problem when the graph has no generate connector node", () => {
    const graph = { nodes: [{ id: "g", category: "gate", kind: "tool" }], edges: [] };
    assert.ok(!hasGenerateInvestigation(getEngineState({ connectors: unconfiguredGenerate, graph })));
  });

  it("an agent step carrying category generate is not a missing generate connector", () => {
    // The un-caging: generation runs as an agent, so a missing connector is not a problem.
    const graph = { nodes: [{ id: "draft", category: "generate", kind: "agent", ref: "gtm-draft" }], edges: [] };
    assert.ok(!hasGenerateInvestigation(getEngineState({ connectors: unconfiguredGenerate, graph })));
  });

  it("keeps the problem when the graph really uses a generate connector node", () => {
    const graph = { nodes: [{ id: "gen", category: "generate", kind: "tool", connector: "claude" }], edges: [] };
    assert.ok(hasGenerateInvestigation(getEngineState({ connectors: unconfiguredGenerate, graph })));
  });
});

describe("engine — gate and learn derive from founder decisions", () => {
  it("counts pending reviews and approvals at the gate", () => {
    const runs = [{ result: { nodes: { "gate-review": { category: "gate", items: [
      { approvalStatus: "pending" },
      { approvalStatus: "approved", draft: "x" },
    ] } } } }];
    const gate = subsystemOf(getEngineState({ runs }), "gate");
    assert.match(gate.activeIssues.join(" "), /awaiting your review/i);
    assert.equal(gate.throughput, 1);
  });

  it("starts learning only once decisions are recorded", () => {
    const empty = subsystemOf(getEngineState(), "learn");
    assert.ok(empty.health < 50);
    const runs = [{ result: { nodes: { "gate-review": { category: "gate", items: [
      { email: "a@x.com", draft: "warm note", approvalStatus: "approved" },
    ] } } } }];
    const learned = subsystemOf(getEngineState({ runs }), "learn");
    assert.ok(learned.health > empty.health, `expected ${learned.health} > ${empty.health}`);
  });
});
