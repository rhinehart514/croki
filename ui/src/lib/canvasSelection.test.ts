import { describe, expect, it } from "vitest";
import type { GTMGraph, GTMNode, WovenRef } from "@/types";
import { graphNodeSelectionId, operatorContextForCanvasSelection, resolveCanvasSelection, workbenchRefForCanvasSelection } from "./canvasSelection";

function node(id: string, category: GTMNode["category"]): GTMNode {
  return { id, category, label: id, position: { x: 0, y: 0 }, config: {} };
}

function graph(id: string, nodes: GTMNode[]): GTMGraph {
  return { id, name: id, version: "1", nodes, edges: [] };
}

const channelGraphs = new Map([
  ["channel-b", graph("graph-b", [node("draft", "generate"), node("review", "gate")])],
  ["channel-a", graph("graph-a", [node("research", "source")])],
]);

const base = {
  selection: null,
  selectedNodeIds: [] as string[],
  wovenFocus: null,
  activeChannelId: null,
  channelGraphs,
};

describe("graphNodeSelectionId", () => {
  it("uses the channel map key when a caller supplies the graph id", () => {
    expect(graphNodeSelectionId("review", "graph-b", channelGraphs)).toBe("channel-b::review");
  });

  it("preserves channel ids and already namespaced selections", () => {
    expect(graphNodeSelectionId("review", "channel-b", channelGraphs)).toBe("channel-b::review");
    expect(graphNodeSelectionId("channel-b::review", "graph-a", channelGraphs)).toBe("channel-b::review");
  });
});

describe("resolveCanvasSelection", () => {
  it("classifies an empty canvas selection", () => {
    expect(resolveCanvasSelection(base)).toEqual({ kind: "none" });
  });

  it("classifies and sorts a multi-selection before any other focus", () => {
    expect(resolveCanvasSelection({
      ...base,
      selection: "channel-b::review",
      selectedNodeIds: ["canchor:z", "canchor:a", "canchor:z"],
      wovenFocus: { kind: "lane", channelId: "channel-a" },
      activeChannelId: "channel-b",
    })).toEqual({ kind: "multi", nodeIds: ["canchor:a", "canchor:z"] });
  });

  it("preserves woven anchor and relationship descriptors", () => {
    const ref: WovenRef = { type: "goal", id: "goal-1" };
    expect(resolveCanvasSelection({
      ...base,
      wovenFocus: { kind: "anchor", anchorId: "canchor:goal:goal-1", ref },
      activeChannelId: "channel-b",
    })).toEqual({ kind: "anchor", anchorId: "canchor:goal:goal-1", ref });

    const relationship = {
      kind: "relationship" as const,
      relationshipId: "relationship-1",
      relationshipRef: { type: "goal-relation" as const, id: "relation-1" },
      source: ref,
      target: { type: "work-artifact", id: "work-1" },
    };
    expect(resolveCanvasSelection({
      ...base,
      wovenFocus: relationship,
      activeChannelId: "channel-b",
    })).toEqual(relationship);
  });

  it("classifies selected graph nodes as steps or gates", () => {
    expect(resolveCanvasSelection({
      ...base,
      selection: "channel-b::draft",
      activeChannelId: "channel-a",
    })).toMatchObject({ kind: "step", channelId: "channel-b", nodeId: "draft" });

    expect(resolveCanvasSelection({
      ...base,
      selection: "graph-b::review",
      activeChannelId: "channel-a",
    })).toMatchObject({ kind: "gate", channelId: "channel-b", nodeId: "review" });
  });

  it("lets an explicit founder wall selection supersede retained terrain context", () => {
    expect(resolveCanvasSelection({
      ...base,
      selection: "channel-b::review",
      wovenFocus: { kind: "anchor", anchorId: "canchor:goal:goal-1", ref: { type: "goal", id: "goal-1" } },
      activeChannelId: "channel-b",
    })).toMatchObject({ kind: "gate", channelId: "channel-b", nodeId: "review" });
  });

  it("uses the active lane to resolve a bare selected node", () => {
    expect(resolveCanvasSelection({
      ...base,
      selection: "draft",
      activeChannelId: "channel-b",
    })).toMatchObject({ kind: "step", channelId: "channel-b", nodeId: "draft" });
  });

  it("uses a lone selected node id when the single-selection value is absent", () => {
    expect(resolveCanvasSelection({
      ...base,
      selectedNodeIds: ["channel-b::review"],
    })).toMatchObject({ kind: "gate", channelId: "channel-b", nodeId: "review" });
  });

  it("classifies explicit and restored lane focus", () => {
    expect(resolveCanvasSelection({
      ...base,
      wovenFocus: { kind: "lane", channelId: "channel-a" },
      activeChannelId: "channel-b",
    })).toEqual({ kind: "lane", channelId: "channel-a", source: "focus" });

    expect(resolveCanvasSelection({
      ...base,
      activeChannelId: "channel-b",
    })).toEqual({ kind: "lane", channelId: "channel-b", source: "active" });
  });

  it("does not turn activeChannelId into a lane when another explicit selection exists", () => {
    expect(resolveCanvasSelection({
      ...base,
      selection: "missing-node",
      activeChannelId: "channel-b",
    })).toEqual({ kind: "none" });

    expect(resolveCanvasSelection({
      ...base,
      wovenFocus: { kind: "object", objectKey: "person:1" },
      activeChannelId: "channel-b",
    })).toEqual({ kind: "object", objectKey: "person:1" });
  });

  it("qualifies selected graph steps by their owning pipeline for operator context", () => {
    const selected = resolveCanvasSelection({
      ...base,
      selection: "channel-b::review",
      activeChannelId: "channel-a",
    });

    expect(operatorContextForCanvasSelection(selected)).toEqual({
      surface: "pipeline",
      focusRef: "graph-step:channel-b:review",
      contextRefs: ["pipeline:channel-b", "graph-step:channel-b:review"],
      threadRef: "pipeline:channel-b",
    });
  });

  it("carries normalized multi-selection and question fallback into operator context", () => {
    expect(operatorContextForCanvasSelection({ kind: "multi", nodeIds: ["channel-a::research", "channel-b::draft"] })).toEqual({
      surface: "terrain",
      focusRef: null,
      contextRefs: ["canvas-node:channel-a::research", "canvas-node:channel-b::draft"],
      threadRef: "project",
    });
    expect(operatorContextForCanvasSelection({ kind: "none" }, "question-1")).toMatchObject({
      focusRef: "question:question-1",
      threadRef: "question:question-1",
    });
  });

  it("opens ordinary editable goals and work artifacts in the canonical workbench", () => {
    expect(workbenchRefForCanvasSelection({
      kind: "anchor",
      anchorId: "goal",
      ref: { type: "goal", id: "goal-1" },
    })).toEqual({ type: "goal", id: "goal-1" });
    expect(workbenchRefForCanvasSelection({
      kind: "anchor",
      anchorId: "artifact",
      ref: { type: "work-artifact", id: "artifact-1" },
    })).toEqual({ type: "work-artifact", id: "artifact-1" });
    expect(workbenchRefForCanvasSelection({ kind: "object", objectKey: "person:1" })).toBeNull();
  });
});
