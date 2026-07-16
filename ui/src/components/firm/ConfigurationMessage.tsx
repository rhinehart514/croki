import { useState } from "react";
import { Check, RotateCcw, Settings2 } from "lucide-react";
import { applyConfigurationProposal, restoreConfiguration } from "@/api";
import type { FirmConversationMessage } from "@/types";
import { AutoHeight } from "@/components/animate-ui/primitives/effects/auto-height";
import { Button } from "@/components/ui/button";
import { ConfigurationDiff } from "./ConfigurationDiff";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function ConfigurationMessage({
  ventureId,
  message,
  currentRevision,
  onChanged,
  readOnly = false,
  readOnlyReason = "Reconnecting before configuration can change…",
}: {
  ventureId: string;
  message: FirmConversationMessage;
  currentRevision: number;
  onChanged: () => void;
  readOnly?: boolean;
  readOnlyReason?: string;
}) {
  const proposal = message.configurationProposal;
  const receipt = message.configurationReceipt;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  const apply = async () => {
    if (!proposal?.id || busy || readOnly) return;
    setBusy(true);
    setError(null);
    try {
      await applyConfigurationProposal(ventureId, proposal.id, currentRevision);
      setSettled(true);
      onChanged();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!receipt?.id || busy || readOnly) return;
    setBusy(true);
    setError(null);
    try {
      await restoreConfiguration(ventureId, currentRevision, receipt.id);
      setSettled(true);
      onChanged();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  if (proposal) {
    const applied = proposal.status === "applied" || settled;
    const stale = currentRevision !== proposal.baseRevision;
    return (
      <article className="firm-app-configuration-card" aria-label="Firm configuration proposal">
        <header>
          <span><Settings2 aria-hidden="true" /> Proposed configuration</span>
          <strong>v{proposal.baseRevision} → v{proposal.proposedRevision}</strong>
        </header>
        <p>{proposal.summary ?? message.content}</p>
        {proposal.rationale ? <small>{proposal.rationale}</small> : null}
        <ConfigurationDiff entries={proposal.diff ?? []} />
        <AutoHeight deps={[applied, error, stale, readOnly]}>
          <div className="firm-app-configuration-actions">
            {applied ? (
              <span role="status"><Check aria-hidden="true" /> Applied to the live firm</span>
            ) : (
              <Button type="button" size="sm" onClick={() => void apply()} disabled={busy || stale || readOnly}>
                {busy ? "Applying…" : "Apply change"}
              </Button>
            )}
            {!applied && stale ? <span>This proposal was based on an earlier configuration.</span> : null}
            {!applied && readOnly ? <span role="status">{readOnlyReason}</span> : null}
            {error ? <span role="alert">{error}</span> : null}
          </div>
        </AutoHeight>
      </article>
    );
  }

  if (!receipt) return null;
  return (
    <article className="firm-app-configuration-card firm-app-configuration-receipt" aria-label="Firm configuration receipt">
      <header>
        <span><Check aria-hidden="true" /> Configuration applied</span>
        <strong>v{receipt.revision}</strong>
      </header>
      <p>{receipt.summary ?? message.content}</p>
      <ConfigurationDiff entries={receipt.diff ?? []} />
      <AutoHeight deps={[settled, error, readOnly]}>
        <div className="firm-app-configuration-actions">
          {settled ? <span role="status"><Check aria-hidden="true" /> Restored as a new version</span> : (
            <Button type="button" size="sm" variant="outline" onClick={() => void undo()} disabled={busy || readOnly || currentRevision !== receipt.revision}>
              <RotateCcw aria-hidden="true" /> {busy ? "Restoring…" : "Undo"}
            </Button>
          )}
          {!settled && currentRevision !== receipt.revision ? <span>Undo is available from the current version’s receipt.</span> : null}
          {!settled && readOnly ? <span role="status">{readOnlyReason}</span> : null}
          {error ? <span role="alert">{error}</span> : null}
        </div>
      </AutoHeight>
    </article>
  );
}
