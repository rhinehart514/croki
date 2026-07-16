import { describe, expect, it } from "vitest";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import { projectAtlas } from "./AtlasProjection";
import { layoutAtlasNodes } from "@/lib/atlasLayoutEngine";

// The projection decides *what* nodes and edges exist and what each carries; the layout engine
// (atlasLayoutEngine, tested separately) decides *where*. These tests assert the projection's
// content contract. Placement/collision is proven in atlasLayoutEngine.test.ts. The retired orbit
// layout no longer participates: there is no orbit-field node, no sector vocabulary, no radius map.

function fixture(): { projection: FirmArchitectureProjection; lens: FirmLens } {
  const elements: FirmArchitectureProjection["elements"] = [
    { id: "loop", role: "product-loop", name: "Work becomes proof", actor: "Builder", entry: "Project", value: "Proof", steps: [{ id: "step", label: "Do real work" }] },
    { id: "proof", role: "system", name: "Work record", does: "Preserves proof" },
    { id: "graduate", role: "motion", name: "Graduate entry", actor: "Graduate", entry: "Project", value: "Cohort", systemIds: ["proof"], productRefs: ["loop"] },
    { id: "partner", role: "motion", name: "Partner entry", actor: "Partner", entry: "Report", value: "Cohort", systemIds: ["proof"], productRefs: ["loop"] },
    { id: "first-drops", role: "campaign", name: "First drops", audience: "Graduates", objective: "Qualified demand", primaryMotionId: "graduate", motionIds: ["graduate"], governingBetId: "bet-1" },
  ];
  const document = { schemaVersion: 1, ventureId: "buffalo", revision: 4, intent: { statement: "Builders find collaborators through credible work." }, elements, connections: [], groups: [], evidenceAnnotations: [] };
  return {
    projection: {
      ventureId: "buffalo", document, revision: 4, elements, connections: [], groups: [], evidenceAnnotations: [],
      pressure: [{ subjectId: "first-drops", reason: "held-release", detail: "Exact work waits at the wall." }],
      joins: {
        bets: [{ id: "bet-1", betId: "bet-1", campaignId: "first-drops", basis: "campaign-contract" }],
        work: [{ id: "release-1", workRef: "release-1", betId: "bet-1", campaignId: "first-drops", title: "Project-drop invitation v1", exact: true }],
        wall: [{ id: "wall-1", workRef: "release-1", betId: "bet-1", campaignId: "first-drops", basis: "wall-receipt" }],
        outcomes: [{ id: "outcome-1", betId: "bet-1", motionIds: ["graduate"], join: { level: "exact", basis: "executed-wall-receipt", causal: false } }],
      }, omissions: { historicalRevisions: true, machinery: true, unassignedBets: 0 },
    },
    lens: {
      ventureId: "buffalo", crew: [],
      bets: [{ id: "bet-1", ventureId: "buffalo", intent: "Project-first entry converts", forkedFrom: null, teammateRef: null, refs: [], evidence: [], staged: [{ id: "release-1", title: "Project-drop invitation v1" }], joinKey: "one", createdAt: "2026-07-15T00:00:00Z", updatedAt: "2026-07-15T00:00:00Z", endedAt: null, endedBy: null, learning: null, position: "at-wall", stagedCount: 1, latestOutcome: null,
        workflow: [
          { id: "bet-1:opened:opened", label: "Opened", kind: "opened", state: "done", at: "2026-07-15T00:00:00Z" },
          { id: "bet-1:staged:release-1", label: "Project-drop invitation v1", kind: "staged", state: "gate", workRef: "release-1", at: "2026-07-15T00:01:00Z" },
          { id: "bet-1:outcome:outcome-1", label: "Six qualified builders replied", kind: "outcome", state: "done", workRef: "release-1", at: "2026-07-15T00:02:00Z" },
        ],
        machineryCounts: [{ label: "staged", count: 1 }, { label: "at wall", count: 1 }, { label: "outcomes", count: 1 }],
      }],
      outcomes: [{ type: "outcome", id: "outcome-1", betId: "bet-1", workRef: "release-1", outcomeKind: "reply", from: "Builder", body: "Six qualified builders replied", source: "captured", channel: "email", observedAt: "2026-07-15T00:00:00Z", joined: true }],
      wallItems: [{ id: "wall-1", ventureId: "buffalo", betId: "bet-1", workRef: "release-1", purpose: "release", blocksBet: true, effect: {}, parkedAt: "2026-07-15T00:00:00Z", decision: null }],
      wall: { count: 1, oldestParkedAt: "2026-07-15T00:00:00Z" }, placement: { positions: {}, revision: 2 },
    },
  };
}

describe("projectAtlas", () => {
  it("preserves architecture, groups, connections, exact work, and returned outcomes in the scene", () => {
    const { projection, lens } = fixture();
    const group = { id: "entry-terrain", name: "Entry terrain", statement: "Two routes into proof", memberRefs: ["graduate", "partner"] };
    const connection = { id: "graduate-feeds-partner", fromRef: "graduate", toRef: "partner", label: "learning feeds", assertion: "tentative" as const };
    projection.groups.push(group);
    projection.document.groups.push(group);
    projection.connections.push(connection);
    projection.document.connections.push(connection);

    const scene = projectAtlas(projection, lens);
    expect(scene.nodes.filter((node) => node.id.startsWith("architecture:"))).toHaveLength(projection.elements.length);
    expect(scene.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "group:entry-terrain", type: "architectureGroup", data: expect.objectContaining({ memberRefs: ["graduate", "partner"] }) }),
      expect.objectContaining({ id: "work:release-1", data: expect.objectContaining({ kind: "work", atWall: true }) }),
      expect.objectContaining({ id: "outcome:outcome-1", data: expect.objectContaining({ kind: "outcome", outcome: expect.objectContaining({ body: "Six qualified builders replied" }) }) }),
    ]));
    expect(scene.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "connection:graduate-feeds-partner", source: "architecture:graduate", target: "architecture:partner" }),
      expect.objectContaining({ id: "powers:proof:graduate", source: "architecture:proof", target: "architecture:graduate" }),
      expect.objectContaining({ id: "governs:first-drops:bet-1", source: "architecture:first-drops", target: "bet:bet-1" }),
      expect.objectContaining({ id: "staged:bet-1:release-1", source: "bet:bet-1", target: "work:release-1" }),
      expect.objectContaining({ id: "returned:release-1:outcome-1", source: "work:release-1", target: "outcome:outcome-1" }),
    ]));
    expect(scene.nodes.find((node) => node.id === "bet:bet-1")?.data.workflow).toBe(lens.bets[0].workflow);
    expect(scene.nodes.find((node) => node.id === "bet:bet-1")?.data.machineryCounts).toBe(lens.bets[0].machineryCounts);
  });

  it("projects the current theory inline and joins its stable subjects to real work", () => {
    const { projection, lens } = fixture();
    projection.workingTheory = {
      id: "theory-2", ventureId: "buffalo", mode: "working-theory", status: "current",
      supersedes: "theory-1", baseRevision: 4, intent: "A faster first success may unlock growth.",
      subjects: [{
        id: "first-value", name: "First value", statement: "A shorter path may help new users succeed.", assertion: "tentative",
        sourceRefs: ["repository:src/signup.ts#L10"], conversationRefs: ["conversation:message-1"], workRefs: ["release-1"],
      }],
      relationships: [],
      anchors: [{ subjectRef: "theory:first-value", sourceRefs: ["work:release-1"] }],
      sources: [{ ref: "repository:src/signup.ts#L10", kind: "repository", path: "src/signup.ts", startLine: 10, endLine: 14, excerpt: "signup", digest: "digest", observedAt: "2026-07-15T00:00:00Z" }],
      conversationRefs: ["conversation:message-1"], createdAt: "2026-07-15T00:00:00Z", proposedBy: { authority: "teammate", id: "mira" },
    };

    const scene = projectAtlas(projection, lens);
    expect(scene.nodes.find((node) => node.id === "atlas:intent")?.data).toMatchObject({
      title: "A faster first success may unlock growth.", provisional: true,
    });
    expect(scene.nodes.find((node) => node.id === "theory:first-value")?.data).toMatchObject({
      kind: "theory", provisional: true, theoryId: "theory-2", title: "First value",
    });
    expect(scene.edges).toContainEqual(expect.objectContaining({
      source: "theory:first-value", target: "work:release-1", className: "atlas-edge-theory-anchor",
    }));
    const focusableOrder = scene.nodes
      .filter((node) => ["theory", "bet", "work", "outcome", "wall"].includes(node.data.kind))
      .map((node) => node.id);
    expect(focusableOrder.indexOf("theory:first-value")).toBeLessThan(focusableOrder.indexOf("work:release-1"));
  });

  it("projects every bet, including an explicitly ungrouped bet", () => {
    const { projection, lens } = fixture();
    lens.bets.push({ ...lens.bets[0], id: "bet-unjoined", intent: "An ungrouped bet remains visible", position: "live", staged: [], stagedCount: 0 });
    const scene = projectAtlas(projection, lens);
    expect(scene.nodes.filter((node) => node.data.kind === "bet").map((node) => node.id)).toEqual(["bet:bet-1", "bet:bet-unjoined"]);
    expect(scene.nodes.find((node) => node.id === "bet:bet-1")?.data.motionLabel).toBe("Graduate entry");
    expect(scene.nodes.find((node) => node.id === "bet:bet-unjoined")?.data.motionLabel).toBe("No path named");
  });

  it("carries decision-band and path labels on the effort card without any orbit vocabulary", () => {
    const { projection, lens } = fixture();
    lens.bets.push({ ...lens.bets[0], id: "bet-near", intent: "New bet", position: "live", staged: [], evidence: [], events: [], latestOutcome: null, stagedCount: 0 });
    const scene = projectAtlas(projection, lens);
    // bet-1 is at the wall with a returned outcome → settled/approaching classification.
    expect(scene.nodes.find((node) => node.id === "bet:bet-1")?.data.decisionBand).toBe("approaching-wall");
    // A fresh bet with no staged work / evidence / events reads as near-intent.
    expect(scene.nodes.find((node) => node.id === "bet:bet-near")?.data.decisionBand).toBe("near-intent");
  });

  it("places every card collision-free once the layout engine positions the scene", () => {
    const { projection, lens } = fixture();
    // Seven bets across paths plus the ungrouped case — the dense field the composite targets.
    lens.bets = Array.from({ length: 7 }, (_, index) => ({
      ...lens.bets[0], id: `bet-${index + 1}`, intent: `Bet ${index + 1}`, position: "live" as const, staged: [], stagedCount: 0,
    }));
    const scene = projectAtlas(projection, lens);
    const { nodes } = layoutAtlasNodes(scene.nodes.map((node) => ({ ...node, measured: null })));
    const cards = nodes.filter((node) => ["bet", "intent", "wall", "teammate", "capability", "work", "outcome"].includes(node.data.kind));
    const size = (node: (typeof cards)[number]) => ({ w: (node.style?.width as number) ?? node.width ?? 180, h: (node.style?.height as number) ?? node.height ?? 180 });
    for (const [index, card] of cards.entries()) {
      const a = { ...card.position, ...size(card) };
      for (const other of cards.slice(index + 1)) {
        const b = { ...other.position, ...size(other) };
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlap, `${card.id} overlaps ${other.id}`).toBe(false);
      }
    }
  });

  it("stamps orbitSide on effort cards from the settled field, growing expansion toward open space", () => {
    const { projection, lens } = fixture();
    lens.bets = Array.from({ length: 6 }, (_, index) => ({
      ...lens.bets[0], id: `bet-${index + 1}`, intent: `Bet ${index + 1}`, position: "live" as const, staged: [], stagedCount: 0,
    }));
    const scene = projectAtlas(projection, lens);
    const { nodes } = layoutAtlasNodes(scene.nodes.map((node) => ({ ...node, measured: null })));
    const efforts = nodes.filter((node) => node.data.kind === "bet");
    // Every effort carries a resolved side, and the field has cards on both sides (hub-centered ring).
    expect(efforts.every((node) => node.data.orbitSide === "left" || node.data.orbitSide === "right")).toBe(true);
    expect(new Set(efforts.map((node) => node.data.orbitSide)).size).toBe(2);
  });

  it("keeps one quiet wall boundary even when no outward act is waiting", () => {
    const { projection, lens } = fixture();
    lens.wall = { count: 0, oldestParkedAt: null };
    lens.wallItems = [];
    projection.joins.wall = [];
    const scene = projectAtlas(projection, lens);
    expect(scene.nodes.filter((node) => node.id === "atlas:wall")).toHaveLength(1);
    expect(scene.nodes.find((node) => node.id === "atlas:wall")?.data).toMatchObject({
      active: false,
      statement: "Outward acts stop here",
    });
  });

  it("unfolds only machinery backed by bet artifacts, wall items, and outcomes", () => {
    const { projection, lens } = fixture();
    const scene = projectAtlas(projection, lens);
    const bet = scene.nodes.find((node) => node.id === "bet:bet-1")!;
    expect(bet.data.workflow).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Opened", state: "done" }),
      expect.objectContaining({ label: "Project-drop invitation v1", state: "gate" }),
      expect.objectContaining({ label: "Six qualified builders replied", state: "done" }),
    ]));
    expect(bet.data.machineryCounts).toEqual([
      { label: "staged", count: 1 }, { label: "at wall", count: 1 }, { label: "outcomes", count: 1 },
    ]);
    expect(scene.nodes.find((node) => node.id === "atlas:wall")?.data.statement).toBe("1 outward act held for your decision");
  });

  it("shows an honest zero-bet intent state", () => {
    const { projection, lens } = fixture();
    lens.bets = [];
    const scene = projectAtlas(projection, lens);
    expect(scene.nodes.filter((node) => node.data.kind === "bet")).toHaveLength(0);
    expect(scene.nodes.find((node) => node.id === "atlas:intent")?.data.betCount).toBe(0);
  });

  it("keeps every bet visible even when architecture is unavailable", () => {
    const { lens } = fixture();
    const scene = projectAtlas(null, lens);
    expect(scene.nodes.filter((node) => node.data.kind === "bet").map((node) => node.id)).toEqual(["bet:bet-1"]);
    expect(scene.nodes.find((node) => node.id === "bet:bet-1")?.data.motionLabel).toBe("No path named");
    expect(scene.nodes.find((node) => node.id === "atlas:intent")?.data).toMatchObject({ title: "What should change?", intentNamed: false });
  });

  it("renders a teammate and capability as engine-placed cards (never founder-dragged)", () => {
    const { projection, lens } = fixture();
    lens.crew = [{ ref: "mira", summonedAt: "2026-07-15T00:00:00Z", soul: { name: "Mira" } }];
    const scene = projectAtlas(projection, lens, { capabilities: [{ id: "product-truth", name: "Product truth", description: "Cited repository context", authority: "read" }] });
    const teammate = scene.nodes.find((node) => node.id === "crew:mira");
    const capability = scene.nodes.find((node) => node.id === "capability:product-truth");
    expect(teammate?.draggable).toBe(false);
    expect(capability?.draggable).toBe(false);
    expect(capability?.data).toMatchObject({ title: "Product truth", authority: "read" });
  });
});
