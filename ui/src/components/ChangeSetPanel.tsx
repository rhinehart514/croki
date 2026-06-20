import {
  AlertTriangle, Check, GitCommitHorizontal, GitBranch, LoaderCircle,
  RotateCcw, ShieldCheck, X,
} from "lucide-react";
import { useState } from "react";
import { CitationList } from "@/components/CitationList";
import { Button } from "@/components/ui/button";
import type { ApplyReadiness, GTMRevision } from "@/types";

function DiffView({ diff }: { diff: string }) {
  if (!diff.trim()) return <p className="empty-copy">This change set did not produce a patch.</p>;
  return (
    <pre className="diff-view" aria-label="Proposed repository diff">
      {diff.split("\n").map((line, index) => {
        const kind = line.startsWith("+") && !line.startsWith("+++") ? "add"
          : line.startsWith("-") && !line.startsWith("---") ? "remove"
            : line.startsWith("@@") ? "hunk" : "context";
        return <span className={`diff-line diff-${kind}`} key={`${index}-${line}`}>{line || " "}</span>;
      })}
    </pre>
  );
}

export function ChangeSetPanel({
  revision,
  readiness,
  busy,
  error,
  onReview,
  onApply,
  onRevert,
  onVerify,
}: {
  revision: GTMRevision;
  readiness: ApplyReadiness | null;
  busy: boolean;
  error: string | null;
  onReview: (decision: "approve" | "reject", note: string) => void;
  onApply: () => void;
  onRevert: () => void;
  onVerify: () => void;
}) {
  const [note, setNote] = useState(revision.review?.note ?? "");
  const [confirming, setConfirming] = useState<"apply" | "revert" | null>(null);

  return (
    <div className="change-set-panel">
      <div className="change-set-heading">
        <span className={`revision-status revision-${revision.status}`}>{revision.status}</span>
        <h1>Repository change set</h1>
        <p>{revision.summary}</p>
      </div>

      <dl className="change-meta">
        <div><dt>Branch</dt><dd><GitBranch aria-hidden="true" />{revision.branch}</dd></div>
        <div><dt>Worktree</dt><dd>{revision.worktree}</dd></div>
        <div><dt>Changes</dt><dd>{revision.diffStat || "No file changes"}</dd></div>
      </dl>

      {revision.error ? (
        <div className="persistent-alert" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div><strong>Change set failed</strong><p>{revision.error}</p></div>
        </div>
      ) : null}
      {error ? (
        <div className="persistent-alert" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div><strong>Action blocked</strong><p>{error}</p></div>
        </div>
      ) : null}

      {revision.status === "proposed" ? (
        <section className="review-controls">
          <label>
            Review note
            <textarea
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why is this safe, unsafe, or incomplete?"
              rows={3}
              value={note}
            />
          </label>
          <div className="review-actions">
            <Button disabled={busy} onClick={() => onReview("approve", note)} type="button">
              <ShieldCheck aria-hidden="true" />Approve change set
            </Button>
            <Button className="secondary-button" disabled={busy} onClick={() => onReview("reject", note)} type="button">
              <X aria-hidden="true" />Reject
            </Button>
          </div>
        </section>
      ) : null}

      {revision.review ? (
        <div className="decision-note">
          <strong>{revision.review.decision === "approve" ? "Approved" : "Rejected"}</strong>
          <span>{new Date(revision.review.decidedAt).toLocaleString()}</span>
          {revision.review.note ? <p>{revision.review.note}</p> : null}
        </div>
      ) : null}

      {revision.status === "approved" ? (
        <section className="apply-zone">
          <div className="apply-readiness">
            <strong>{readiness?.ready ? "Ready to apply locally" : "Direct apply is blocked"}</strong>
            <p>
              The isolated branch and worktree are always available for continued review.
              {readiness?.reasons.length ? ` ${readiness.reasons.join(" ")}` : ""}
            </p>
          </div>
          {confirming === "apply" ? (
            <div className="inline-confirmation" role="alert">
              <strong>Apply this patch to the source repository?</strong>
              <p>This changes local files but does not commit, push, or deploy.</p>
              <div>
                <Button disabled={busy || !readiness?.ready} onClick={onApply} type="button">
                  {busy ? <LoaderCircle className="spin" /> : <GitCommitHorizontal />}Apply patch
                </Button>
                <Button className="secondary-button" onClick={() => setConfirming(null)} type="button">Cancel</Button>
              </div>
            </div>
          ) : (
            <Button disabled={busy || !readiness?.ready} onClick={() => setConfirming("apply")} type="button">
              <GitCommitHorizontal aria-hidden="true" />Apply to source repository
            </Button>
          )}
        </section>
      ) : null}

      {revision.status === "applied" ? (
        <section className="apply-zone">
          <Button disabled={busy} onClick={onVerify} type="button">
            <Check aria-hidden="true" />Verify the outcome
          </Button>
          {confirming === "revert" ? (
            <div className="inline-confirmation" role="alert">
              <strong>Reverse this patch?</strong>
              <p>The reversal is checked before local files are changed.</p>
              <div>
                <Button disabled={busy} onClick={onRevert} type="button">
                  {busy ? <LoaderCircle className="spin" /> : <RotateCcw />}Revert patch
                </Button>
                <Button className="secondary-button" onClick={() => setConfirming(null)} type="button">Cancel</Button>
              </div>
            </div>
          ) : (
            <Button className="secondary-button" disabled={busy} onClick={() => setConfirming("revert")} type="button">
              <RotateCcw aria-hidden="true" />Revert local patch
            </Button>
          )}
        </section>
      ) : null}

      <section className="detail-section">
        <h2>Proposed diff</h2>
        <DiffView diff={revision.diff} />
      </section>
      <section className="detail-section">
        <h2>Grounding evidence</h2>
        <CitationList citations={revision.evidence} />
      </section>
    </div>
  );
}
