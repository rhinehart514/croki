import { describe, expect, it } from "vitest";
import { humanizeOperatorSession } from "./operatorLanguage";
import { normalizeCandidates } from "./sessionCandidates";
import type { OperatorSession } from "@/types";

describe("operator language", () => {
  it("translates engine jargon in persisted reasoning into founder language", () => {
    const detail = "The repo gives us one solid GTM primitive: access requests preserve a `ref` source. The actual `project_created` conversion is still blind, so I’m treating attribution as usable but product positioning and buyer fit as hypotheses. This is a real fork. I’m putting three runnable shapes side by side so you can choose the motion before your approval gate.";
    const session = {
      events: [{ id: "event-1", type: "operator_note", title: "Operator reasoning", detail }],
    } as OperatorSession;

    const rewritten = humanizeOperatorSession(session).events?.[0]?.detail ?? "";
    expect(rewritten).toContain("useful clue");
    expect(rewritten).toContain("record where someone came from");
    expect(rewritten).toContain("whether those people go on to create a project");
    expect(rewritten).toContain("how to explain the product");
    expect(rewritten).toContain("who it is really for");
    expect(rewritten).toContain("approaches");
    expect(rewritten).toContain("review before anything goes out");
    expect(rewritten).not.toMatch(/GTM primitive|`ref`|project_created|attribution|positioning|buyer fit|hypotheses|runnable shapes|motion|approval gate/i);
  });

  it("translates raw success identifiers outside narration events too", () => {
    const session = {
      events: [{ id: "event-2", type: "inspection", title: "Product read", detail: "Blind: project_created could not be confirmed." }],
    } as OperatorSession;

    const rewritten = humanizeOperatorSession(session).events?.[0]?.detail ?? "";
    expect(rewritten).toBe("Couldn't confirm the customer success signal in your product yet.");
    expect(rewritten).not.toContain("project_created");
  });

  it("keeps the choice cards free of tracking and marketing shorthand", () => {
    const [candidate] = normalizeCandidates([{
      id: "inbound",
      label: "Inbound referral motion",
      rationale: "Mint a ref code, stage a ref-tagged ask, and make each introduction attributable.",
      nodes: [],
      edges: [],
    }]);

    expect(candidate.label).toBe("people finding you referral approach");
    expect(candidate.rationale).toContain("create a tracking link");
    expect(candidate.rationale).toContain("prepare a trackable ask");
    expect(candidate.rationale).toContain("make each introduction trackable");
    expect(`${candidate.label} ${candidate.rationale}`).not.toMatch(/inbound|motion|mint|ref code|ref-tagged|attributable/i);
  });
});
