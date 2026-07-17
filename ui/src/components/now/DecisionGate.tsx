// The exact founder decision, presented with the precision Cursor uses for applying a diff — but the
// outward-authority boundary stays binary and server-enforced. The founder reviews the produced thing
// first (a real diff or a preview), then decides. A deploy still requires two explicit acts: Authorize,
// then Send — the two-word invariant expressed as two deliberate clicks. Wires to decideWallItem; the
// note carries a hold/answer reason.
import { useState } from "react";
import { decideWallItem, type WallDecision, type WallQueueItemView } from "@/api";
import { reviewContent } from "@/components/lens/wallReviewContent";
import { DiffView, FilesChanged, ArtifactPreview } from "@/components/review";
import { resolveEffectArtifact } from "./reviewArtifact";

export function DecisionGate({
  ventureId,
  item,
  onDecided,
  onRevise,
}: {
  ventureId: string;
  item: WallQueueItemView;
  onDecided: () => void;
  onRevise?: () => void;
}) {
  const content = reviewContent(item);
  const artifact = resolveEffectArtifact(item.effect);
  const isDeploy = String(item.effect.kind ?? "").toLowerCase() === "deploy";
  const [authorized, setAuthorized] = useState<boolean>(Boolean(item.deployAuthorizedAt));
  const [busy, setBusy] = useState<WallDecision | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: WallDecision, noteValue?: string) => {
    if (busy) return;
    setBusy(decision); setError(null);
    try {
      await decideWallItem(ventureId, item.id, { decision, note: noteValue ?? null });
      if (decision === "authorize-deploy") { setAuthorized(true); }
      else onDecided();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Drover could not record that decision.");
    } finally { setBusy(null); }
  };

  // Detail rows minus the raw-diff row (we render the diff visually), and minus consequence noise.
  const rows = content.details.filter((detail) => detail.tone !== "artifact");

  return (
    <div className="now-gate">
      {artifact?.kind === "diff" ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">What changed</span>
          <FilesChanged diff={artifact.diff} />
          <DiffView diff={artifact.diff} />
        </div>
      ) : artifact?.kind === "preview" ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">What was produced</span>
          <ArtifactPreview artifact={artifact.artifact} />
        </div>
      ) : null}

      {rows.length ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">Exactly what would happen</span>
          <ul className="now-detail-list">
            {rows.map((detail) => <li key={detail.label}><span>{detail.label}: {detail.value}</span></li>)}
          </ul>
        </div>
      ) : null}

      <div className="now-gate-note">
        This is the only outward act. Nothing leaves until you release it, and Drover remembers what you allow.
        {isDeploy ? " A deploy needs two acts: authorize it, then send it." : ""}
      </div>

      {item.purpose === "release" ? (
        <div className="now-gate-actions">
          {isDeploy && !authorized ? (
            <button type="button" className="now-gate-btn" data-intent="release" disabled={busy !== null} onClick={() => decide("authorize-deploy")}>
              {busy === "authorize-deploy" ? "Arming…" : "Authorize deploy"}
            </button>
          ) : (
            <button
              type="button"
              className="now-gate-btn"
              data-intent="release"
              disabled={busy !== null || !content.releaseReady}
              onClick={() => decide("release", note.trim() || undefined)}
            >
              {busy === "release" ? "Sending…" : isDeploy ? "Send it" : "Approve & send"}
            </button>
          )}
          {onRevise ? <button type="button" className="now-gate-btn" onClick={onRevise}>Revise</button> : null}
          <button type="button" className="now-gate-btn" data-intent="reject" disabled={busy !== null} onClick={() => decide("reject", note.trim() || "Held by the founder for now.")}>
            {busy === "reject" ? "Holding…" : "Reject"}
          </button>
        </div>
      ) : item.purpose === "answer" ? (
        <div className="now-detail-block">
          <div className="now-gate-words">
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Your answer…" aria-label="Your answer" />
            <button type="button" className="now-gate-btn" data-intent="release" disabled={busy !== null || !note.trim()} onClick={() => decide("answer", note.trim())}>Send answer</button>
          </div>
          <button type="button" className="now-gate-btn" data-intent="reject" disabled={busy !== null} onClick={() => decide("dismiss")}>Dismiss</button>
        </div>
      ) : item.purpose === "end-bet" ? (
        <div className="now-gate-actions">
          <button type="button" className="now-gate-btn" data-intent="reject" disabled={busy !== null} onClick={() => decide("kill")}>End this work</button>
          <button type="button" className="now-gate-btn" disabled={busy !== null} onClick={() => decide("keep")}>Keep it going</button>
        </div>
      ) : (
        <div className="now-gate-actions">
          <button type="button" className="now-gate-btn" data-intent="release" disabled={busy !== null} onClick={() => decide("acknowledge")}>Acknowledge</button>
        </div>
      )}

      {isDeploy && authorized ? <p className="now-gate-hint">Deploy armed. Send it to release, or reject to hold.</p> : null}
      {error ? <p className="now-gate-error" role="alert">{error}</p> : null}
    </div>
  );
}
