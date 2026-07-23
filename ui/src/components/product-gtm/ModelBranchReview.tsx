import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, GitMerge, X } from "lucide-react";
import { closeModelBranch, getModelBranch, mergeModelBranch } from "@/api";
import type { FirmModelBranchProjection } from "@/types";

function changeName(change: FirmModelBranchProjection["changes"][number], projection: FirmModelBranchProjection) {
  if (change.proposedRecord && "name" in change.proposedRecord && change.proposedRecord.name) return change.proposedRecord.name;
  const id = change.targetRef?.replace(/^[^:]+:/, "");
  return projection.current.objects.find((object) => object.id === id)?.name ?? change.targetRef ?? "Product relationship";
}

export function ModelBranchReview({ ventureId, branchId, readOnly, inline = false, onClose, onContinue, onChanged }: { ventureId: string; branchId: string; readOnly: boolean; inline?: boolean; onClose: () => void; onContinue: (branchRef: string) => void; onChanged: () => void }) {
  const [projection, setProjection] = useState<FirmModelBranchProjection | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; void getModelBranch(ventureId, branchId).then(({ branch }) => { if (!live) return; setProjection(branch); setSelected(new Set(branch.changes.map((change) => change.id))); }).catch((reason) => live && setError(reason instanceof Error ? reason.message : "This Product alternative could not load.")); return () => { live = false; }; }, [branchId, ventureId]);
  const conflicts = useMemo(() => new Set(projection?.conflicts.map((entry) => entry.changeRef.replace(/^model-change:/, "")) ?? []), [projection]);
  if (!projection) return <aside className="product-gtm-review" data-inline={inline ? "true" : undefined} aria-label="Product model review"><header><span>Product alternative</span><button type="button" onClick={onClose} aria-label="Close"><X /></button></header><p>{error ?? "Reading the delta…"}</p></aside>;
  const merge = async () => {
    setBusy(true); setError(null);
    try { await mergeModelBranch(ventureId, branchId, [...selected].map((id) => `model-change:${id}`), `Make selected changes from ${projection.branch.name} current.`); onChanged(); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The Product changes could not be merged."); }
    finally { setBusy(false); }
  };
  return <aside className="product-gtm-review" data-inline={inline ? "true" : undefined} aria-label={`${projection.branch.name} Product model review`}>
    <header><div><span>Provisional Product model</span><strong>{projection.branch.name}</strong></div><button type="button" onClick={onClose} aria-label="Close"><X /></button></header>
    <section className="product-gtm-review-question"><small>The question</small><p>{projection.branch.question}</p></section>
    {projection.conflicts.length ? <p className="product-gtm-conflict" role="alert"><AlertTriangle />Current truth changed beneath {projection.conflicts.length} selected {projection.conflicts.length === 1 ? "change" : "changes"}. Review before merging.</p> : null}
    <section className="product-gtm-deltas"><h2>Exact Product / GTM delta</h2>{projection.changes.map((change) => <label key={change.id} data-conflict={conflicts.has(change.id) ? "true" : undefined}>
      <input type="checkbox" checked={selected.has(change.id)} disabled={readOnly || conflicts.has(change.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(change.id); else next.delete(change.id); return next; })} />
      <span><small>{change.operation} · {change.targetFamily === "objects" ? "Product/GTM truth" : "relationship"}</small><strong>{changeName(change, projection)}</strong><p>{change.rationale}</p></span>
      {selected.has(change.id) ? <Check aria-label="Selected" /> : null}
    </label>)}</section>
    {error ? <p className="product-gtm-error" role="alert">{error}</p> : null}
    <footer><button type="button" className="is-secondary" onClick={() => onContinue(`model-branch:${branchId}`)}>Continue work</button><button type="button" className="is-quiet" disabled={readOnly || busy} onClick={() => void closeModelBranch(ventureId, branchId, "Keep its history; stop active work on this alternative.").then(() => { onChanged(); onClose(); })}>Close branch</button><button type="button" className="is-founder" disabled={readOnly || busy || selected.size === 0 || [...selected].some((id) => conflicts.has(id))} onClick={() => void merge()}><GitMerge />{busy ? "Making current…" : `Make ${selected.size} current`}</button></footer>
  </aside>;
}
