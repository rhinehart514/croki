// The founder-visible record of a decision already made. DecisionGate owns the live decision; reopening
// a decided review has to show the same material in the same composition with every control removed —
// not the stored record. Dumping the wall row as JSON put internal identifiers and compatibility-seam
// vocabulary on screen in the founder's review workspace, which is one workspace, not two.
//
// It borrows the gate's class vocabulary deliberately: `.visual-consequence` already restyles those
// classes for this surface, so a receipt reads as the same object the gate showed, one tense later.
import { readable, reviewContent } from "@/components/lens/wallReviewContent";
import type { WallQueueItemView } from "@/api";
import { ArtifactPreview } from "@/components/review";
import { resolveEffectArtifact } from "./reviewArtifact";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const dateLabel = (value: unknown) => {
  const parsed = Date.parse(readable(value) ?? "");
  return Number.isNaN(parsed) ? null : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
};

// Past tense, and specific about what did or did not cross into the world. A receipt that hedges is
// worse than no receipt: the founder reopens this to know exactly what their own hand did.
function outcome(decision: string | null, kind: string): { eyebrow: string; title: string } {
  switch (decision) {
    case "release":
      if (kind === "deploy") return { eyebrow: "Deployed", title: "You deployed this." };
      if (kind === "product-change") return { eyebrow: "Applied", title: "You applied this change." };
      return { eyebrow: "Sent", title: "You approved and sent this." };
    case "authorize-deploy": return { eyebrow: "Authorized", title: "You authorized this deploy. It has not been deployed." };
    case "reject": return { eyebrow: "Held", title: "You held this. Nothing left Croki." };
    case "answer": return { eyebrow: "Answered", title: "You answered this." };
    case "dismiss": return { eyebrow: "Dismissed", title: "You dismissed this without answering." };
    case "kill": return { eyebrow: "Ended", title: "You ended this work." };
    case "keep": return { eyebrow: "Kept", title: "You kept this work going." };
    case "acknowledge": return { eyebrow: "Acknowledged", title: "You acknowledged this return." };
    default: return { eyebrow: "Waiting", title: "This review is no longer in the queue." };
  }
}

export function DecisionReceipt({ decision, fallbackTitle }: { decision: Record<string, unknown>; fallbackTitle: string }) {
  const effect = record(decision.effect);
  const kind = (readable(effect.kind) ?? "").toLowerCase();
  const settled = outcome(readable(decision.decision), kind);
  const artifact = resolveEffectArtifact(effect);
  const previewed = artifact?.kind === "preview" ? artifact.artifact.content?.trim() ?? null : null;
  // Reuse the gate's own reading of this effect so the facts match what the founder saw when deciding.
  // Its forward-looking Consequence row is dropped: the consequence has already happened, and leaving
  // "Release performs this one outward act" under a send that already went out would be a lie of tense.
  const content = reviewContent({ ...decision, effect } as unknown as WallQueueItemView);
  const facts = content.details.filter((detail) =>
    detail.tone !== "artifact"
    && detail.label !== "Consequence"
    && !(previewed && detail.value.trim() === previewed));
  const note = readable(decision.note);
  const at = dateLabel(decision.decidedAt ?? decision.releasedAt ?? decision.parkedAt);
  const by = readable(decision.decidedBy);
  const failure = readable(decision.lastExecutionError);

  return (
    <div className="now-gate">
      <div className="now-gate-head">
        <span className="now-gate-eyebrow">{at ? `${settled.eyebrow} · ${at}` : settled.eyebrow}</span>
        <span className="now-gate-title">{settled.title}</span>
      </div>

      {artifact?.kind === "preview" ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">What was produced</span>
          <ArtifactPreview artifact={artifact.artifact} />
        </div>
      ) : artifact ? null : <p className="now-detail-why">{fallbackTitle}</p>}

      {facts.length || note || by ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">What happened</span>
          <ul className="now-detail-list">
            {facts.map((detail) => <li key={detail.label}><span>{detail.label}: {detail.value}</span></li>)}
            {note ? <li key="note"><span>Your note: {note}</span></li> : null}
            {by ? <li key="by"><span>Recorded by: {by}</span></li> : null}
          </ul>
        </div>
      ) : null}

      {failure ? <div className="now-gate-execution-failure" role="alert"><strong>This did not complete.</strong><p>{failure}</p></div> : null}

      <div className="now-gate-note">This decision is recorded. Reopening it changes nothing.</div>
    </div>
  );
}
