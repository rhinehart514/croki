import { Check, MessageSquare, ShieldCheck, X } from "lucide-react";
import type { ProductChangeReadiness, WallDecision, WallQueueItemView } from "@/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProductChangeWallActions } from "./ProductChangeWallActions";
import { readable, reviewContent } from "./wallReviewContent";

export function WallReviewDetail({
  item,
  note,
  busy,
  onNoteChange,
  onDecide,
  onInspectProductChange,
  onApproveProductChange,
  readOnly = false,
}: {
  item: WallQueueItemView;
  note: string;
  busy: boolean;
  onNoteChange: (note: string) => void;
  onDecide: (decision: WallDecision) => Promise<void>;
  onInspectProductChange?: (ventureId: string, workspaceId: string, revisionId: string) => Promise<ProductChangeReadiness>;
  onApproveProductChange?: (item: WallQueueItemView, note?: string) => Promise<ProductChangeReadiness>;
  readOnly?: boolean;
}) {
  const content = reviewContent(item);
  const kind = readable(item.effect.kind);
  const deploy = kind === "deploy";
  const productChange = kind === "product-change";
  const needsAnswer = item.purpose === "answer";
  const releaseReady = content.releaseReady !== false;
  return (
    <article className="firm-wall-review-item">
      <div className="firm-wall-review-title">
        <div><span>{content.eyebrow}</span><strong>{content.title}</strong></div>
        <time dateTime={item.parkedAt}>{new Date(item.parkedAt).toLocaleString()}</time>
      </div>
      <p className="firm-wall-review-why"><strong>Why you</strong>{content.why}</p>
      <dl>
        {content.details.map((detail) => (
          <div key={`${detail.label}:${detail.value}`} className={detail.tone ? `firm-wall-review-${detail.tone}` : undefined}>
            <dt>{detail.label}</dt><dd>{detail.value}</dd>
          </div>
        ))}
      </dl>
      <Textarea
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder={needsAnswer ? "Your answer" : "Optional note"}
        aria-label={`Note for ${content.title}`}
        rows={2}
        disabled={readOnly}
      />
      {productChange && item.purpose === "release" && onInspectProductChange && onApproveProductChange ? (
        <ProductChangeWallActions
          key={`${item.id}:${String(item.effect.workspaceId)}:${String(item.effect.revisionId)}`}
          item={item}
          disabled={busy || readOnly}
          onInspect={onInspectProductChange}
          onApprove={onApproveProductChange}
          note={note.trim() || undefined}
          onApproved={() => onNoteChange("")}
          onApply={() => onDecide("release")}
          onReject={() => onDecide("reject")}
        />
      ) : (
        <div className="firm-wall-review-actions">
          {item.purpose === "release" && !productChange && releaseReady && (!deploy || item.deployAuthorizedAt) ? (
            <Button disabled={busy || readOnly} onClick={() => void onDecide("release")}><Check aria-hidden="true" /> Release</Button>
          ) : null}
          {item.purpose === "release" && deploy && releaseReady && !item.deployAuthorizedAt ? (
            <Button disabled={busy || readOnly} onClick={() => void onDecide("authorize-deploy")}><ShieldCheck aria-hidden="true" /> Authorize deploy</Button>
          ) : null}
          {item.purpose === "release" ? (
            <Button variant="secondary" disabled={busy || readOnly} onClick={() => void onDecide("reject")}><X aria-hidden="true" /> Reject</Button>
          ) : null}
          {needsAnswer ? <>
            <Button disabled={busy || readOnly || !note.trim()} onClick={() => void onDecide("answer")}><MessageSquare aria-hidden="true" /> Answer</Button>
            <Button variant="secondary" disabled={busy || readOnly} onClick={() => void onDecide("dismiss")}>Dismiss</Button>
          </> : null}
          {item.purpose === "review-outcome" ? (
            <Button disabled={busy || readOnly} onClick={() => void onDecide("acknowledge")}><Check aria-hidden="true" /> Acknowledge</Button>
          ) : null}
          {item.purpose === "end-bet" ? <>
            <Button variant="destructive" disabled={busy || readOnly} onClick={() => void onDecide("kill")}>End this work</Button>
            <Button variant="secondary" disabled={busy || readOnly} onClick={() => void onDecide("keep")}>Keep it going</Button>
          </> : null}
        </div>
      )}
    </article>
  );
}
