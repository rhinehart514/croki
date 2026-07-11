import { useEffect, useMemo, useRef, useState } from "react";
import { ViewportPortal, useReactFlow } from "@xyflow/react";
import type { CanvasCreateKind, CanvasCreateRequest } from "@/lib/canvasNativeActions";

export type CanvasCreateIntent = {
  token: number;
  screen: { x: number; y: number };
};

export function CanvasNativeCreate({
  intent,
  onCreate,
  onDismiss,
}: {
  intent: CanvasCreateIntent;
  onCreate: (request: CanvasCreateRequest) => void | Promise<void>;
  onDismiss: () => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<CanvasCreateKind>("goal");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const position = useMemo(
    () => screenToFlowPosition(intent.screen, { snapToGrid: false }),
    [intent.screen, screenToFlowPosition],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, [intent.token]);

  const submit = async () => {
    const clean = title.trim();
    if (!clean || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({ kind, title: clean, position });
      onDismiss();
    } catch (cause) {
      setSaving(false);
      setError(cause instanceof Error ? cause.message : "Could not add this to the canvas.");
    }
  };

  return (
    <ViewportPortal>
      <form
        className="canvas-native-create nodrag nopan nowheel"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        aria-label="Add to canvas"
        onSubmit={(event) => { event.preventDefault(); void submit(); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onDismiss();
          }
        }}
      >
        <div className="canvas-native-create-kinds" role="group" aria-label="What to add">
          <button type="button" aria-pressed={kind === "goal"} onClick={() => setKind("goal")}>Goal</button>
          <button type="button" aria-pressed={kind === "work"} onClick={() => setKind("work")}>Work</button>
        </div>
        <label>
          <span>{kind === "goal" ? "What do you want to change?" : "What should exist here?"}</span>
          <input
            ref={inputRef}
            value={title}
            disabled={saving}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={kind === "goal" ? "Increase activation from the first session" : "Draft the onboarding comparison"}
          />
        </label>
        <div className="canvas-native-create-foot">
          <span role="status">{error ?? "Enter to add · Esc to close"}</span>
          <button type="submit" disabled={!title.trim() || saving}>{saving ? "Adding…" : "Add"}</button>
        </div>
      </form>
    </ViewportPortal>
  );
}
