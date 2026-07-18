import { describe, expect, it } from "vitest";
import { interpretRelationship, type InterpretNode } from "./interpretRelationship";
import type { FirmArchitectureConnection, FirmArchitectureProjection } from "@/types";

// A minimal projection carrying only the connections the ranker reads. Cast through unknown so the test
// stays focused on the one field interpretRelationship consumes.
function projectionWith(connections: FirmArchitectureConnection[]): FirmArchitectureProjection {
  return { connections } as unknown as FirmArchitectureProjection;
}

function connection(label: string, id = label): FirmArchitectureConnection {
  return { id, fromRef: "a", toRef: "b", label, assertion: "tentative" };
}

const offer: InterpretNode = { ref: "architecture:offer-1", kind: "offer", territory: "gtm" };
const audience: InterpretNode = { ref: "architecture:aud-1", kind: "audience", territory: "gtm" };
const capability: InterpretNode = { ref: "architecture:cap-1", kind: "capability", territory: "product" };

describe("interpretRelationship (client ranker, SPEC A)", () => {
  it("ranks the venture's OWN connection labels first, most-used first", () => {
    const projection = projectionWith([
      connection("depends on", "c1"),
      connection("pays for", "c2"),
      connection("pays for", "c3"),
      connection("pays for", "c4"),
    ]);
    const { proposals } = interpretRelationship(projection, offer, audience);
    // "pays for" (3×) outranks "depends on" (1×), and both — the founder's own words (neither is the
    // offer→audience type-pair kind) — come before the general type-pair proposal.
    expect(proposals[0]).toMatchObject({ kind: "pays for", source: "venture-label" });
    expect(proposals[1]).toMatchObject({ kind: "depends on", source: "venture-label" });
    const firstTypePair = proposals.findIndex((p) => p.source === "type-pair");
    expect(firstTypePair).toBeGreaterThan(1);
    expect(proposals[firstTypePair]).toMatchObject({ kind: "designed for", source: "type-pair" });
  });

  it("falls back to a territory-aware type-pair when the venture has no vocabulary", () => {
    const { proposals } = interpretRelationship(projectionWith([]), offer, audience);
    // offer→audience → "designed for" from the type-pair tier, ranked above the fallback.
    expect(proposals[0]).toMatchObject({ kind: "designed for", source: "type-pair" });
    // A cross-territory pair carries a seam-crossing note. capability→offer matches "expressed by"
    // (product→gtm), so its rationale names the crossing.
    const offerGtm: InterpretNode = { ref: "architecture:offer-2", kind: "offer", territory: "gtm" };
    const cross = interpretRelationship(projectionWith([]), capability, offerGtm).proposals[0];
    expect(cross).toMatchObject({ kind: "expressed by", source: "type-pair" });
    expect(cross.rationale).toContain("product→gtm crossing");
  });

  it("NEVER returns a fixed triple — degrades to the founder's literal starting point when nothing ranks", () => {
    // Two unclassifiable kinds, no venture vocabulary: the ONLY proposal is the neutral literal fallback.
    const unknownA: InterpretNode = { ref: "x:1", kind: "mystery", territory: null };
    const unknownB: InterpretNode = { ref: "x:2", kind: "enigma", territory: null };
    const { proposals } = interpretRelationship(projectionWith([]), unknownA, unknownB);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ kind: "relates to", source: "fallback" });
    // It is an OPEN STRING, not a member of any closed enum — the shape is just { kind: string }.
    expect(typeof proposals[0].kind).toBe("string");
  });

  it("de-duplicates a label that also appears as a type-pair kind, keeping the venture-label rank", () => {
    const projection = projectionWith([connection("designed for")]);
    const { proposals } = interpretRelationship(projection, offer, audience);
    const designedFor = proposals.filter((p) => p.kind === "designed for");
    expect(designedFor).toHaveLength(1);
    expect(designedFor[0].source).toBe("venture-label");
  });

  it("is pure and tolerant of a null projection", () => {
    const { proposals, fromRef, toRef } = interpretRelationship(null, offer, audience);
    expect(fromRef).toBe(offer.ref);
    expect(toRef).toBe(audience.ref);
    // No connections to read, but the type-pair + fallback tiers still give the founder a start.
    expect(proposals[0]).toMatchObject({ kind: "designed for", source: "type-pair" });
    expect(proposals.at(-1)).toMatchObject({ source: "fallback" });
  });
});
