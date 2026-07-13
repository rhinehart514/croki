import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Redo2, Undo2 } from "lucide-react";
import { getCanvasStructureHistory, redoCanvasStructure, undoCanvasStructure } from "@/api";
import { getIdentity } from "@/lib/identity";
import type { CanvasStructureHistoryEntry, CanvasStructureHistoryResponse } from "@/openCanvasTypes";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import "@/styles/canvas-history.css";

function writeKey(action: "undo" | "redo"): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `ui:canvas-structure:${action}:${suffix}`;
}

function relativeTime(value: string, now: number): string {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return "";
  const seconds = Math.max(0, Math.round((now - at) / 1_000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function actorLabel(entry: CanvasStructureHistoryEntry): string {
  const identity = getIdentity();
  if (entry.actor === identity.userId || entry.actor === `founder:${identity.userId}` || entry.actor === "founder") return "You";
  return entry.actor.replace(/^founder:/, "Founder ").replace(/[-_]+/g, " ");
}

export function CanvasStructureHistoryControl({
  projectId,
  structureSignal,
  besidePipelineHistory = false,
  onCanvasChanged,
}: {
  projectId: string;
  structureSignal?: string;
  besidePipelineHistory?: boolean;
  onCanvasChanged: () => void | Promise<void>;
}) {
  const [history, setHistory] = useState<CanvasStructureHistoryResponse | null>(null);
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const [openedAt, setOpenedAt] = useState(0);
  const [busy, setBusy] = useState<"undo" | "redo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diverged, setDiverged] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await getCanvasStructureHistory(projectId);
      setHistory(next);
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Canvas changes could not be loaded.");
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setHistory(null);
      setError(null);
      setDiverged(false);
      return load();
    });
  }, [load]);

  // The canonical region/layout projection changes after every recorded structural write. Refresh the
  // receipts on that signal so work done through direct manipulation appears without a manual reload.
  useEffect(() => {
    if (history) void Promise.resolve().then(load);
  }, [structureSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = useMemo(() => history?.entries ?? [], [history]);
  const canUndo = !busy && !diverged && entries.some((entry) => entry.status === "applied");
  const canRedo = !busy && !diverged && entries.some((entry) => entry.status === "undone");
  const rows = useMemo(() => [...entries].sort((a, b) => b.sequence - a.sequence).slice(0, 12), [entries]);

  const mutate = async (action: "undo" | "redo") => {
    if (!history || busy || diverged || (action === "undo" ? !canUndo : !canRedo)) return;
    setBusy(action);
    setError(null);
    try {
      const input = {
        expectedHistoryRevision: history.revision,
        revisionAuthor: getIdentity().userId,
        idempotencyKey: writeKey(action),
      };
      const result = action === "undo"
        ? await undoCanvasStructure(projectId, input)
        : await redoCanvasStructure(projectId, input);
      setHistory(result.history);
      await onCanvasChanged();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "That canvas change could not be restored.";
      const staleHistory = /stale canvas history revision/i.test(message);
      // A stale history cursor is recoverable after reloading receipts. Every other failure is treated as
      // divergence and disables structural restoration rather than risking an overwrite of newer truth.
      setDiverged(!staleHistory);
      setError(staleHistory
        ? "Canvas changes were updated elsewhere. The latest receipts are shown; review them before trying again."
        : message);
      await load();
      await onCanvasChanged();
    } finally {
      setBusy(null);
    }
  };

  const hasTrail = entries.length > 0;
  const setTrailOpen = (nextOpen: boolean) => {
    if (nextOpen && !open) setOpenedAt(Date.now());
    setOpen(nextOpen);
  };
  return (
    <div className={`chist chist-structure ${besidePipelineHistory ? "with-pipeline-history" : ""}`}>
      <Popover
        open={open}
        onOpenChange={(nextOpen, eventDetails) => {
          const target = eventDetails.event.target;
          const pressedControlBar = target instanceof Node && barRef.current?.contains(target);
          if (!nextOpen && eventDetails.reason === "outside-press" && pressedControlBar) {
            eventDetails.cancel();
            return;
          }
          setTrailOpen(nextOpen);
        }}
      >
        <div ref={barRef} className="chist-bar" role="group" aria-label="Undo and redo canvas arrangement changes">
          <span className="chist-structure-label">Canvas</span>
          <button type="button" className="chist-btn" onClick={() => void mutate("undo")} disabled={!canUndo} aria-label="Undo the last canvas arrangement change" title="Undo canvas arrangement">
            <Undo2 size={15} strokeWidth={2} />
          </button>
          <button type="button" className="chist-btn" onClick={() => void mutate("redo")} disabled={!canRedo} aria-label="Redo the next canvas arrangement change" title="Redo canvas arrangement">
            <Redo2 size={15} strokeWidth={2} />
          </button>
          <span className="chist-sep" aria-hidden="true" />
          <PopoverTrigger
            render={(
              <button
                type="button"
                className={`chist-btn chist-trail-toggle ${open ? "on" : ""}`}
                aria-label="Show canvas arrangement history"
              />
            )}
          >
            <History size={15} strokeWidth={2} />
            {hasTrail ? <span className="chist-count">{entries.length}</span> : null}
          </PopoverTrigger>
        </div>
        <PopoverContent
          className="chist-trail chist-structure-trail !gap-0 !ring-0"
          side="top"
          align="start"
          sideOffset={8}
          aria-label="Canvas structure changes"
        >
          <div className="chist-trail-head">Canvas changes</div>
          <p className="chist-structure-note">Moves, regions, and view layout only. Content and real-world actions stay unchanged.</p>
          {error ? <p className="chist-structure-error" role="alert">{error}</p> : null}
          {hasTrail ? (
            <ol className="chist-list">
              {rows.map((entry) => (
                <li key={entry.id} className={`chist-row ${entry.status === "undone" ? "undone" : ""}`}>
                  <span className="chist-dot chist-structure-dot" aria-hidden="true" />
                  <span className="chist-row-text">
                    <span className="chist-label">{entry.summary}</span>
                    <span className="chist-meta"><span className="chist-scope">{entry.scope === "region" ? "Region" : "Layout"}</span> {actorLabel(entry)} · {relativeTime(entry.updatedAt, openedAt)}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : <p className="chist-structure-empty">Move an item or change a region and its receipt will appear here.</p>}
        </PopoverContent>
      </Popover>
    </div>
  );
}
