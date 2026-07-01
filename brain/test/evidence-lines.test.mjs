import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attachEvidenceLines, annotateRunEvidence } from "../src/evidence-lines.mjs";

// A minimal scan-report shape carrying the citations the scanner really emits: a win event with a
// distinctive name + file:line, an attribution key, and an analytics vendor.
function report() {
  return {
    winEvent: {
      name: "project_created",
      citations: [{ label: "project_created", file: "src/app.ts", line: 42, text: 'analytics.track("project_created")' }],
    },
    attribution: {
      citations: [{ key: "utm_source", label: "utm_source", file: "src/track.ts", line: 7, text: "params.get('utm_source')" }],
    },
    analytics: {
      citations: [{ label: "PostHog", file: "src/analytics.ts", line: 3, text: "posthog.capture(...)" }],
    },
    gaps: [],
    funnel: { stages: [] },
  };
}

describe("evidence_lines: ground a draft claim to a real scan citation", () => {
  it("attaches the ref when a sentence names a distinctive scanned token", () => {
    const items = [{
      id: "a",
      draft_note: "Your app fires project_created on signup. It never carries utm_source into that event. Nice work on the docs.",
    }];
    const [out] = attachEvidenceLines(items, report());
    assert.ok(Array.isArray(out.evidence_lines), "grounded item carries evidence_lines");
    const refs = out.evidence_lines.map((e) => e.ref).sort();
    assert.deepEqual(refs, ["src/app.ts:42", "src/track.ts:7"]);
    // The claim is the exact sentence that named the token, not the whole draft.
    const winLine = out.evidence_lines.find((e) => e.ref === "src/app.ts:42");
    assert.equal(winLine.claim, "Your app fires project_created on signup.");
    // The unrelated "Nice work" sentence grounds nothing.
    assert.ok(!out.evidence_lines.some((e) => /Nice work/.test(e.claim)));
  });

  it("adds NO field when nothing is honestly grounded (degrades honestly)", () => {
    const items = [{ id: "b", draft_note: "Hey — loved the demo, would you be open to a quick chat next week?" }];
    const [out] = attachEvidenceLines(items, report());
    assert.equal("evidence_lines" in out, false, "an ungrounded draft gets no evidence_lines");
  });

  it("never over-claims on a plain dictionary word like 'source'", () => {
    const items = [{ id: "c", draft_note: "We help you find the source of your best leads." }];
    const [out] = attachEvidenceLines(items, report());
    assert.equal("evidence_lines" in out, false, "'source' alone is not a distinctive scanned token");
  });

  it("validates agent-supplied evidence_lines: keeps a real ref, drops a fabricated one", () => {
    const items = [{
      id: "d",
      draft_note: "A generic claim with no scanned token in it at all.",
      evidence_lines: [
        { claim: "A generic claim with no scanned token in it at all.", ref: "src/app.ts:42" }, // real
        { claim: "Invented fact.", ref: "src/nowhere.ts:999" }, // fabricated
      ],
    }];
    const [out] = attachEvidenceLines(items, report());
    assert.deepEqual(out.evidence_lines.map((e) => e.ref), ["src/app.ts:42"]);
  });

  it("strips a pre-existing evidence_lines when none of its refs are real", () => {
    const items = [{ id: "e", draft_note: "Nothing grounded here.", evidence_lines: [{ claim: "x", ref: "made/up.ts:1" }] }];
    const [out] = attachEvidenceLines(items, report());
    assert.equal("evidence_lines" in out, false, "a fully fabricated evidence set is dropped entirely");
  });

  it("leaves items untouched when there is no grounding at all", () => {
    const items = [{ id: "f", draft_note: "Mentions project_created but there is no scan." }];
    const out = attachEvidenceLines(items, null);
    assert.equal("evidence_lines" in out[0], false);
  });

  it("annotateRunEvidence walks a run result's node items in place", () => {
    const result = {
      nodes: {
        gate: { nodeId: "gate", items: [{ id: "g", draft_note: "Emits project_created without a source." }] },
        measure: { nodeId: "measure", items: [] },
      },
    };
    annotateRunEvidence(result, report());
    assert.ok(result.nodes.gate.items[0].evidence_lines.some((e) => e.ref === "src/app.ts:42"));
  });
});
