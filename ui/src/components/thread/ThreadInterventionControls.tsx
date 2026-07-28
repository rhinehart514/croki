import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { editQueuedFounderTurn, removeQueuedFounderTurn, type QueuedFounderTurn, type WallQueueItemView } from "@/api";
import { DecisionGate } from "@/components/now/DecisionGate";

export function ThreadInterventionControls({
  ventureId,
  threadRef,
  betId,
  items,
  queuedTurns,
  readOnlyReason,
  onChanged,
}: {
  ventureId: string;
  threadRef: string;
  betId: string;
  items: WallQueueItemView[];
  queuedTurns: QueuedFounderTurn[];
  readOnlyReason: string | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async (turn: QueuedFounderTurn) => {
    const next = text.trim();
    if (!next || busy) return;
    setBusy(turn.id); setError(null);
    try {
      await editQueuedFounderTurn(ventureId, threadRef, betId, turn.id, next);
      setEditing(null); onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The queued turn could not be edited.");
    } finally { setBusy(null); }
  };
  const remove = async (turn: QueuedFounderTurn) => {
    if (busy) return;
    setBusy(turn.id); setError(null);
    try {
      await removeQueuedFounderTurn(ventureId, threadRef, betId, turn.id);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The queued turn could not be removed.");
    } finally { setBusy(null); }
  };

  if (!items.length && !queuedTurns.length) return null;
  return (
    <div className="thread-interventions" aria-label="Waiting for you">
      {items.map((item) => (
        <DecisionGate
          key={item.id}
          ventureId={ventureId}
          item={item}
          showArtifact={false}
          readOnlyReason={readOnlyReason}
          onDecided={onChanged}
        />
      ))}
      {queuedTurns.length ? (
        <section className="thread-follow-ups">
          <header><strong>Queued follow-ups</strong><span>Sent in this order at the next safe step</span></header>
          <ol>
            {queuedTurns.map((turn) => (
              <li key={turn.id}>
                {editing === turn.id ? (
                  <form onSubmit={(event) => { event.preventDefault(); void save(turn); }}>
                    <input autoFocus value={text} disabled={busy === turn.id} aria-label="Edit queued follow-up" onChange={(event) => setText(event.target.value)} />
                    <button type="submit" aria-label="Save queued follow-up"><Check aria-hidden="true" /></button>
                    <button type="button" aria-label="Cancel editing" onClick={() => setEditing(null)}><X aria-hidden="true" /></button>
                  </form>
                ) : (
                  <>
                    <span>{turn.text}</span>
                    <button type="button" aria-label={`Edit queued follow-up: ${turn.text}`} disabled={Boolean(busy) || Boolean(readOnlyReason)} onClick={() => { setEditing(turn.id); setText(turn.text); }}><Pencil aria-hidden="true" /></button>
                    <button type="button" aria-label={`Remove queued follow-up: ${turn.text}`} disabled={Boolean(busy) || Boolean(readOnlyReason)} onClick={() => void remove(turn)}><Trash2 aria-hidden="true" /></button>
                  </>
                )}
              </li>
            ))}
          </ol>
          {error ? <p role="alert">{error}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
