import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, Code2, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import {
  applyProductChange, discardProductChange, getProductChangeReadiness,
  listProductChanges, reviewProductChange, stageProductChangeProposal,
  type ProductChangeReceipt, type WorkspaceApplyReadiness, type WorkspaceChangeRevision,
} from "@/api";
import "@/styles/product-change-review.css";

type Review = { workspaceId: string; revision: WorkspaceChangeRevision; readiness?: WorkspaceApplyReadiness };
const label: Record<ProductChangeReceipt["status"], string> = { queued: "Queued", building: "Working", failed: "Failed", declined: "Needs direction", "ready-for-review": "Ready to review", interrupted: "Interrupted" };

function Diff({ value }: { value: string }) {
  return <pre className="pchange-diff" aria-label="Uncommitted code difference">{value.split("\n").map((line, i) => {
    const tone = line.startsWith("+++") || line.startsWith("---") ? "file" : line.startsWith("@@") ? "hunk" : line.startsWith("+") ? "add" : line.startsWith("-") ? "remove" : "context";
    return <span className={`pchange-diff-line is-${tone}`} key={`${i}-${line.slice(0, 12)}`}>{line || " "}</span>;
  })}</pre>;
}

export function ProductChangeReview({ projectId, refreshSignal, focusedChangeId }: { projectId: string; refreshSignal?: string | number; focusedChangeId?: string | null }) {
  const [changes, setChanges] = useState<ProductChangeReceipt[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [discardArmed, setDiscardArmed] = useState<string | null>(null);
  const [applyArmed, setApplyArmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = (await listProductChanges(projectId)).changes;
      const staged = await Promise.all(next.filter((item) => item.reviewWorkspaceId && item.reviewRevisionId).map(async (item) => {
        const workspaceId = item.reviewWorkspaceId!;
        const revision = item.reviewRevision;
        if (!revision) throw new Error("The staged product change review could not be found in this project.");
        const readiness = revision.status === "approved" ? (await getProductChangeReadiness(projectId, item.id)).readiness : undefined;
        return [item.id, { workspaceId, revision, readiness }] as const;
      }));
      setChanges(next); setReviews(Object.fromEntries(staged)); setError(null);
      if (focusedChangeId && next.some((change) => change.id === focusedChangeId)) setOpen(focusedChangeId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Local product changes could not be loaded."); }
    finally { setLoading(false); }
  }, [focusedChangeId, projectId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load, refreshSignal]);
  const readyCount = useMemo(() => changes.filter((change) => change.status === "ready-for-review").length, [changes]);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id); setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "That change did not go through. Local work is unchanged."); }
    finally { setBusy(null); }
  };
  const stage = (change: ProductChangeReceipt) => run(change.id, async () => {
    const { proposal } = await stageProductChangeProposal(projectId, change.id);
    setReviews((all) => ({ ...all, [change.id]: { workspaceId: proposal.workspaceId, revision: proposal.revision as WorkspaceChangeRevision } }));
  });
  const decide = (change: ProductChangeReceipt, decision: "approve" | "reject") => run(change.id, async () => {
    const current = reviews[change.id]; if (!current) return;
    const { revision } = await reviewProductChange(projectId, change.id, decision);
    const readiness = decision === "approve" ? (await getProductChangeReadiness(projectId, change.id)).readiness : undefined;
    setReviews((all) => ({ ...all, [change.id]: { ...current, revision, readiness } }));
  });
  const apply = (change: ProductChangeReceipt) => run(change.id, async () => {
    const current = reviews[change.id]; if (!current) return;
    const { revision } = await applyProductChange(projectId, change.id);
    setReviews((all) => ({ ...all, [change.id]: { ...current, revision } })); setApplyArmed(null);
  });
  const discard = (change: ProductChangeReceipt) => run(change.id, async () => { await discardProductChange(projectId, change.id); setDiscardArmed(null); setOpen(null); await load(); });

  return <section className="pchange" aria-labelledby="pchange-title">
    <header className="pchange-head"><div><span className="pchange-kicker">Local changes</span><h2 id="pchange-title">Product work waiting on you</h2></div>{readyCount ? <span className="pchange-count">{readyCount} ready</span> : null}</header>
    <p className="pchange-boundary"><ShieldCheck size={14} aria-hidden /> Uncommitted changes in isolated worktrees. Nothing is merged, pushed, deployed, or released.</p>
    {error ? <p className="pchange-error" role="alert">{error}</p> : null}
    {loading ? <div className="pchange-loading" aria-label="Loading local product changes"><span /><span /><span /></div> : null}
    {!loading && !changes.length ? <p className="pchange-empty">Ask Claude or Codex to change the product. Its local difference will wait here.</p> : null}
    <ol className="pchange-list">{changes.map((change) => {
      const expanded = open === change.id; const active = busy === change.id; const review = reviews[change.id]; const ready = change.status === "ready-for-review";
      const drifted = Boolean(review?.revision.patchHash && change.patchHash && review.revision.patchHash !== change.patchHash);
      return <li className={`pchange-row is-${change.status}`} key={change.id}>
        <button type="button" className="pchange-summary" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : change.id)}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span className="pchange-title">{change.title}</span><span className="pchange-runtime">{change.provider || "Runtime"}{change.model && change.model !== "default" ? ` · ${change.model}` : ""}</span><span className="pchange-status">{change.status === "failed" ? <TriangleAlert size={12} /> : ready ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}{label[change.status]}</span></button>
        {expanded ? <div className="pchange-detail">
          <dl className="pchange-facts"><div><dt>Workspace</dt><dd>{change.worktree || "No worktree retained"}</dd></div><div><dt>Verification</dt><dd>{change.verification}</dd></div></dl>
          {review?.revision.diff || change.diff ? <Diff value={review?.revision.diff ?? change.diff!} /> : <p className="pchange-no-diff">{ready ? "No readable difference." : "The difference appears when local work finishes."}</p>}
          {drifted ? <p className="pchange-error" role="alert">The isolated work changed after this review snapshot. The frozen diff above cannot be approved or applied; stage the current exact diff again.</p> : null}
          <div className="pchange-actions">
            {ready && (!review || drifted) ? <button className="pchange-primary" type="button" disabled={active} onClick={() => void stage(change)}><Code2 size={14} /> {drifted ? "Stage current exact diff" : "Stage exact diff for review"}</button> : null}
            {review?.revision.status === "proposed" && !drifted ? <><span className="pchange-confirm">Founder review</span><button className="pchange-primary" type="button" disabled={active} onClick={() => void decide(change, "approve")}>Approve local patch</button><button className="pchange-quiet" type="button" disabled={active} onClick={() => void decide(change, "reject")}>Reject</button></> : null}
            {review?.revision.status === "approved" && !drifted && applyArmed !== change.id ? <button className="pchange-primary" type="button" disabled={active || review.readiness?.ready === false} onClick={() => setApplyArmed(change.id)}>Apply approved patch…</button> : null}
            {review?.revision.status === "approved" && applyArmed === change.id ? <><span className="pchange-confirm">This writes the reviewed patch into your local product. It does not commit, merge, push, or deploy.</span><button className="pchange-danger" type="button" disabled={active || review.readiness?.ready === false} onClick={() => void apply(change)}>Yes, apply locally</button><button className="pchange-quiet" type="button" onClick={() => setApplyArmed(null)}>Not yet</button></> : null}
            {review && ["rejected", "applied", "reverted"].includes(review.revision.status) ? <span className="pchange-review-receipt">{review.revision.status === "applied" ? "Applied locally" : review.revision.status === "rejected" ? "Rejected" : "Reverted"}</span> : null}
            {discardArmed === change.id ? <><span className="pchange-confirm">Discard this isolated work?</span><button className="pchange-danger" type="button" disabled={active} onClick={() => void discard(change)}>Yes, discard</button><button className="pchange-quiet" type="button" onClick={() => setDiscardArmed(null)}>Keep it</button></> : <button className="pchange-quiet" type="button" disabled={active || ["queued", "building"].includes(change.status)} onClick={() => setDiscardArmed(change.id)}><Trash2 size={13} /> Discard local work</button>}
          </div>
        </div> : null}
      </li>;
    })}</ol>
  </section>;
}
