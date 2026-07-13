import type { GTMGraph, GTMNode, WovenRef } from "@/types";
import type { WovenFocus } from "@/lib/wovenOverlay";
import type { StableRef } from "@/openCanvasTypes";

export type CanvasSelectionDescriptor =
  | { kind: "none" }
  | { kind: "multi"; nodeIds: readonly string[] }
  | { kind: "object"; objectKey: string }
  | { kind: "cluster"; motionKind: string }
  | { kind: "anchor"; anchorId: string; ref?: WovenRef }
  | {
      kind: "relationship";
      relationshipId: string;
      relationshipRef: { type: "goal-relation" | "work-relationship"; id: string };
      source: WovenRef;
      target: WovenRef;
    }
  | { kind: "step"; channelId: string; nodeId: string; node: GTMNode }
  | { kind: "gate"; channelId: string; nodeId: string; node: GTMNode }
  | { kind: "lane"; channelId: string; source: "focus" | "active" };

export type ResolveCanvasSelectionInput = {
  selection: string | null;
  selectedNodeIds?: Iterable<string>;
  wovenFocus: WovenFocus;
  activeChannelId: string | null;
  channelGraphs: ReadonlyMap<string, GTMGraph>;
};

type ResolvedGraphNode = { channelId: string; node: GTMNode };

export function graphNodeSelectionId(
  nodeId: string,
  channelOrGraphId: string | null,
  channelGraphs: ReadonlyMap<string, GTMGraph>,
): string {
  if (nodeId.includes("::") || !channelOrGraphId) return nodeId;
  const channelId = channelGraphs.has(channelOrGraphId)
    ? channelOrGraphId
    : [...channelGraphs].find(([, graph]) => graph.id === channelOrGraphId)?.[0] ?? channelOrGraphId;
  return `${channelId}::${nodeId}`;
}

function findGraphNode(
  selection: string,
  activeChannelId: string | null,
  channelGraphs: ReadonlyMap<string, GTMGraph>,
): ResolvedGraphNode | null {
  const separator = selection.indexOf("::");
  if (separator !== -1) {
    const namespace = selection.slice(0, separator);
    const nodeId = selection.slice(separator + 2);
    for (const [channelId, graph] of channelGraphs) {
      if (channelId !== namespace && graph.id !== namespace) continue;
      const node = graph.nodes.find((candidate) => candidate.id === nodeId);
      return node ? { channelId, node } : null;
    }
    return null;
  }

  if (activeChannelId) {
    const activeNode = channelGraphs.get(activeChannelId)?.nodes.find((node) => node.id === selection);
    if (activeNode) return { channelId: activeChannelId, node: activeNode };
  }

  for (const channelId of [...channelGraphs.keys()].sort()) {
    const node = channelGraphs.get(channelId)?.nodes.find((candidate) => candidate.id === selection);
    if (node) return { channelId, node };
  }
  return null;
}

export type CanvasSelectionOperatorContext = {
  surface: "terrain" | "pipeline";
  focusRef: string | null;
  contextRefs: string[];
  threadRef: string;
};

function refString(ref: WovenRef | undefined): string | null {
  return ref?.type && ref.id ? `${ref.type}:${ref.id}` : null;
}

export function operatorContextForCanvasSelection(
  selection: CanvasSelectionDescriptor,
  focusedQuestionId: string | null = null,
): CanvasSelectionOperatorContext {
  if (selection.kind === "step" || selection.kind === "gate") {
    const focusRef = `graph-step:${selection.channelId}:${selection.nodeId}`;
    return {
      surface: "pipeline",
      focusRef,
      contextRefs: [`pipeline:${selection.channelId}`, focusRef],
      threadRef: `pipeline:${selection.channelId}`,
    };
  }
  if (selection.kind === "lane") {
    const focusRef = `pipeline:${selection.channelId}`;
    return { surface: "pipeline", focusRef, contextRefs: [focusRef], threadRef: focusRef };
  }
  if (selection.kind === "anchor") {
    const focusRef = refString(selection.ref);
    return {
      surface: "terrain",
      focusRef,
      contextRefs: focusRef ? [focusRef] : [],
      threadRef: focusRef && /^(?:goal|work-artifact|work-region):/.test(focusRef) ? focusRef : "project",
    };
  }
  if (selection.kind === "relationship") {
    const focusRef = `${selection.relationshipRef.type}:${selection.relationshipRef.id}`;
    return { surface: "terrain", focusRef, contextRefs: [focusRef], threadRef: "project" };
  }
  if (selection.kind === "object") {
    const focusRef = `object:${selection.objectKey}`;
    return { surface: "terrain", focusRef, contextRefs: [focusRef], threadRef: "project" };
  }
  if (selection.kind === "cluster") {
    const focusRef = `motion:${selection.motionKind}`;
    return { surface: "terrain", focusRef, contextRefs: [focusRef], threadRef: "project" };
  }
  if (selection.kind === "multi") {
    return {
      surface: "terrain",
      focusRef: null,
      contextRefs: selection.nodeIds.map((nodeId) => `canvas-node:${nodeId}`),
      threadRef: "project",
    };
  }
  const questionRef = focusedQuestionId ? `question:${focusedQuestionId}` : null;
  return {
    surface: "terrain",
    focusRef: questionRef,
    contextRefs: questionRef ? [questionRef] : [],
    threadRef: questionRef ?? "project",
  };
}

const WORKBENCH_ANCHOR_TYPES = new Set(["goal", "work-artifact", "work-region", "product-change"]);

export function workbenchRefForCanvasSelection(selection: CanvasSelectionDescriptor): StableRef | null {
  return selection.kind === "anchor" && selection.ref?.type && WORKBENCH_ANCHOR_TYPES.has(selection.ref.type)
    ? { type: selection.ref.type, id: selection.ref.id }
    : null;
}

export function resolveCanvasSelection({
  selection,
  selectedNodeIds,
  wovenFocus,
  activeChannelId,
  channelGraphs,
}: ResolveCanvasSelectionInput): CanvasSelectionDescriptor {
  const multiSelection = [...new Set(selectedNodeIds ?? [])].sort();
  if (multiSelection.length > 1) return { kind: "multi", nodeIds: multiSelection };

  // A graph card selected in the live flow is the immediate address, even when a retained terrain anchor
  // still records where the founder came from. This is critical at the founder wall: the camera, review,
  // composer, and operator context must all agree that the gate—not its originating hypothesis—is active.
  if (selection) {
    const resolved = findGraphNode(selection, activeChannelId, channelGraphs);
    if (!resolved) return { kind: "none" };
    const descriptor = {
      channelId: resolved.channelId,
      nodeId: resolved.node.id,
      node: resolved.node,
    };
    return resolved.node.category === "gate"
      ? { kind: "gate", ...descriptor }
      : { kind: "step", ...descriptor };
  }

  if (wovenFocus) {
    if (wovenFocus.kind === "lane") {
      return { kind: "lane", channelId: wovenFocus.channelId, source: "focus" };
    }
    return wovenFocus;
  }

  const graphSelection = multiSelection[0] ?? null;
  if (graphSelection) {
    const resolved = findGraphNode(graphSelection, activeChannelId, channelGraphs);
    if (!resolved) return { kind: "none" };
    const descriptor = {
      channelId: resolved.channelId,
      nodeId: resolved.node.id,
      node: resolved.node,
    };
    return resolved.node.category === "gate"
      ? { kind: "gate", ...descriptor }
      : { kind: "step", ...descriptor };
  }

  if (activeChannelId) return { kind: "lane", channelId: activeChannelId, source: "active" };
  return { kind: "none" };
}
