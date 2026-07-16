import { describe, expect, it } from "vitest";
import type { FirmLens } from "@/types";
import { buildFirmLensEdges, buildFirmLensNodes } from "./firmLensGraph";

const lens: FirmLens = {
  ventureId: "v1",
  crew: [
    { ref: "auditor", summonedAt: "now", soul: { name: "Auditor" } },
    { ref: "synthesizer", summonedAt: "now", soul: { name: "Synthesizer" } },
  ],
  bets: [],
  wall: { count: 0, oldestParkedAt: null },
  placement: { positions: {}, revision: 0 },
  configuration: {
    id: "firm",
    schemaVersion: 1,
    revision: 2,
    presentation: { participant: "agent", participantLabel: "agent", collectiveLabel: "panel" },
    defaults: { runtime: null, model: null, maxSteps: 24 },
    organization: {
      shape: "panel",
      instructions: null,
      relationships: [{ from: "auditor", to: "synthesizer", kind: "advises", label: "evidence to synthesis" }],
    },
    coordination: { mode: "adaptive", coordinatorRef: "synthesizer", protocols: [], stopWhen: [] },
    authority: { outwardEffects: "wall", configurationChanges: "founder" },
    agents: [],
  },
};

describe("firm lens organization projection", () => {
  it("draws configured relationships as labeled, non-animated participant lines", () => {
    const [edge] = buildFirmLensEdges(lens);
    expect(edge).toMatchObject({
      id: "organization:auditor:advises:synthesizer",
      source: "crew:auditor",
      target: "crew:synthesizer",
      sourceHandle: "organization-out",
      targetHandle: "organization-in",
      label: "evidence to synthesis",
      className: "firm-lens-organization-edge",
    });
    expect(edge.animated).not.toBe(true);
  });

  it("projects a real capability only after placement makes it part of the canvas scene", () => {
    const capability = {
      id: "product-truth" as const,
      name: "Product truth",
      description: "Read cited repository truth.",
      source: "/products/one",
      authority: "read" as const,
      icon: "database" as const,
    };
    expect(buildFirmLensNodes(lens, {}, undefined, [capability]).some((node) => node.type === "capability")).toBe(false);
    const nodes = buildFirmLensNodes(lens, { "capability:product-truth": { x: 80, y: 120 } }, undefined, [capability]);
    expect(nodes.find((node) => node.id === "capability:product-truth")).toMatchObject({
      type: "capability",
      position: { x: 80, y: 120 },
    });
  });
});
