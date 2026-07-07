// Canvas structural-edit history — the undo/redo foundation for the working GTM graph.
//
// This is the prerequisite for "Claude acts freely on the board, the founder undoes." Every structural
// move on a pipeline's graph — add / move / connect / delete a node or edge — is captured here as a
// reversible entry with a plain-English label ("Connected Buyer to Draft", "Added a gate"). BOTH the
// founder's own edits (drag, connect, delete) and the crew's edits (the operator revising the board)
// funnel through the same history, so an agent move is undoable exactly like a founder move.
//
// Scope is deliberately the graph STRUCTURE only: nodes and edges (their identity, wiring, label,
// config, position). It never touches runs, sends, or gate decisions — those are not undoable here.
//
// Snapshots are cheap: GTMGraph is immutably replaced on every mutation, so an old reference is a
// complete, still-valid snapshot. Undo restores a prior snapshot; redo re-applies the later one.

import { useCallback, useRef, useState } from "react";
import type { GraphOperation, GTMGraph, GTMNode } from "@/types";
import { humanizeRef } from "@/lib/agentPersona";

// Who made the edit — drives the receipt's dot and, when a specific crew agent is known, its family
// tint. Founder edits read monochrome; crew edits carry the agent's tint when `agentRef` is threaded.
export type CanvasEditActor = { by: "you" } | { by: "claude"; agentRef?: string };

export type CanvasEdit = {
  id: string;
  label: string;            // plain-English receipt, e.g. "Connected Buyer to Draft"
  actor: CanvasEditActor;
  at: number;               // epoch ms
  before: GTMGraph;         // full snapshot to restore on undo
  after: GTMGraph;          // full snapshot to restore on redo
};

// Per-pipeline history. `edits[0..index-1]` are the applied edits; `index` is the cursor. Undo walks
// the cursor back (restoring that edit's `before`); redo walks it forward (restoring the `after`).
type ChannelHistory = { edits: CanvasEdit[]; index: number };

const EMPTY: ChannelHistory = { edits: [], index: 0 };

// ── Plain-English labels ─────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// The founder-facing name of a node — never a code identifier. Prefer the authored label, then a
// humanized agent/skill ref, then the humanized kind or category.
function nodeName(node: GTMNode | undefined): string {
  if (!node) return "a step";
  const label = node.label?.trim();
  if (label) return label;
  if (node.ref) return humanizeRef(node.ref);
  if (node.kind && node.kind !== "tool") return capitalize(node.kind);
  return capitalize(node.category);
}

function nodeById(graph: GTMGraph | undefined, id: string): GTMNode | undefined {
  return graph?.nodes.find((n) => n.id === id);
}

// Describe a batch of typed graph operations as one receipt line. `base` is the pre-mutation graph,
// used to resolve names for removals and disconnects (the node/edge is gone from the result).
export function describeOperations(ops: GraphOperation[], base: GTMGraph | null): string {
  const one = (op: GraphOperation): string => {
    switch (op.type) {
      case "add_node":
        return `Added ${nodeName(op.node)}`;
      case "remove_node":
        return `Removed ${nodeName(nodeById(base ?? undefined, op.nodeId))}`;
      case "connect_nodes": {
        const src = nodeName(nodeById(base ?? undefined, op.edge.source));
        const tgt = nodeName(nodeById(base ?? undefined, op.edge.target));
        return `Connected ${src} to ${tgt}`;
      }
      case "disconnect_nodes": {
        const edge = base?.edges.find((e) => e.id === op.edgeId);
        if (!edge) return "Removed a connection";
        const src = nodeName(nodeById(base ?? undefined, edge.source));
        const tgt = nodeName(nodeById(base ?? undefined, edge.target));
        return `Disconnected ${src} from ${tgt}`;
      }
      case "update_node": {
        const node = nodeById(base ?? undefined, op.nodeId);
        if (typeof op.patch.label === "string" && op.patch.label.trim()) {
          return `Renamed to ${op.patch.label.trim()}`;
        }
        return `Edited ${nodeName(node)}`;
      }
      case "set_graph_name":
        return "Renamed the pipeline";
      default:
        return "Changed the board";
    }
  };
  if (ops.length === 0) return "Changed the board";
  // Ghost-accept commits an add plus its connecting edges in one batch — read it as the add.
  const add = ops.find((o) => o.type === "add_node");
  if (add && ops.every((o) => o.type === "add_node" || o.type === "connect_nodes")) {
    return one(add);
  }
  const unique = Array.from(new Set(ops.map(one)));
  if (unique.length === 1) return unique[0];
  return `${unique[0]} (+${unique.length - 1} more)`;
}

// A structural signature over nodes + edges — identity, wiring, label, config, position. Two graphs
// with the same signature carry no undoable structural difference (a pure run/store update, say, is
// invisible here). Used to decide whether a whole-graph replacement is worth recording, and to label it.
function structuralSig(graph: GTMGraph): string {
  const nodes = graph.nodes
    .map((n) => `${n.id}|${n.label}|${n.category}|${n.kind ?? ""}|${n.ref ?? ""}|${n.connector ?? ""}|${n.position?.x ?? 0},${n.position?.y ?? 0}|${JSON.stringify(n.config ?? {})}`)
    .sort()
    .join("¦");
  const edges = graph.edges
    .map((e) => `${e.id}|${e.source}|${e.target}|${e.edgeType}|${JSON.stringify(e.predicate ?? null)}`)
    .sort()
    .join("¦");
  return `${nodes}‖${edges}`;
}

// Describe the difference between two whole-graph snapshots (used for the node-editor replace and for a
// crew revision that reloads the graph). Returns null when nothing structural changed — the caller then
// records nothing, so a pure run/store refresh never lands in the history.
export function describeGraphDiff(before: GTMGraph, after: GTMGraph): string | null {
  if (structuralSig(before) === structuralSig(after)) return null;

  const beforeNodeIds = new Set(before.nodes.map((n) => n.id));
  const afterNodeIds = new Set(after.nodes.map((n) => n.id));
  const addedNodes = after.nodes.filter((n) => !beforeNodeIds.has(n.id));
  const removedNodes = before.nodes.filter((n) => !afterNodeIds.has(n.id));

  const beforeEdgeIds = new Set(before.edges.map((e) => e.id));
  const afterEdgeIds = new Set(after.edges.map((e) => e.id));
  const addedEdges = after.edges.filter((e) => !beforeEdgeIds.has(e.id));
  const removedEdges = before.edges.filter((e) => !afterEdgeIds.has(e.id));

  const named = (n: GTMNode) => nodeName(n);
  const nodeCount = addedNodes.length + removedNodes.length;
  const edgeCount = addedEdges.length + removedEdges.length;

  // Single, clean shapes get a specific line; anything mixed reads as a general board update.
  if (nodeCount === 0 && edgeCount === 0) {
    // Same node/edge sets but the signature differs → a move or an in-place content edit.
    const moved = after.nodes.filter((n) => {
      const b = before.nodes.find((x) => x.id === n.id);
      return b && (b.position?.x !== n.position?.x || b.position?.y !== n.position?.y);
    });
    if (moved.length === 1) return `Moved ${named(moved[0])}`;
    if (moved.length > 1) return "Rearranged the board";
    const editedNode = after.nodes.find((n) => {
      const b = before.nodes.find((x) => x.id === n.id);
      return b && JSON.stringify({ l: b.label, c: b.config }) !== JSON.stringify({ l: n.label, c: n.config });
    });
    return editedNode ? `Edited ${named(editedNode)}` : "Updated the board";
  }
  if (addedNodes.length && !removedNodes.length && edgeCount === 0) {
    return addedNodes.length === 1 ? `Added ${named(addedNodes[0])}` : `Added ${addedNodes.length} steps`;
  }
  if (removedNodes.length && !addedNodes.length && edgeCount === 0) {
    return removedNodes.length === 1 ? `Removed ${named(removedNodes[0])}` : `Removed ${removedNodes.length} steps`;
  }
  if (edgeCount && nodeCount === 0) {
    if (addedEdges.length && !removedEdges.length) {
      if (addedEdges.length === 1) {
        const e = addedEdges[0];
        return `Connected ${nodeName(nodeById(after, e.source))} to ${nodeName(nodeById(after, e.target))}`;
      }
      return `Added ${addedEdges.length} connections`;
    }
    if (removedEdges.length && !addedEdges.length) {
      if (removedEdges.length === 1) {
        const e = removedEdges[0];
        return `Disconnected ${nodeName(nodeById(before, e.source))} from ${nodeName(nodeById(before, e.target))}`;
      }
      return `Removed ${removedEdges.length} connections`;
    }
  }
  return "Updated the board";
}

// ── The hook ─────────────────────────────────────────────────────────────────

export type CanvasHistoryApi = {
  // Record a committed structural edit (append; truncates any redo tail).
  record: (channelId: string, edit: { label: string; actor: CanvasEditActor; before: GTMGraph; after: GTMGraph }) => void;
  // Step back / forward. Returns the edit whose snapshot the caller should restore
  // (`before` for undo, `after` for redo), or null at the ends.
  undo: (channelId: string | null) => CanvasEdit | null;
  redo: (channelId: string | null) => CanvasEdit | null;
  canUndo: (channelId: string | null) => boolean;
  canRedo: (channelId: string | null) => boolean;
  // The trail for the active pipeline, plus the current cursor (entries at/after it are "undone").
  entriesFor: (channelId: string | null) => { edits: CanvasEdit[]; index: number };
  clear: (channelId: string) => void;
};

let editSeq = 0;

export function useCanvasHistory(): CanvasHistoryApi {
  const [histories, setHistories] = useState<Map<string, ChannelHistory>>(new Map());
  // A synchronous mirror so undo/redo (event handlers) can read the current cursor and return the target
  // snapshot in the same tick. Kept current inside every state updater below — never written during
  // render — so it always reflects the latest committed history.
  const ref = useRef(histories);

  const record = useCallback<CanvasHistoryApi["record"]>((channelId, edit) => {
    const entry: CanvasEdit = { id: `edit-${(editSeq += 1)}`, at: Date.now(), ...edit };
    setHistories((prev) => {
      const cur = prev.get(channelId) ?? EMPTY;
      const edits = cur.edits.slice(0, cur.index).concat(entry);
      const next = new Map(prev);
      next.set(channelId, { edits, index: edits.length });
      ref.current = next;
      return next;
    });
  }, []);

  const undo = useCallback<CanvasHistoryApi["undo"]>((channelId) => {
    if (!channelId) return null;
    const cur = ref.current.get(channelId);
    if (!cur || cur.index <= 0) return null;
    const edit = cur.edits[cur.index - 1];
    setHistories((prev) => {
      const c = prev.get(channelId);
      if (!c || c.index <= 0) return prev;
      const next = new Map(prev);
      next.set(channelId, { ...c, index: c.index - 1 });
      ref.current = next;
      return next;
    });
    return edit;
  }, []);

  const redo = useCallback<CanvasHistoryApi["redo"]>((channelId) => {
    if (!channelId) return null;
    const cur = ref.current.get(channelId);
    if (!cur || cur.index >= cur.edits.length) return null;
    const edit = cur.edits[cur.index];
    setHistories((prev) => {
      const c = prev.get(channelId);
      if (!c || c.index >= c.edits.length) return prev;
      const next = new Map(prev);
      next.set(channelId, { ...c, index: c.index + 1 });
      ref.current = next;
      return next;
    });
    return edit;
  }, []);

  const canUndo = useCallback<CanvasHistoryApi["canUndo"]>(
    (channelId) => !!channelId && (histories.get(channelId)?.index ?? 0) > 0,
    [histories],
  );
  const canRedo = useCallback<CanvasHistoryApi["canRedo"]>((channelId) => {
    if (!channelId) return false;
    const h = histories.get(channelId);
    return !!h && h.index < h.edits.length;
  }, [histories]);

  const entriesFor = useCallback<CanvasHistoryApi["entriesFor"]>(
    (channelId) => (channelId ? histories.get(channelId) ?? EMPTY : EMPTY),
    [histories],
  );

  const clear = useCallback<CanvasHistoryApi["clear"]>((channelId) => {
    setHistories((prev) => {
      if (!prev.has(channelId)) return prev;
      const next = new Map(prev);
      next.delete(channelId);
      ref.current = next;
      return next;
    });
  }, []);

  return { record, undo, redo, canUndo, canRedo, entriesFor, clear };
}
