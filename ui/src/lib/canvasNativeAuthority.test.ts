import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGoal, createGoalRelation, createWorkArtifact, createWorkRelationship,
  listWorkArtifacts, listWorkRelationships,
  createCanvasRegion, listCanvasRegions,
} from "@/api";
import { connectCanvasObjects, createCanvasObject, createCanvasRegionFromSelection } from "./canvasNativeAuthority";

vi.mock("@/api", () => ({
  createGoal: vi.fn(),
  createGoalRelation: vi.fn(),
  createWorkArtifact: vi.fn(),
  createWorkRelationship: vi.fn(),
  listWorkArtifacts: vi.fn(),
  listWorkRelationships: vi.fn(),
  createCanvasRegion: vi.fn(),
  listCanvasRegions: vi.fn(),
}));

describe("canvas-native authority bridge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a provider-neutral goal without manufacturing a pipeline", async () => {
    vi.mocked(createGoal).mockResolvedValue({ goal: { id: "g1" } } as never);
    await expect(createCanvasObject("p1", { kind: "goal", title: "Fix activation", position: { x: 10, y: 20 } }, "u1"))
      .resolves.toEqual({ type: "goal", id: "g1" });
    expect(createGoal).toHaveBeenCalledWith("p1", expect.objectContaining({
      statement: "Fix activation", createdBy: "u1", status: "active",
      idempotencyKey: expect.stringMatching(/^ui:canvas-native:goal:/),
    }));
  });

  it("guards open-work creation with the current project store revision", async () => {
    vi.mocked(listWorkArtifacts).mockResolvedValue({ artifacts: [], storeRevision: 7 });
    vi.mocked(createWorkArtifact).mockResolvedValue({ artifact: { artifactId: "w1" } } as never);
    await expect(createCanvasObject("p1", { kind: "work", title: "Compare causes", position: { x: 10, y: 20 } }, "u1"))
      .resolves.toEqual({ type: "work-artifact", id: "w1" });
    expect(createWorkArtifact).toHaveBeenCalledWith("p1", expect.objectContaining({
      expectedStoreRevision: 7, provenance: "founder-stated", createdBy: { type: "founder", id: "u1" },
    }));
  });

  it("preserves pasted and dropped work content instead of reducing it to a title", async () => {
    vi.mocked(listWorkArtifacts).mockResolvedValue({ artifacts: [], storeRevision: 8 });
    vi.mocked(createWorkArtifact).mockResolvedValue({ artifact: { artifactId: "w2" } } as never);
    await createCanvasObject("p1", {
      kind: "work", workKind: "reference", title: "example.com/research", contentType: "text/uri-list",
      content: "https://example.com/research", position: { x: 20, y: 30 },
    }, "u1");
    expect(createWorkArtifact).toHaveBeenCalledWith("p1", expect.objectContaining({
      kind: "reference", title: "example.com/research", contentType: "text/uri-list", content: "https://example.com/research",
    }));
  });

  it("keeps goal relations in the goal authority and all other links in open work", async () => {
    vi.mocked(createGoalRelation).mockResolvedValue({ relation: { id: "gr1" } } as never);
    await connectCanvasObjects("p1", {
      sourceRef: { type: "goal", id: "g1" }, targetRef: { type: "goal", id: "g2" }, kind: "related-to",
    }, "u1");
    expect(createGoalRelation).toHaveBeenCalledWith("p1", expect.objectContaining({ provenance: "founder-stated" }));

    vi.mocked(listWorkRelationships).mockResolvedValue({ relationships: [], storeRevision: 4 });
    vi.mocked(createWorkRelationship).mockResolvedValue({ relationship: { relationshipId: "wr1" } } as never);
    await connectCanvasObjects("p1", {
      sourceRef: { type: "goal", id: "g1" }, targetRef: { type: "work-artifact", id: "w1" }, kind: "related-to",
    }, "u1");
    expect(createWorkRelationship).toHaveBeenCalledWith("p1", expect.objectContaining({ expectedStoreRevision: 4 }));
  });

  it("creates a founder-placed region under store CAS without taking ownership of members", async () => {
    vi.mocked(listCanvasRegions).mockResolvedValue({ regions: [], storeRevision: 3 });
    vi.mocked(createCanvasRegion).mockResolvedValue({ region: { id: "r1" } } as never);
    const request = {
      title: "Fix activation",
      memberRefs: [{ type: "goal", id: "g1" }, { type: "work-artifact", id: "w1" }],
      position: { x: 52, y: 40 },
      size: { width: 600, height: 360 },
    };
    await expect(createCanvasRegionFromSelection("p1", request, "u1")).resolves.toMatchObject({ id: "r1" });
    expect(createCanvasRegion).toHaveBeenCalledWith("p1", expect.objectContaining({
      expectedStoreRevision: 3,
      memberRefs: request.memberRefs,
      position: request.position,
      size: request.size,
      placementMode: "founder",
      createdBy: "u1",
      revisionAuthor: "u1",
      idempotencyKey: expect.stringMatching(/^ui:canvas-native:region:/),
    }));
  });
});
