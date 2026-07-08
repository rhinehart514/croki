import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createOperatorSession } from "../src/operator-store.mjs";
import { NAKED_TOOLS } from "../src/operator-tools.mjs";
import {
  resumeOperatorSession,
  runOperatorSession,
} from "../src/operator-runtime.mjs";

function fakeClient(responses) {
  let index = 0;
  return {
    messages: {
      async create() {
        const response = responses[index];
        index += 1;
        if (!response) throw new Error("Unexpected extra model turn.");
        return response;
      },
    },
  };
}

const complete = (summary) => fakeClient([
  { content: [{ type: "tool_use", id: "done", name: "complete", input: { outcome: "achieved", summary } }] },
]);

// An EMBODIED candidate shape: a source → a drafting AGENT (kind+ref, the crew) → founder gate →
// a CAPABILITY execute (connector) → measure. This is what an "idea" looks like now — a pipeline that
// already names who runs it — never a bare paragraph.
function embodiedShape(id, label) {
  return {
    id,
    label,
    rationale: `The ${label} shape.`,
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Input", config: { items: [{ id: "lead-1", name: "Ada" }] } },
      { id: "draft", kind: "agent", ref: "outreach-writer", label: "Outreach writer" },
      { id: "gate", category: "gate", connector: "default", label: "Founder review" },
      { id: "out", category: "execute", connector: "gmail", label: "Send" },
      { id: "meas", category: "measure", connector: "default", label: "Measure" },
    ],
    edges: [
      { source: "src", target: "draft", edgeType: "data" },
      { source: "draft", target: "gate", edgeType: "data" },
      { source: "gate", target: "out", edgeType: "data" },
      { source: "out", target: "meas", edgeType: "data" },
    ],
  };
}

describe("composer redesign — one embodied options door + advisory @-mention hints", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-composer-redesign-"));
    options = { root: path.join(parent, "state") };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  // ── Collapse: the operator reaches for ONE options door, and it is the embodied one ─────────────
  it("the operator reaches for the embodied options door (propose_candidates) — never the prose ideate path", () => {
    const nakedNames = new Set(NAKED_TOOLS.map((tool) => tool.name));
    assert.ok(
      nakedNames.has("propose_candidates"),
      "propose_candidates is the options door the founder-driving operator is offered",
    );
    assert.ok(
      !nakedNames.has("ideate"),
      "the prose ideate path is retired from the operator's reach — do not leave both live",
    );
  });

  it("an ambiguous goal pauses with candidates whose nodes already name the crew (kind+ref) and their capabilities", async () => {
    const session = createOperatorSession({ goal: "get more pest-control owners", projectId: "default" }, options);
    const composeCandidates = async () => ({
      ok: true,
      ambiguous: true,
      candidates: [embodiedShape("outbound", "Outbound"), embodiedShape("content", "Content")],
    });

    const paused = await runOperatorSession(session.id, {
      options: { ...options, composeCandidates },
      client: fakeClient([{ content: [{ type: "tool_use", id: "c", name: "propose_candidates", input: {} }] }]),
    });

    assert.equal(paused.status, "waiting_for_candidates");
    const candidate = paused.pendingCandidates.candidates[0];
    // Embodiment survived normalization: the crew (an agent with its ref) and a gated capability are on
    // the candidate the founder sees — this is what lets the composer render faces + marks, not prose.
    const crew = candidate.nodes.find((node) => node.kind === "agent");
    assert.ok(crew && crew.ref === "outreach-writer", "the candidate names its crew (an agent ref) up front");
    const gate = candidate.nodes.find((node) => node.category === "gate");
    assert.ok(gate, "every embodied candidate still ends at the founder gate");
    const capability = candidate.nodes.find((node) => node.category === "execute");
    assert.ok(capability && capability.connector, "the candidate carries the capability mark (a connector) that would run it");
  });

  // ── Structured hints: advisory @-mention steering, never a contract ─────────────────────────────
  it("folds @-mentioned teammates and capabilities into the resume as a strong steer (never a hard contract)", async () => {
    const session = createOperatorSession({ goal: "Land design partners", projectId: "default" }, options);
    const resumed = resumeOperatorSession(session.id, "go after these two", {
      options,
      hints: { teammates: ["ada-researcher", "mel-writer"], capabilities: ["gmail-send"] },
      client: complete("done"),
    });

    const last = resumed.modelMessages.at(-1);
    assert.match(last.content, /go after these two/, "the founder's own words lead the resume message");
    assert.match(last.content, /ada-researcher/);
    assert.match(last.content, /mel-writer/);
    assert.match(last.content, /gmail-send/);
    assert.match(last.content, /strong steer, not a hard requirement/, "hints are advisory, never a contract");
    assert.match(last.content, /Never block the work on them/);
    // The resume itself never stalls or blocks on a hint — it proceeds to a normal drive.
    assert.equal(resumed.status, "ready");

    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it("empty or omitted hints leave the resume byte-identical to a plain founder response", async () => {
    const s1 = createOperatorSession({ goal: "g1", projectId: "default" }, options);
    const r1 = resumeOperatorSession(s1.id, "just go", { options, hints: {}, client: complete("d1") });
    assert.equal(r1.modelMessages.at(-1).content, "Founder response: just go");

    const s2 = createOperatorSession({ goal: "g2", projectId: "default" }, options);
    const r2 = resumeOperatorSession(s2.id, "just go", { options, client: complete("d2") });
    assert.equal(r2.modelMessages.at(-1).content, "Founder response: just go");

    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it("a malformed hints payload is ignored, not thrown — the founder's message still resumes", () => {
    const session = createOperatorSession({ goal: "g", projectId: "default" }, options);
    assert.doesNotThrow(() =>
      resumeOperatorSession(session.id, "x", { options, hints: "nonsense", client: complete("d") }),
    );
  });
});
