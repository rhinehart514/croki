// Everything the composer says around the field: the provenance line, the empty-venture first moves,
// the honest live status strip, and the drive receipt. Split from NowComposer so the input shell and
// its aftermath surface each stay within the component ceiling.
import { ArrowRight } from "lucide-react";
import type { FirmActiveDrive } from "@/api";
import type { DriveReceipt } from "./driveReceipt";

const EMPTY_SUGGESTIONS = [
  "Fix a bug in this project",
  "Build a feature from this description",
  "Review this repository",
  "Explain how this code works",
];

export function NowComposerFooter({
  showChips, readOnly, readOnlyReason, busy, error, recording, voiceIssue, submissionMode, route,
  activeDrive, stopRequested, hasDraft = false, receipt, onPickSuggestion, onOpenResult,
}: {
  showChips: boolean; readOnly: boolean; readOnlyReason?: string | null; busy: boolean;
  error: string | null; recording: boolean; voiceIssue?: string | null;
  submissionMode: "auto" | "conversation" | "work";
  route: string; activeDrive?: FirmActiveDrive | null; stopRequested: boolean; hasDraft?: boolean;
  receipt: DriveReceipt | null; onPickSuggestion: (intent: string) => void;
  onOpenResult?: (targetBetId: string | null) => void;
}) {
  return (
    <>
      <div className="now-composer-provenance" aria-hidden="true">
        Your selected Claude or Codex model works in this repository. You approve every outward action.
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
        {recording ? <span className="now-composer-listening" role="status"><i aria-hidden="true" />Listening — speak naturally; your words appear above.</span> : null}
        {!recording && voiceIssue && !error ? <span role="alert">{voiceIssue}</span> : null}
        {busy ? <span role="status">{submissionMode === "work" ? "Starting work…" : submissionMode === "conversation" || route === "steer" ? "Sending…" : route === "correct" ? "Correcting…" : "Starting work…"}</span> : null}
        {!busy && activeDrive ? <span role="status">{stopRequested ? "Stopping at the next safe point…" : hasDraft ? "Your message will reach the running agent." : activeDrive.activity?.trim() || "Working… send a correction to steer, or stop the current step."}</span> : null}
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
