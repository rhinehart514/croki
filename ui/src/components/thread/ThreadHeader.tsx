import { Check, Ellipsis, Map, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ThreadTimeline, VisualReference, WorkIndexItem } from "@/api";

function tokensLabel(count: number) {
  if (count < 1_000) return `${count}`;
  if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
  return `${(count / 1_000_000).toFixed(1)}m`;
}

// One quiet measured line: only dollars the adapter reported and tokens the SDK reported. When
// nothing was measured, nothing renders — no fabricated zeros.
function usageReadout(timeline: ThreadTimeline | null) {
  const usage = timeline?.usage;
  if (!usage) return null;
  const tokens = usage.inputTokens + usage.outputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
  const parts = [
    usage.costUsd > 0 ? (usage.costUsd >= 0.005 ? `$${usage.costUsd.toFixed(2)}` : "under $0.01") : null,
    tokens > 0 ? `${tokensLabel(tokens)} tokens` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  const detail = [
    tokens > 0 ? `${tokensLabel(usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens)} in · ${tokensLabel(usage.outputTokens)} out` : null,
    `${usage.driveCount} ${usage.driveCount === 1 ? "run" : "runs"}`,
  ].filter(Boolean).join(" · ");
  return { label: parts.join(" · "), detail };
}

function status(item: WorkIndexItem | null) {
  if (!item) return "Venture conversation";
  if (item.attention === "decision") return "Waiting for your judgment";
  if (item.attention === "failure") return "Interrupted";
  if (item.activity !== "idle") return "Agents working";
  if (item.unread) return "New result";
  return item.lifecycle === "closed" ? "Closed" : "Ready to continue";
}

export function ThreadHeader({ item, timeline, onOpenVisual, onTogglePin, onRename, onDelete, renameDisabledReason }: {
  item: WorkIndexItem | null;
  timeline: ThreadTimeline | null;
  onOpenVisual: (visual: VisualReference, origin: HTMLElement) => void;
  onTogglePin: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  renameDisabledReason: string | null;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(item?.founderIntent ?? "");
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteState, setDeleteState] = useState<{ threadRef: string; phase: "confirming" | "deleting"; error: string | null } | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const isRoot = item?.threadRef === "thread:venture-root";
  const isLegacy = item?.threadRef.startsWith("thread:legacy-") === true;
  const renameAllowed = Boolean(item && !isRoot && !isLegacy && !renameDisabledReason);
  const currentDeleteState = deleteState?.threadRef === item?.threadRef ? deleteState : null;
  const confirmingDelete = Boolean(currentDeleteState);
  const deleting = currentDeleteState?.phase === "deleting";
  const deleteError = currentDeleteState?.error ?? null;
  const usage = usageReadout(timeline);
  const map = timeline?.visuals.find((visual) => visual.kind === "map")
    ?? (item ? { kind: "map" as const, ref: `${item.threadRef}#venture-map`, threadRef: item.threadRef, title: "Venture map" } : null);
  const jumpToAgent = (participantRef: string) => document.getElementById(`agent-update-${participantRef}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  useEffect(() => {
    if (!renaming) return;
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [renaming]);

  const beginRename = () => { setName(item?.founderIntent ?? ""); setRenameError(null); setRenaming(true); };
  const cancelRename = () => {
    setRenaming(false);
    setName(item?.founderIntent ?? "");
    setRenameError(null);
  };
  const saveName = async () => {
    const next = name.trim();
    if (!next || saving) return;
    if (next === item?.founderIntent) { cancelRename(); return; }
    setSaving(true);
    setRenameError(null);
    try {
      await onRename(next);
      setRenaming(false);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "The thread could not be renamed.");
    } finally {
      setSaving(false);
    }
  };
  const deleteChat = async () => {
    const threadRef = item?.threadRef;
    if (!threadRef || deleting) return;
    setDeleteState({ threadRef, phase: "deleting", error: null });
    try {
      await onDelete();
    } catch (error) {
      setDeleteState({ threadRef, phase: "confirming", error: error instanceof Error ? error.message : "The chat could not be deleted." });
    }
  };

  return (
    <header className="thread-header">
      <div className="thread-header-copy">
        {renaming ? <form className="thread-title-editor" onSubmit={(event) => { event.preventDefault(); void saveName(); }}>
          <input ref={nameRef} aria-label="Thread name" value={name} maxLength={160} disabled={saving} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancelRename(); } }} />
          <button type="submit" aria-label="Save thread name" disabled={saving || !name.trim()}><Check aria-hidden="true" /></button>
          <button type="button" aria-label="Cancel renaming" disabled={saving} onClick={cancelRename}><X aria-hidden="true" /></button>
        </form> : <div className="thread-title-row">
          <h1>{item?.founderIntent ?? "Drover"}</h1>
          {renameAllowed ? <button type="button" aria-label="Rename thread" title="Rename thread" onClick={beginRename}><Pencil aria-hidden="true" /></button> : null}
        </div>}
        <span>{status(item)}{usage ? <span className="thread-usage" title={usage.detail}> · {usage.label}</span> : null}</span>
        {renameError ? <small role="alert">{renameError}</small> : null}
      </div>
      <div className="thread-header-agents" aria-label="Thread participants">
        {timeline?.agents.map((agent) => <button type="button" key={agent.runRef} onClick={() => jumpToAgent(agent.participantRef)}><span aria-hidden="true" />{agent.participantLabel ?? agent.participantRef}<small>{agent.state}</small></button>)}
      </div>
      <div className="thread-header-actions">
        {map ? <button type="button" aria-label="Open venture map beside chat" onClick={(event) => onOpenVisual(map, event.currentTarget)}><Map aria-hidden="true" /><span>Map</span></button> : null}
        {item && !isRoot && !isLegacy ? (
          <details className="thread-actions-menu">
            <summary aria-label="Thread actions"><Ellipsis aria-hidden="true" /></summary>
            <div data-confirming-delete={confirmingDelete ? "true" : undefined}>
              {confirmingDelete ? <div className="thread-delete-confirmation">
                <strong>Delete this chat?</strong>
                <small>Any active work will stop. Product changes and receipts stay.</small>
                {deleteError ? <small role="alert">{deleteError}</small> : null}
                <span>
                  <button type="button" disabled={deleting} onClick={() => { setDeleteState(null); }}>Cancel</button>
                  <button type="button" className="thread-delete-action" disabled={deleting} onClick={() => { void deleteChat(); }}>{deleting ? "Deleting…" : "Delete chat"}</button>
                </span>
              </div> : <>
                <button type="button" onClick={onTogglePin}>{item.pinnedAt ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}{item.pinnedAt ? "Unpin thread" : "Pin thread"}</button>
                <button type="button" disabled={!renameAllowed} title={renameDisabledReason ?? undefined} onClick={beginRename}>Rename thread</button>
                <button type="button" className="thread-delete-menu-item" disabled={Boolean(renameDisabledReason)} title={renameDisabledReason ?? undefined} onClick={() => { setDeleteState({ threadRef: item.threadRef, phase: "confirming", error: null }); }}><Trash2 aria-hidden="true" />Delete chat</button>
              </>}
            </div>
          </details>
        ) : null}
      </div>
    </header>
  );
}
