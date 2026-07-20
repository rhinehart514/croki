import { Bookmark, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { SavedView } from "@/api";

export function ProductSavedViews({ views, canSave, disabledReason, loadError, onSave, onReopen, onDelete }: {
  views: SavedView[];
  canSave: boolean;
  disabledReason: string | null;
  loadError: string | null;
  onSave: () => Promise<void>;
  onReopen: (view: SavedView) => Promise<string>;
  onDelete: (view: SavedView) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const act = async (key: string, action: () => Promise<string | void>) => {
    setBusy(key); setNotice(null);
    try { setNotice((await action()) ?? null); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(null); }
  };
  const saveReason = disabledReason ?? (!canSave ? "Select a canonical Product / GTM object to save its current path." : null);

  return <section className="product-saved-views" aria-label="Saved Product and go-to-market views">
    <h2><Bookmark aria-hidden="true" />Saved views</h2>
    <button type="button" className="product-save-view" aria-label="Save current view" disabled={Boolean(saveReason) || busy !== null} title={saveReason ?? "Save the selected path as a live view"} onClick={() => void act("save", async () => { await onSave(); return "View saved."; })}>
      <strong>{busy === "save" ? "Saving…" : "Save current view"}</strong><small>{saveReason ?? "Current truth stays synchronized"}</small>
    </button>
    {views.map((view) => <div className="product-saved-view" key={view.id}>
      <span><strong>{view.name}</strong><small>{view.kind === "snapshot" ? "Snapshot" : "Live view"}</small></span>
      <div>
        <button type="button" aria-label={`Reopen ${view.name}`} disabled={busy !== null} onClick={() => void act(`open:${view.id}`, () => onReopen(view))}><RotateCcw aria-hidden="true" /></button>
        <button type="button" aria-label={confirmDelete === view.id ? `Confirm delete ${view.name}` : `Delete ${view.name}`} disabled={Boolean(disabledReason) || busy !== null} onClick={() => {
          if (confirmDelete !== view.id) { setConfirmDelete(view.id); setNotice("Select delete again to remove this saved view."); return; }
          setConfirmDelete(null); void act(`delete:${view.id}`, async () => { await onDelete(view); return "Saved view deleted."; });
        }}><Trash2 aria-hidden="true" /></button>
      </div>
    </div>)}
    {!views.length && !loadError ? <p>No saved views yet.</p> : null}
    {loadError ? <p role="alert">{loadError}</p> : notice ? <p role="status">{notice}</p> : null}
  </section>;
}
