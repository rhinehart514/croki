// Shell-state context object + consumer hook, kept out of the provider component file so fast-refresh
// stays component-only. The provider lives in ShellStateContext.tsx and imports this context.
//
// Phase 2 extends this with the descent path carrying the exact node payload each descent concerns
// (a DescentEntry, not just a CanvasSelection) so a reading renders the staged content without
// re-deriving it, and a slot where the world registers its camera verbs (reveal/broaden). The camera
// itself still lives in the world's colocated useAtlasCamera; only its two founder-facing verbs are
// lifted here so shell-level chrome (DescendReading, Escape) can drive rise/descend without
// prop-drilling. Domain data never enters context beyond the descended node's own snapshot.
import { createContext, useContext } from "react";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import type { AtlasAltitude, AtlasNode } from "@/components/atlas/atlasTypes";

// One rung of the descent: the composer scope, the world node id (for the camera + layoutId morph),
// and a snapshot of the node the reading renders. node is null for synthetic descents (e.g. the gate
// pulse) that have no placed world node.
export type DescentEntry = {
  selection: CanvasSelection;
  nodeId: string | null;
  node: AtlasNode | null;
};

// The camera verbs the world registers so shell-level chrome can drive descend/rise. reveal tweens the
// camera to a node (wrapping useAtlasCamera().reveal); broaden restores the exact prior frame.
export type ShellCamera = {
  reveal: (nodeId: string) => void;
  broaden: () => void;
};

// Phase 3: the world publishes a small read-only snapshot of the live world so floating glass chrome
// rendered OUTSIDE the ReactFlow store (Altimeter, Teleport, in-world receipt anchoring at shell level)
// can read altitude and the placed node set without living inside <ReactFlow>. Domain data does not enter
// here — only the altitude band and the node array the engine already placed. selectNode descends into a
// node the same way a click does, so ⌘K teleport and the needs-you pulse route through one path.
export type ShellWorld = {
  altitude: AtlasAltitude;
  nodes: AtlasNode[];
  selectNode: (nodeId: string) => void;
};

export type ShellState = {
  selection: CanvasSelection;
  setSelection: (selection: CanvasSelection) => void;
  descentPath: DescentEntry[];
  pushDescent: (entry: DescentEntry) => void;
  popDescent: () => void;
  descentOpen: boolean;
  threadOpen: boolean;
  setThreadOpen: (open: boolean) => void;
  registerCamera: (camera: ShellCamera | null) => void;
  cameraRef: { current: ShellCamera | null };
  world: ShellWorld | null;
  publishWorld: (world: ShellWorld | null) => void;
};

export const ShellStateContext = createContext<ShellState | null>(null);

export function useShellState(): ShellState {
  const value = useContext(ShellStateContext);
  if (!value) throw new Error("useShellState must be used within a ShellStateProvider");
  return value;
}
