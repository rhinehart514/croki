import { describe, expect, it } from "vitest";
import type { WorkIndex } from "@/api";
import type { Direction } from "@/components/now/directionModel";
import { buildVentureOutline } from "./ventureOutlineModel";

function direction(id: string, sentence: string, needsYou = false): Direction {
  return {
    id, sentence, understanding: needsYou ? "A decision is waiting for you." : "Ready to continue.",
    createdAt: null, updatedAt: null, betIds: [], primaryBetId: null, waitingWallItemIds: [], activeDriveIds: [],
    outcomeIds: [], proofCount: 0, approaches: 0, state: needsYou ? "needs-you" : "open", needsYou, attribution: null,
  };
}

const thoughts = [
  direction("thread:onboarding", "Remove the setup form"),
  direction("thread:positioning", "Choose the sharper promise", true),
];

const index: WorkIndex = {
  ventureId: "v1", revision: 3, items: [], counts: { total: 2, attention: 1, active: 0, unread: 2 },
  legacy: { unindexedRunCount: 0 },
  outline: {
    architectureRevision: 3,
    unplacedThreadRefs: [],
    objects: [
      {
        id: "experience", objectRef: "object:experience", name: "First-run experience", statement: "Reach value quickly.", type: "experience",
        territory: "product", sectionId: "experiences", parentRef: null, assertion: "founder-asserted", provenance: null,
        threadRefs: [], targetable: true, architectureRole: "product-loop", updatedAt: null,
      },
      {
        id: "onboarding", objectRef: "object:onboarding", name: "Onboarding", statement: "No setup tax.", type: "experience",
        territory: "product", sectionId: "experiences", parentRef: "object:experience", assertion: "tentative", provenance: null,
        threadRefs: ["thread:onboarding"], targetable: true, architectureRole: "product-loop", updatedAt: null,
      },
      {
        id: "positioning", objectRef: "object:positioning", name: "Founder ADE", statement: "Cursor for founders.", type: "positioning",
        territory: "gtm", sectionId: "positioning", parentRef: null, assertion: "founder-asserted", provenance: null,
        threadRefs: ["thread:positioning"], targetable: true, architectureRole: "concept", updatedAt: null,
      },
    ],
  },
};

describe("buildVentureOutline", () => {
  it("keeps the stable Product/GTM model while supporting arbitrary nested objects", () => {
    const outline = buildVentureOutline(index, thoughts);
    expect(outline.territories.map((territory) => territory.label)).toEqual(["Product", "Go-to-market"]);
    const experience = outline.territories[0].sections[0].objects[0];
    expect(experience.name).toBe("First-run experience");
    expect(experience.children[0].name).toBe("Onboarding");
    expect(experience.children[0].thoughts[0].sentence).toBe("Remove the setup form");
  });

  it("filters attention and search through the same outline without creating another inbox", () => {
    const attention = buildVentureOutline(index, thoughts, { needsOnly: true });
    expect(attention.territories[0].sections).toEqual([]);
    expect(attention.territories[1].sections[0].objects[0].thoughts[0].sentence).toBe("Choose the sharper promise");

    const search = buildVentureOutline(index, thoughts, { search: "setup" });
    expect(search.territories[0].sections[0].objects[0].children[0].name).toBe("Onboarding");
    expect(search.territories[1].sections).toEqual([]);
  });
});
