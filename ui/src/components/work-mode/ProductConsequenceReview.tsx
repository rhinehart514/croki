import { useState } from "react";
import { reviewCodingProductConsequence, type CodingWorkspace } from "@/api";

const REVIEW_LABEL: Record<string, string> = { provisional: "Provisional", adopted: "Adopted", rejected: "Rejected" };
function humanize(value: string) {
  const text = value.replaceAll("-", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ProductConsequenceReview({ ventureId, workspace, readOnlyReason, busy, onBusy, onError, onChanged }: {
  ventureId: string;
  workspace: CodingWorkspace;
  readOnlyReason: string | null;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onError: (error: string | null) => void;
  onChanged: () => void;
}) {
  const consequence = workspace.productConsequence!;
  const [capability, setCapability] = useState(consequence.capability);
  const [releaseQuestion, setReleaseQuestion] = useState(consequence.releaseQuestion);
  const decide = async (decision: "revise" | "adopt" | "reject") => {
    onBusy(true); onError(null);
    try {
      await reviewCodingProductConsequence(ventureId, workspace.id, { decision, capability, releaseQuestion });
      onChanged();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      onBusy(false);
    }
  };
  const review = consequence.review?.decision ?? "provisional";
  const disabled = Boolean(readOnlyReason || busy || !capability.trim() || !releaseQuestion.trim());

  return <section className="code-workspace-section code-workspace-product" data-review={review}>
    <header><span>Product consequence</span><strong>{REVIEW_LABEL[review] ?? humanize(review)}</strong></header>
    <p className="code-workspace-product-intro">This is Drover’s provisional interpretation of the verified change. It does not alter Product / GTM truth until you adopt it.</p>
    <label>
      <span>What became possible</span>
      <textarea aria-label="What became possible" value={capability} onChange={(event) => setCapability(event.target.value)} disabled={Boolean(readOnlyReason || busy)} />
    </label>
    <ul>{consequence.claims.map((claim) => <li key={`${claim.status}:${claim.statement}`}><span>{humanize(claim.status)}</span><p>{claim.statement}</p></li>)}</ul>
    <label className="code-workspace-product-question">
      <span>Distribution question</span>
      <textarea aria-label="Distribution question" value={releaseQuestion} onChange={(event) => setReleaseQuestion(event.target.value)} disabled={Boolean(readOnlyReason || busy)} />
    </label>
    {readOnlyReason ? <p>{readOnlyReason}</p> : null}
    <div className="code-workspace-action-row">
      <button type="button" disabled={disabled} onClick={() => void decide("adopt")}>{review === "adopted" ? "Update adopted consequence" : "Adopt Product consequence"}</button>
      {review !== "adopted" ? <>
        <button type="button" disabled={disabled} onClick={() => void decide("revise")}>Save as provisional</button>
        <button type="button" disabled={Boolean(readOnlyReason || busy)} onClick={() => void decide("reject")}>Reject interpretation</button>
      </> : null}
    </div>
  </section>;
}
