import { useState } from "react";
import { Check, LoaderCircle, Route } from "lucide-react";
import { adoptJourneyImport, type JourneyMappingProposalRecord, type JourneyObservationSnapshot } from "@/api";

export function JourneyMappingReview({ ventureId, proposal, readOnlyReason, onAdopted }: {
  ventureId: string;
  proposal: JourneyMappingProposalRecord;
  readOnlyReason: string | null;
  onAdopted: (snapshot: JourneyObservationSnapshot) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counts = proposal.preview;
  const adopt = async () => {
    if (busy || readOnlyReason) return;
    setBusy(true); setError(null);
    try {
      const result = await adoptJourneyImport(ventureId, proposal.importRef, proposal.mapping, {
        expectedPageModelRevision: proposal.pageModelRevision,
        threadRef: proposal.threadRef,
        messageRef: proposal.messageRef,
        sourceRef: proposal.mapping.sourceRef,
      });
      onAdopted(result.snapshot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Croki could not adopt this observed journey mapping.");
    } finally {
      setBusy(false);
    }
  };
  return <section className="journey-mapping-review" aria-label="Observed journey mapping proposal">
    <header>
      <span><Route aria-hidden="true" /></span>
      <div><strong>Observed journey ready to review</strong><small>Proposed in this Thread · Product truth remains unchanged</small></div>
    </header>
    <div className="journey-mapping-review-counts">
      <span><strong>{counts.pageCounts.reduce((sum, entry) => sum + entry.count, 0).toLocaleString()}</strong><small>page observations</small></span>
      <span><strong>{counts.transitions.reduce((sum, entry) => sum + entry.count, 0).toLocaleString()}</strong><small>transitions</small></span>
      <span><strong>{counts.dropOffs.reduce((sum, entry) => sum + entry.count, 0).toLocaleString()}</strong><small>drop-offs</small></span>
    </div>
    {counts.unmatchedRoutes.length || counts.rejectedRows.count ? <p>
      {counts.unmatchedRoutes.length ? `${counts.unmatchedRoutes.length} unmatched route ${counts.unmatchedRoutes.length === 1 ? "token remains" : "tokens remain"}.` : ""}
      {counts.unmatchedRoutes.length && counts.rejectedRows.count ? " " : ""}
      {counts.rejectedRows.count ? `${counts.rejectedRows.count} rejected ${counts.rejectedRows.count === 1 ? "row" : "rows"}.` : ""}
    </p> : null}
    <footer>
      <span>{proposal.preview.window.from} to {proposal.preview.window.to} · {proposal.preview.window.timezone}</span>
      <button type="button" disabled={busy || Boolean(readOnlyReason)} title={readOnlyReason ?? undefined} onClick={() => void adopt()}>
        {busy ? <LoaderCircle className="is-spinner" aria-hidden="true" /> : <Check aria-hidden="true" />}Adopt observations
      </button>
    </footer>
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
