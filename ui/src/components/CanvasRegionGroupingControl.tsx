import { useState } from "react";
import "./CanvasRegionGroupingControl.css";

export function CanvasRegionGroupingControl({
  selectionCount, open, busy = false, onOpen, onCancel, onCreate,
}: {
  selectionCount: number;
  open: boolean;
  busy?: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onCreate: (title: string) => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const cancel = () => { setTitle(""); onCancel(); };
  if (selectionCount < 2) return null;
  if (!open) {
    return <button type="button" className="canvas-region-group-trigger" onClick={onOpen}>Group {selectionCount} items <kbd>G</kbd></button>;
  }
  return (
    <form
      className="canvas-region-group-form"
      aria-label="Create work region from selection"
      aria-busy={busy}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || busy) return;
        await onCreate(title.trim());
        setTitle("");
      }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } }}
    >
      <label htmlFor="canvas-region-group-title">Name this work</label>
      <div>
        <input
          id="canvas-region-group-title"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Fix activation"
          maxLength={120}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !title.trim()}>{busy ? "Grouping…" : "Create region"}</button>
        <button type="button" className="is-quiet" onClick={cancel} disabled={busy}>Cancel</button>
      </div>
      <small>{selectionCount} references stay shared and editable.</small>
    </form>
  );
}

export default CanvasRegionGroupingControl;
