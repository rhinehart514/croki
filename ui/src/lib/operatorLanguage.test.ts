import { describe, expect, it } from "vitest";
import { humanizeOperatorSession } from "./operatorLanguage";
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
});
