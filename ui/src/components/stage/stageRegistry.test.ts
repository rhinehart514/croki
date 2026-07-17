import { describe, expect, it } from "vitest";
import type { FirmBet, FirmLens } from "@/types";
import type { FirmActiveDrive, WallQueueItemView } from "@/api";
import { targetBet, targetWork } from "@/components/firm/directionTarget";
import { projectStageContext, type StageContext } from "./projectStageContext";
import { buildStageWorkspaces, getStageWorkspace, type StageWorkspace } from "./stageRegistry";

const DIFF = ["diff --git a/x.ts b/x.ts", "@@ -1 +1 @@", "-a", "+b"].join("\n");
const NO_DRIVES: FirmActiveDrive[] = [];

function bet(partial: Partial<FirmBet> & Pick<FirmBet, "id" | "intent">): FirmBet {
  return {
    ventureId: "v1", forkedFrom: null, teammateRef: "t1", refs: [], evidence: [], staged: [],
    joinKey: `j-${partial.id}`, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    endedAt: null, endedBy: null, learning: null, position: "live", stagedCount: 0, latestOutcome: null,
    ...partial,
  } as FirmBet;
}

function lens(bets: FirmBet[], extra: Partial<FirmLens> = {}): FirmLens {
  return { ventureId: "v1", crew: [], bets, outcomes: [], wallItems: [], wall: { count: 0, oldestParkedAt: null }, placement: { positions: {}, revision: 0 }, ...extra } as FirmLens;
}

// A founder message opens each bet's direction so buildDirections resolves membership from a betId.
function messages(bets: FirmBet[]) {
  return bets.map((b, i) => ({
    id: `m-${b.id}`, ventureId: "v1", role: "founder" as const, content: b.intent,
    teammateRef: null, betId: b.id, createdAt: `2026-01-01T0${i}:00:00Z`,
  }));
}

function ctxFor(bets: FirmBet[], selection: ReturnType<typeof targetBet>, wall: WallQueueItemView[] = []): StageContext {
  return projectStageContext("v1", selection, lens(bets, { wallItems: wall }), messages(bets), NO_DRIVES, null, null);
}

describe("projectStageContext", () => {
  it("resolves a betId selection to its owning direction and DirectionRenderContext", () => {
    const stage = ctxFor([bet({ id: "b1", intent: "Reach the first buyers" })], targetBet("b1"));
    expect(stage.direction?.betIds).toContain("b1");
    expect(stage.ctx?.memberBets.map((m) => m.id)).toEqual(["b1"]);
  });

  it("resolves a workRef selection to the specific staged artifact (a diff → focusedExactChange)", () => {
    const b = bet({ id: "b1", intent: "root", staged: [{ id: "w1", content: DIFF }] });
    const stage = ctxFor([b], targetWork("b1", "w1"));
    expect(stage.focusedArtifact?.kind).toBe("diff");
    expect(stage.focusedExactChange?.diff).toBe(DIFF);
  });

  it("carries waiting wall items scoped to the selection", () => {
    const wall = [{ id: "wall1", ventureId: "v1", betId: "b1", purpose: "release", blocksBet: true, effect: { kind: "product-change", diff: DIFF }, parkedAt: "2026-01-01", decision: null } as WallQueueItemView];
    const stage = ctxFor([bet({ id: "b1", intent: "root" })], targetBet("b1"), wall);
    expect(stage.waiting.map((w) => w.id)).toEqual(["wall1"]);
  });
});

describe("buildStageWorkspaces — the center adapts to the work", () => {
  it("makes CONSEQUENCE the default when a waiting outward act is scoped to the selection", () => {
    const wall = [{ id: "wall1", ventureId: "v1", betId: "b1", purpose: "release", blocksBet: true, effect: { kind: "deploy", to: "list" }, parkedAt: "2026-01-01", decision: null } as WallQueueItemView];
    const stage = ctxFor([bet({ id: "b1", intent: "root" })], targetBet("b1"), wall);
    const list = buildStageWorkspaces(stage);
    expect(list[0].id).toBe("consequence");
  });

  it("offers PRODUCT-ARTIFACT when a staged diff exists (the diff/tests/preview body)", () => {
    const b = bet({ id: "b1", intent: "root", staged: [{ id: "w1", content: DIFF }] });
    const ids = buildStageWorkspaces(ctxFor([b], targetBet("b1"))).map((w) => w.id);
    expect(ids).toContain("product-artifact");
  });

  it("offers COMPARISON only when more than one open sibling exists", () => {
    const single = buildStageWorkspaces(ctxFor([bet({ id: "b1", intent: "root" })], targetBet("b1"))).map((w) => w.id);
    expect(single).not.toContain("comparison");
    const siblings = [bet({ id: "b1", intent: "root" }), bet({ id: "b2", intent: "sibling", forkedFrom: "b1" })];
    const two = buildStageWorkspaces(ctxFor(siblings, targetBet("b1"))).map((w) => w.id);
    expect(two).toContain("comparison");
  });

  it("gates the campaign/experiment/research STUBS false on today's data (no dead chips)", () => {
    const ids = buildStageWorkspaces(ctxFor([bet({ id: "b1", intent: "root" })], targetBet("b1"))).map((w) => w.id);
    expect(ids).not.toContain("campaign");
    expect(ids).not.toContain("experiment");
    expect(ids).not.toContain("research");
  });

  it("always ends in the guaranteed OVERVIEW default, so getStageWorkspace is never blank", () => {
    const stage = ctxFor([bet({ id: "b1", intent: "root" })], targetBet("b1"));
    const list = buildStageWorkspaces(stage);
    expect(list.some((w) => w.id === "overview")).toBe(true);
    expect(getStageWorkspace(list, "missing-id")).toBeTruthy();
    expect(getStageWorkspace(list, "missing-id").id).toBe(list[0].id);
  });
});

describe("the registry is OPEN — no central enum edit to add a workspace", () => {
  it("accepts a new plain-object workspace appended to a seed and selects it with no host change", () => {
    // A synthetic registry list is exactly what buildStageWorkspaces returns plus one appended object —
    // proving the host chooses the workspace from the list, not from a closed kind switch.
    const stage = ctxFor([bet({ id: "b1", intent: "root" })], targetBet("b1"));
    const extra: StageWorkspace = { id: "anything", label: "Anything", available: () => true, render: () => null };
    const list = [...buildStageWorkspaces(stage), extra];
    expect(getStageWorkspace(list, "anything").id).toBe("anything");
    expect(getStageWorkspace(list, "anything").label).toBe("Anything");
  });
});
