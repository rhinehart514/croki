import { describe, it, expect } from "vitest";
import {
  canvasImplications, canvasOutcomes, canvasQuestions,
  clarityFallbackItems, normalizeCanvasQuestion, normalizePosition, questionIdFromFocus, resolveFocusedQuestion,
} from "@/lib/canvasProjection";
import type { CanvasQuestionBody, ClarityObject, WovenCanvas, WovenCanvasAnchor } from "@/types";

function canvas(over: Partial<WovenCanvas> = {}): WovenCanvas {
  return {
    anchors: over.anchors ?? [],
    relationships: over.relationships ?? [],
    outcomes: over.outcomes,
    implications: over.implications,
    state: over.state ?? { kind: "ready", stale: false, issues: [] },
    geometry: over.geometry ?? null,
  };
}
function anchor(over: Partial<WovenCanvasAnchor> & { kind: string; ref: { type: string | null; id: string } }): WovenCanvasAnchor {
  return {
    id: `anchor:${over.ref.type}:${over.ref.id}`,
    ref: over.ref,
    kind: over.kind,
    label: over.label ?? over.ref.id,
    body: over.body,
    authority: over.authority ?? { owner: "test", id: over.ref.id, projectId: "p", updatedAt: null },
  };
}

// ── Fix 2 — the real backend question/position shape (participantRef / statement), not ref / claim ──
describe("canvasProjection — question normalization (fix 2)", () => {
  it("maps a backend position (participantRef/statement) to the UI display shape (ref/claim)", () => {
    const pos = normalizePosition({
      id: "pos1", questionId: "q1",
      participantRef: { type: "teammate", id: "scout" },
      statement: "Buyers understand the promise but can't find the first action.",
      relation: "challenging",
      uncertainty: "Not sure it's the same segment.",
      recommendation: "Instrument the first activation step.",
      falsifier: "A cohort that activates without the change.",
      evidenceRefs: [{ type: "file", id: "app.ts:12" }],
    });
    expect(pos.ref).toBe("scout");
    expect(pos.claim).toBe("Buyers understand the promise but can't find the first action.");
    expect(pos.falsifier).toContain("cohort");
    expect(pos.recommendation).toContain("activation");
    expect(pos.evidenceRefs).toEqual(["app.ts:12"]);
  });

  it("normalizes a question anchor, preserving each teammate position as its own branch (no blend)", () => {
    const body: CanvasQuestionBody = {
      id: "q1", text: "Which segment does this attract?",
      productRefs: [{ type: "thing", id: "billing" }],
      relevantParticipantRefs: [{ type: "teammate", id: "scout" }, { type: "teammate", id: "closer" }],
      positions: [
        { id: "p1", questionId: "q1", participantRef: { type: "teammate", id: "scout" }, statement: "SMB.", unknowns: ["pricing fit"] },
        { id: "p2", questionId: "q1", participantRef: { type: "teammate", id: "closer" }, statement: "Mid-market.", unknowns: "sales cycle" },
      ],
    };
    const q = normalizeCanvasQuestion(body);
    expect(q.kind).toBe("question");
    expect(q.positions).toHaveLength(2);
    expect(q.positions?.map((p) => p.ref)).toEqual(["scout", "closer"]);
    expect(q.positions?.map((p) => p.claim)).toEqual(["SMB.", "Mid-market."]);
    // Unknowns aggregate from both positions (string + array forms), deduped.
    expect(q.unknowns).toEqual(expect.arrayContaining(["pricing fit", "sales cycle"]));
    // Binding context for turn-into-pipeline is carried through.
    expect(q.participantRefs).toEqual(["scout", "closer"]);
    expect(q.productRefs).toEqual(["billing"]);
  });

  it("drops a raw clarity question card when a canonical anchor exists, keeps orphans + non-question pins", () => {
    const c = canvas({ anchors: [anchor({ kind: "question", ref: { type: "question", id: "q1" }, body: { id: "q1", text: "Anchored", positions: [] } })] });
    const clarity: ClarityObject[] = [
      { id: "q1", kind: "question", text: "Anchored (dup)", createdAt: "" },   // has a canonical anchor → dropped
      { id: "q2", kind: "question", text: "Orphan question", createdAt: "" },  // no anchor → kept (fallback)
      { id: "d1", kind: "direction", text: "A direction", createdAt: "" },     // non-question → untouched
      { id: "i1", kind: "icp", text: "An ICP", createdAt: "" },
    ];
    const kept = clarityFallbackItems(clarity, c).map((x) => x.id);
    expect(kept).toEqual(["q2", "d1", "i1"]);   // q1 (canonical) removed; everything else preserved, in order
    // With no canvas, nothing is canonical — every pin renders (pure fallback).
    expect(clarityFallbackItems(clarity, null).map((x) => x.id)).toEqual(["q1", "q2", "d1", "i1"]);
  });

  it("derives a focusedQuestionId only from a canonical question-anchor focus (opens the sidecar)", () => {
    expect(questionIdFromFocus({ kind: "anchor", ref: { type: "question", id: "q1" } })).toBe("q1");
    // Any non-question selection is trace-only — it never forces the question sidecar open.
    expect(questionIdFromFocus({ kind: "anchor", ref: { type: "productModel", id: "billing" } })).toBeNull();
    expect(questionIdFromFocus({ kind: "object", objectKey: "acme" } as never)).toBeNull();
    expect(questionIdFromFocus(null)).toBeNull();
  });

  it("reads question anchors from the canvas and resolves a focused question, canvas over raw clarity", () => {
    const c = canvas({ anchors: [anchor({ kind: "question", ref: { type: "question", id: "q1" }, label: "Q", body: { id: "q1", text: "Canvas question", positions: [] } })] });
    expect(canvasQuestions(c).map((q) => q.id)).toEqual(["q1"]);
    const clarityFallback: ClarityObject[] = [{ id: "q1", kind: "question", text: "Raw clarity question", createdAt: "" }];
    // Canvas wins when it has the id.
    expect(resolveFocusedQuestion("q1", c, clarityFallback)?.text).toBe("Canvas question");
    // Falls back to raw clarity when the canvas is absent.
    expect(resolveFocusedQuestion("q1", null, clarityFallback)?.text).toBe("Raw clarity question");
    // A stale id resolves to null (never traps the founder).
    expect(resolveFocusedQuestion("gone", c, clarityFallback)).toBeNull();
  });
});

// ── Fix 4 — outcomes and implications come from the canvas projection, not top-level fields ──
describe("canvasProjection — outcome + implication projection (fix 4)", () => {
  it("routes an outcome home via canvas relationships (pipeline / question / product / crew)", () => {
    const c = canvas({
      anchors: [anchor({
        kind: "outcome", ref: { type: "outcome", id: "r1" }, label: "reply",
        body: { id: "r1", outcomeKind: "reply", value: 2, questionId: "q1", participantRefs: [{ type: "teammate", id: "scout" }] },
      })],
      relationships: [
        { id: "rel1", source: { type: "path", id: "ch1" }, target: { type: "outcome", id: "r1" }, kind: "resulted-in", resolved: true, authority: { owner: "gtm-results", projectId: "p" } },
        { id: "rel2", source: { type: "outcome", id: "r1" }, target: { type: "productModel", id: "billing" }, kind: "returns-to", resolved: true, authority: { owner: "gtm-results", projectId: "p" } },
      ],
    });
    const [o] = canvasOutcomes(c);
    expect(o.id).toBe("r1");
    expect(o.kind).toBe("observed-response");
    expect(o.value).toBe(2);
    expect(o.channelId).toBe("ch1");
    expect(o.questionId).toBe("q1");
    expect(o.productRefs).toContain("billing");
    expect(o.crewRefs).toContain("scout");
  });

  it("returns no implications when the canvas has no implication anchor (honest empty today)", () => {
    const c = canvas({ anchors: [anchor({ kind: "outcome", ref: { type: "outcome", id: "r1" }, body: { id: "r1", outcomeKind: "reply" } })] });
    expect(canvasImplications(c)).toEqual([]);
  });

  it("consumes the CANONICAL canvas.outcomes array verbatim, over anchors/relationships (fix 3)", () => {
    const c = canvas({
      outcomes: [{
        id: "r1", ref: { type: "outcome", id: "r1" }, body: "Got 3 replies", kind: "observed-response",
        label: "Got 3 replies", value: 3, channelId: "ch1", questionId: "q1", productRefs: ["billing"], crewRefs: ["scout"], runId: "run1",
        lineage: { pathRef: { type: "path", id: "should-not-be-used" } },
      }],
      // A conflicting anchor + relationship that the LEGACY path would read — the canonical array must win.
      anchors: [anchor({ kind: "outcome", ref: { type: "outcome", id: "r1" }, body: { id: "r1", outcomeKind: "reply", channel: "WRONG" } })],
      relationships: [{ id: "x", source: { type: "path", id: "WRONG" }, target: { type: "outcome", id: "r1" }, kind: "resulted-in", resolved: true, authority: { owner: "o", projectId: "p" } }],
    });
    const [o] = canvasOutcomes(c);
    expect(o.kind).toBe("observed-response");     // backend-authoritative kind, not re-derived
    expect(o.channelId).toBe("ch1");              // exact channelId, NOT the conflicting "WRONG"
    expect(o.label).toBe("Got 3 replies");
    expect(o.value).toBe(3);
    expect(o.productRefs).toEqual(["billing"]);
    expect(o.crewRefs).toEqual(["scout"]);
    expect(o.runId).toBe("run1");
  });

  it("consumes canvas.implications, preserving the server-derived review + status for display/dedupe only", () => {
    const c = canvas({
      implications: [{
        id: "implication-r1", ref: { type: "implication", id: "implication-r1" }, body: "Add proof to onboarding.",
        text: "Add proof to onboarding.", status: "staged", sourceOutcomeId: "r1", questionId: "q1", productRefs: ["onboarding"],
        disposition: "accepted",
        review: { pipelineRef: { type: "pipeline", id: "ch1" } },
        lineage: { proposalRef: { type: "productChangeProposal", id: "sess-9" }, pipelineRef: { type: "pipeline", id: "ch1" } },
      }],
    });
    const [impl] = canvasImplications(c);
    expect(impl.id).toBe("implication-r1");
    expect(impl.text).toBe("Add proof to onboarding.");
    expect(impl.disposition).toBe("accepted");
    expect(impl.status).toBe("staged");                 // raw status preserved for dedupe/display
    expect(impl.review).toEqual({ pipelineRef: { type: "pipeline", id: "ch1" } }); // review preserved, non-executable
    expect(impl.productRefs).toEqual(["onboarding"]);
    // The projection carries NO client-executable graph authority — accept is fully server-derived.
    expect(Object.keys(impl)).not.toContain("graphId");
    expect(Object.keys(impl)).not.toContain("operations");
  });

  it("reads implication anchors as the fallback, carrying status without any executable graph authority", () => {
    const c = canvas({
      anchors: [anchor({
        kind: "product-implication", ref: { type: "product-implication", id: "implication-r1" }, label: "impl",
        body: { id: "implication-r1", kind: "product-change", status: "staged", body: "Add proof to onboarding.", sourceOutcomeId: "r1" },
      })],
    });
    const [impl] = canvasImplications(c);
    expect(impl.id).toBe("implication-r1");
    expect(impl.text).toBe("Add proof to onboarding.");
    expect(impl.disposition).toBe("accepted"); // staged → accepted disposition
    expect(impl.status).toBe("staged");
  });
});
