// Everything the composer says around the field: the provenance line, the empty-venture first moves,
// the honest live status strip, and the drive receipt. Split from NowComposer so the input shell and
// its aftermath surface each stay within the component ceiling.
import { ArrowRight } from "lucide-react";
import type { FirmActiveDrive } from "@/api";
import type { DriveReceipt } from "./driveReceipt";

const EMPTY_SUGGESTIONS = [
  "Find the strongest next move",
  "Find the first 20 customers",
  "Sharpen the pitch",
  "Audit the first-run experience",
];

export function NowComposerFooter({
  showChips, readOnly, readOnlyReason, busy, error, recording, submissionMode, route,
  activeDrive, stopRequested, receipt, onPickSuggestion, onOpenResult,
}: {
  showChips: boolean; readOnly: boolean; readOnlyReason?: string | null; busy: boolean;
  error: string | null; recording: boolean; submissionMode: "auto" | "conversation" | "work" | "product-gtm";
  route: string; activeDrive?: FirmActiveDrive | null; stopRequested: boolean;
  receipt: DriveReceipt | null; onPickSuggestion: (intent: string) => void;
  onOpenResult?: (targetBetId: string | null) => void;
}) {
  return (
    <>
      <div className="now-composer-provenance" aria-hidden="true">
        Drover chooses how to do the work. Nothing leaves without your decision.
      </div>

      {showChips ? (
        <div className="now-composer-chips">
          {EMPTY_SUGGESTIONS.map((intent) => (
            <button key={intent} type="button" className="now-chip" onClick={() => onPickSuggestion(intent)} disabled={readOnly}>
              {intent}
            </button>
          ))}
        </div>
      ) : null}

      <div className="now-composer-feedback" aria-live="polite">
        {recording ? <span role="status">Listening…</span> : null}
        {busy ? <span role="status">{submissionMode === "work" ? "Starting coding work…" : submissionMode === "product-gtm" ? "Agents are shaping the workflow…" : submissionMode === "conversation" || route === "steer" ? "Sending…" : route === "correct" ? "Correcting…" : "Starting work…"}</span> : null}
        {!busy && activeDrive ? <span role="status">{stopRequested ? "Stopping at the next safe point…" : activeDrive.activity?.trim() || "Working… send a correction to steer, or stop the current step."}</span> : null}
        {error ? <span role="alert">{error}</span> : null}
        {readOnly && readOnlyReason && !error ? (
          <span className="now-composer-held" role="status">{readOnlyReason}</span>
        ) : null}
      </div>

      {receipt ? (
        <div className="now-drive-receipt" data-waiting={receipt.waiting ? "true" : "false"} role="status">
          <div className="now-drive-receipt-body">
            <span className="now-drive-receipt-headline">{receipt.headline}</span>
            {receipt.detail ? <span className="now-drive-receipt-detail">{receipt.detail}</span> : null}
          </div>
          {onOpenResult && receipt.targetBetId ? (
            <button type="button" className="now-drive-receipt-open" onClick={() => onOpenResult(receipt.targetBetId)}>
              {receipt.waiting ? "Make the decision" : "Open this direction"}
              <ArrowRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
