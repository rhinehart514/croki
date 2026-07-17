// Cross-cutting UI mode for the immersive shell — selection, descent path, thread-open — held in one
// context so floating chrome and readings read it without prop-drilling. Domain data never enters here
// beyond the descended node's own snapshot (architecture §2, "no new global store"). Camera/altitude/
// materialization stay in their colocated hooks; the world registers only its two founder-facing camera
// verbs (reveal/broaden) so shell-level descent chrome can drive the fly-in/rise. The context object +
// consumer hook live in shellState.ts.
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import { ShellStateContext, type DescentEntry, type ShellCamera, type ShellState, type ShellWorld } from "./shellState";

export function ShellStateProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<CanvasSelection>(null);
  const [descentPath, setDescentPath] = useState<DescentEntry[]>([]);
  const [threadOpen, setThreadOpen] = useState(false);
  const [world, setWorld] = useState<ShellWorld | null>(null);
  const cameraRef = useRef<ShellCamera | null>(null);

  const pushDescent = useCallback((entry: DescentEntry) => {
    setDescentPath((path) => [...path, entry]);
    setSelection(entry.selection);
  }, []);
  const popDescent = useCallback(() => {
    setDescentPath((path) => {
      const next = path.slice(0, -1);
      setSelection(next[next.length - 1]?.selection ?? null);
      return next;
    });
  }, []);

  const registerCamera = useCallback((camera: ShellCamera | null) => {
    cameraRef.current = camera;
  }, []);

  const publishWorld = useCallback((next: ShellWorld | null) => {
    setWorld(next);
  }, []);

  const value = useMemo<ShellState>(() => ({
    selection,
    setSelection,
    descentPath,
    pushDescent,
    popDescent,
    descentOpen: descentPath.length > 0,
    threadOpen,
    setThreadOpen,
    registerCamera,
    cameraRef,
    world,
    publishWorld,
  }), [descentPath, popDescent, publishWorld, pushDescent, registerCamera, selection, threadOpen, world]);

  return <ShellStateContext.Provider value={value}>{children}</ShellStateContext.Provider>;
}

export type { CanvasSelection };
