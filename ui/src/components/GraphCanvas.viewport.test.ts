import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(`${process.cwd()}/src/components/GraphCanvas.tsx`, "utf8");
const gateCss = readFileSync(`${process.cwd()}/src/styles/canvas-gate.css`, "utf8");

describe("GraphCanvas viewport framing", () => {
  it("opens the founder gate as a centered modal portaled over a dimmed canvas", () => {
    // The Base UI dialog portals outside React Flow's viewport transform, owns focus/Escape/return, and
    // renders over the existing .cgate-stage-overlay scrim rather than sprawling from a canvas node.
    expect(source).toContain("<Dialog open={reviewOpen && !!result}");
    expect(source).toContain('overlayClassName="cgate-stage-overlay"');
    expect(source).toContain("cgate-wall-attached cgate-review-modal");
    expect(source).toContain("<DialogTitle");
    expect(source).not.toContain("createPortal(");
    expect(gateCss).toContain(".cgate-review-modal");
    // The old node-attached toolbar placement is gone.
    expect(source).not.toContain("function gateToolbarPlacement");
  });

  it("uses pane dimensions and occupied panel space for focus framing", () => {
    expect(source).toContain("function resolveCanvasFrame");
    expect(source).toContain("const panelInset = panelOpen ? Math.min(360, width * 0.34) : 0");
    expect(source).toContain("x: (resolved.right - resolved.left) / 2");
    expect(source).toContain("const width = useStore((state) => state.width)");
    expect(source).toContain("const height = useStore((state) => state.height)");
    expect(source).toContain("suspended={!!operatorCursor || !!wovenFocus}");
    expect(source).toContain("if (attempts < 30) timer = window.setTimeout(focus, 80)");
    expect(source).toContain("if (timer != null) window.clearTimeout(timer)");
    expect(source).toContain("if (!measuredWidth || !measuredHeight)");
    expect(source).toContain("node.position.x + 120 + frame.offset.x / zoom");
    expect(source).toContain('const signature = `${receiptKey ?? "canvas"}:${viewport.x}:${viewport.y}:${viewport.zoom}`');
  });

  it("keeps automatic narrow framing above card readability", () => {
    expect(source).toContain("maxZoom: 0.88, minZoom: 0.68");
    expect(source).toContain("maxZoom: 0.84, minZoom: 0.62");
    expect(source).toContain("maxZoom: 0.8, minZoom: 0.56");
    expect(source).not.toContain("maxZoom: 0.82, minZoom: 0.24");
  });

  it("consumes explicit lane pans once per navigation token", () => {
    expect(source).toContain("consumedToken.current === panTo.token");
    expect(source).toContain("consumedToken.current = panTo.token");
    expect(source).toContain("if (attempts < 30)");
    expect(source).toContain("timer = window.setTimeout(pan, 80)");
  });

  it("keeps the authoritative focused graph in the merged projection", () => {
    expect(source).toContain("mergedGraphs.set(focusedChannelId, graph)");
    expect(source).toContain("mergedRunResults.set(focusedChannelId, result)");
    expect(source).toContain("channelId: focusedChannelId");
  });

  it("keeps a complete blocked-state receipt when dense nodes are virtualized", () => {
    expect(source).toContain("const blockedNodeCount = nodes.reduce");
    expect(source).toContain('getStatus(data.node, data.result, data.running) === "blocked"');
    expect(source).toContain("data-canvas-blocked-node-count={blockedNodeCount}");
  });

  it("drives the crew cursor from the rendered merged-lane coordinates", () => {
    expect(source).toContain("const projectedByNodeId = new Map<string, Node>()");
    expect(source).toContain("projectedByNodeId.set(data.node.id, projected)");
    expect(source).toContain("projected ? { ...node, position: projected.position } : node");
  });

  it("frames each pending founder wall from its durable RF position", () => {
    expect(source).toContain("function FounderGateFocuser");
    expect(source).toContain("applied.current === receiptKey");
    expect(source).toContain("state.nodeLookup.get(targetId)?.measured.width");
    expect(source).toContain("const targetVisible = !!target");
    expect(source).toContain("window.setTimeout(() => { applied.current = receiptKey; }, 360)");
    expect(source).toContain("{ zoom, duration: 0 }");
    expect(source).toContain("<FounderGateFocuser target={pendingGateProjection}");
    expect(source).toContain("data?.graphId === graph.id && data.node?.id === gateId");
  });

  it("keeps React Flow size subscriptions primitive to avoid update-loop regressions", () => {
    expect(source).toContain("const size = useMemo(() => ({ width, height }), [width, height])");
    expect(source).not.toMatch(/useStore\(\(state\) => \(\{\s*width: state\.width,\s*height: state\.height/);
  });
});
