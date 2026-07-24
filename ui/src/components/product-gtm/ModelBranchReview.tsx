import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { closeModelBranch, getModelBranch, keepModelChange } from "@/api";
import type { FirmModelBranchProjection } from "@/types";

function changeName(change: FirmModelBranchProjection["changes"][number], projection: FirmModelBranchProjection) {
  if (change.proposedRecord && "name" in change.proposedRecord && change.proposedRecord.name) return change.proposedRecord.name;
  const id = change.targetRef?.replace(/^[^:]+:/, "");
  return projection.current.objects.find((object) => object.id === id)?.name ?? change.targetRef ?? "this connection";
}

// The founder register over the branch/merge machinery: each proposed change is kept on its own, at the
// point of encounter. There is no bulk keep and no branch/merge/provisional vocabulary — the founder keeps
// one change at a time and the audit receipt stays underneath. Keeping is not yet reversible, so that
// dependency is stated here rather than implied (decisions 29–30).
function changeVerb(operation: string) {
  if (operation === "create") return "Add";
  if (operation === "remove") return "Remove";
  return "Change";
}

export function ModelBranchReview({ ventureId, branchId, readOnly, inline = false, onClose, onContinue, onChanged }: { ventureId: string; branchId: string; readOnly: boolean; inline?: boolean; onClose: () => void; onContinue: (branchRef: string) => void; onChanged: () => void }) {
  const [projection, setProjection] = useState<FirmModelBranchProjection | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { let live = true; void getModelBranch(ventureId, branchId).then(({ branch }) => { if (!live) return; setProjection(branch); }).catch((reason) => live && setError(reason instanceof Error ? reason.message : "This suggestion could not load.")); return () => { live = false; }; }, [branchId, ventureId]);
  const conflicts = useMemo(() => new Set(projection?.conflicts.map((entry) => entry.changeRef.replace(/^model-change:/, "")) ?? []), [projection]);
  if (!projection) return <aside className="product-gtm-review" data-inline={inline ? "true" : undefined} aria-label="Suggested changes"><header><span>Suggested changes</span><button type="button" onClick={onClose} aria-label="Close"><X /></button></header><p>{error ?? "Reading the change…"}</p></aside>;
  const keep = async (changeId: string) => {
    setBusy(changeId); setError(null);
    try { await keepModelChange(ventureId, branchId, `model-change:${changeId}`); setKept((current) => new Set(current).add(changeId)); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "That change could not be kept."); }
    finally { setBusy(null); }
  };
  const remaining = projection.changes.filter((change) => !kept.has(change.id)).length;
  return <aside className="product-gtm-review" data-inline={inline ? "true" : undefined} aria-label={`${projection.branch.name} suggested changes`}>
    <header><div><span>Suggested changes</span><strong>{projection.branch.name}</strong></div><button type="button" onClick={onClose} aria-label="Close"><X /></button></header>
    <section className="product-gtm-review-question"><small>The question</small><p>{projection.branch.question}</p></section>
    {projection.conflicts.length ? <p className="product-gtm-conflict" role="alert"><AlertTriangle />What&apos;s current changed since this was suggested. Review before you keep it.</p> : null}
    <section className="product-gtm-deltas"><h2>What would change</h2>{projection.changes.map((change) => {
      const isKept = kept.has(change.id);
      const blocked = conflicts.has(change.id);
      return <div className="product-gtm-delta" key={change.id} data-conflict={blocked ? "true" : undefined} data-kept={isKept ? "true" : undefined}>
        <span><small>{changeVerb(change.operation)}{change.targetFamily === "relationships" ? " · connection" : ""}</small><strong>{changeName(change, projection)}</strong><p>{change.rationale}</p></span>
        {isKept
          ? <span className="product-gtm-delta-kept"><Check aria-label="Kept" />Kept</span>
          : <button type="button" className="is-founder" disabled={readOnly || Boolean(busy) || blocked} onClick={() => void keep(change.id)}>{busy === change.id ? "Keeping…" : "Keep"}</button>}
      </div>;
    })}</section>
    {error ? <p className="product-gtm-error" role="alert">{error}</p> : null}
    <p className="product-gtm-review-note">Keeping makes one change real now. It can&apos;t be undone yet, so keep only what you&apos;re sure of.</p>
    <footer><button type="button" className="is-secondary" onClick={() => onContinue(`model-branch:${branchId}`)}>Continue work</button><button type="button" className="is-quiet" disabled={readOnly || Boolean(busy)} onClick={() => void closeModelBranch(ventureId, branchId, "Dismiss the changes not kept; keep the history.").then(() => { onChanged(); onClose(); })}>{remaining ? "Dismiss the rest" : "Done"}</button></footer>
  </aside>;
}
