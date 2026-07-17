// Descent lifecycle (architecture §1/§2/§3). Selection is descent, not a panel: descend() pushes a
// rung onto the path, sets the composer scope, and flies the camera to the node (wrapping the world's
// registered useAtlasCamera().reveal); rise() pops the last rung and, at the root, broadens the camera
// back to the exact prior frame (useAtlasCamera restores previousViewport). The world drives descend on
// node click; DescendReading + the Escape handler drive rise. No backend: descend/rise are read-only
// camera + UI-mode moves; the data the reading renders already arrived in the projection/lens.
//
// The path lives in ShellStateContext so shell-level chrome reads it without prop-drilling; this hook
// is the verbs over it. It stays camera-agnostic in tests: when no camera is registered (jsdom), the
// path still pushes/pops correctly, which is exactly what the unit test asserts.
import { useCallback } from "react";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import { useShellState } from "../state/shellState";
import type { DescentEntry } from "../state/shellState";

export function useDescent() {
  const { descentPath, descentOpen, pushDescent, popDescent, cameraRef } = useShellState();

  const descend = useCallback((selection: CanvasSelection, nodeId: string | null, node: AtlasNode | null) => {
    const entry: DescentEntry = { selection, nodeId, node };
    pushDescent(entry);
    if (nodeId) cameraRef.current?.reveal(nodeId);
  }, [cameraRef, pushDescent]);

  const rise = useCallback(() => {
    popDescent();
    // Rising past the last rung returns to the overview; broaden restores the exact pre-descent frame.
    if (descentPath.length <= 1) cameraRef.current?.broaden();
    else {
      const target = descentPath[descentPath.length - 2];
      if (target?.nodeId) cameraRef.current?.reveal(target.nodeId);
    }
  }, [cameraRef, descentPath, popDescent]);

  const riseToRoot = useCallback(() => {
    // popDescent removes one rung per call via functional setState; drive it by the captured length
    // (a plain loop on the closure value would never terminate, since the closure never re-reads state).
    for (let i = 0; i < descentPath.length; i += 1) popDescent();
    cameraRef.current?.broaden();
  }, [cameraRef, descentPath, popDescent]);

  const current = descentPath[descentPath.length - 1] ?? null;

  return { descentPath, descentOpen, current, descend, rise, riseToRoot };
}
