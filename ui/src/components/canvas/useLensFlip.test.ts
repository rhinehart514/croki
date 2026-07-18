import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Node, ReactFlowInstance } from "@xyflow/react";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import * as api from "@/api";
import { foldPlacement } from "./canvasSeedLayout";
import { useLensFlip } from "./useLensFlip";

// A spy on putPlacement: the lens must NEVER persist its layout (Law 6, the marquee risk). The whole
// module is real; we only observe that this one call is never made across enter → cycle → exit.
vi.spyOn(api, "putPlacement");

function sceneNode(id: string, kind: string, position = { x: 0, y: 0 }): AtlasNode {
  return { id, position, data: { kind } } as unknown as AtlasNode;
}

const SCENE: AtlasNode[] = [
  sceneNode("atlas:intent", "intent"),
  sceneNode("bet:a", "bet"),
  sceneNode("bet:b", "bet"),
  sceneNode("atlas:wall", "wall"),
];

// A stored founder placement — the ONLY thing restore is allowed to read positions from.
const FOUNDER_PLACEMENT = { "bet:a": { x: 111, y: 222 }, "bet:b": { x: 333, y: 444 } };

const LENS: FirmLens = {
  ventureId: "v", crew: [],
  bets: [
    { id: "a", ventureId: "v", intent: "A", staged: [], evidence: [], events: [], position: "live" },
    { id: "b", ventureId: "v", intent: "B", staged: [], evidence: [], events: [], position: "live" },
  ] as unknown as FirmLens["bets"],
  outcomes: [], wallItems: [], wall: { count: 0 },
  placement: { positions: FOUNDER_PLACEMENT, revision: 1 },
};

const PROJECTION = {
  ventureId: "v", revision: 1, elements: [], connections: [], groups: [], evidenceAnnotations: [], pressure: [],
  joins: { bets: [], work: [], wall: [], outcomes: [] },
} as unknown as FirmArchitectureProjection;

function makeInstance(): ReactFlowInstance {
  return {
    getViewport: () => ({ x: 10, y: 20, zoom: 0.7 }),
    setViewport: vi.fn(),
  } as unknown as ReactFlowInstance;
}

function harness() {
  let nodes = SCENE.map((node) => ({ ...node }));
  const setNodes = vi.fn((updater: (n: AtlasNode[]) => AtlasNode[]) => { nodes = updater(nodes); });
  const instance = makeInstance();
  const hook = renderHook(() => useLensFlip({
    instance,
    sceneNodes: SCENE,
    placementPositions: FOUNDER_PLACEMENT,
    lens: LENS,
    projection: PROJECTION,
    setNodes,
  }));
  return { hook, setNodes, instance, currentNodes: () => nodes };
}

describe("useLensFlip", () => {
  beforeEach(() => { vi.mocked(api.putPlacement).mockClear(); });

  it("NEVER calls putPlacement across enter → cycle → exit (Law 6)", () => {
    const { hook } = harness();
    act(() => { hook.result.current.enter("understand"); });
    act(() => { hook.result.current.enter("design"); });
    act(() => { hook.result.current.enter("execute"); });
    act(() => { hook.result.current.restore(); });
    expect(api.putPlacement).not.toHaveBeenCalled();
  });

  it("restore reads positions from foldPlacement (the founder store), never lens positions", () => {
    const { hook, currentNodes } = harness();
    // Enter a lens (moves nodes off their founder spots), then restore.
    act(() => { hook.result.current.enter("execute"); });
    act(() => { hook.result.current.restore(); });
    const expected = foldPlacement(SCENE as unknown as Node[], FOUNDER_PLACEMENT);
    const nodesNow = currentNodes();
    // Every node landed on its foldPlacement position (founder positions win; unstored take the seed).
    for (const node of nodesNow) {
      expect(node.position).toEqual(expected[node.id]);
    }
    // The founder positions specifically are the exact stored coordinates.
    expect(nodesNow.find((n) => n.id === "bet:a")!.position).toEqual({ x: 111, y: 222 });
    expect(nodesNow.find((n) => n.id === "bet:b")!.position).toEqual({ x: 333, y: 444 });
  });

  it("restore returns the camera to the free viewport captured before the first enter", () => {
    const { hook, instance } = harness();
    act(() => { hook.result.current.enter("understand"); });
    act(() => { hook.result.current.restore(); });
    expect(instance.setViewport).toHaveBeenCalledWith({ x: 10, y: 20, zoom: 0.7 }, { duration: 0 });
  });
});
