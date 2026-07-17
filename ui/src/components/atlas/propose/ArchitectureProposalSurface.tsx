import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  FirmArchitectureDocument,
  FirmArchitectureProposalDecisionResponse,
} from "@/types";
import type { ArchitectureProposalViewModel } from "../architectureProposalProjection";
import { useArchitectureProposals } from "../useArchitectureProposals";
import { ProposalGhostScene } from "./ProposalGhostScene";
import {
  groupProposalOperationsByMotion,
  type ProposalMotionAdjustment,
} from "./proposalMotionGroups";
import "./architecture-proposal.css";

export type ArchitectureProposalSurfaceProps = {
  ventureId: string;
  baseArchitecture?: FirmArchitectureDocument | null;
  readOnly?: boolean;
  pollMs?: number;
  className?: string;
  onDecision?: (result: FirmArchitectureProposalDecisionResponse) => void;
  onAdjustMotion?: (adjustment: ProposalMotionAdjustment) => void;
};

export type ArchitectureProposalCardProps = {
  view: ArchitectureProposalViewModel;
  deciding?: boolean;
  error?: string | null;
  onAccept: () => Promise<void> | void;
  onAdjustMotion?: (adjustment: ProposalMotionAdjustment) => void;
};

const ROLE_ORDER = ["concept", "product-loop", "system", "motion", "campaign"] as const;

function quantity(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function receiptLines(view: ArchitectureProposalViewModel) {
  const counts = view.scene.receiptCounts;
  const lines = [quantity(counts.operations, "operation")];
  for (const role of ROLE_ORDER) {
    const count = counts.createdRoles[role];
    if (count) lines.push(quantity(count, role === "product-loop" ? "product loop" : role === "motion" ? "route" : role === "campaign" ? "outreach effort" : role));
  }
  if (counts.createdConnections) lines.push(quantity(counts.createdConnections, "connection"));
  if (counts.createdGroups) lines.push(quantity(counts.createdGroups, "group"));
  if (counts.appliedEvidence) lines.push(quantity(counts.appliedEvidence, "evidence annotation"));
  if (counts.updatedObjects) lines.push(quantity(counts.updatedObjects, "updated object"));
  if (counts.removedObjects) lines.push(quantity(counts.removedObjects, "removed object"));
  return lines;
}

function decisionBlockCopy(view: ArchitectureProposalViewModel) {
  if (view.decisionBlock === "stale") {
    return `Based on revision ${view.proposal.baseRevision}; this proposal must be refreshed before acceptance.`;
  }
  if (view.decisionBlock === "read-only") return "This surface is read-only. The proposal can be inspected but not accepted here.";
  if (view.decisionBlock === "settled") return "This proposal has already been decided.";
  return null;
}

export function ArchitectureProposalCard({
  view,
  deciding = false,
  error = null,
  onAccept,
  onAdjustMotion,
}: ArchitectureProposalCardProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const motionGroups = useMemo(() => groupProposalOperationsByMotion(view), [view]);
  const blockCopy = decisionBlockCopy(view);

  const accept = async () => {
    if (!view.canDecide || deciding) return;
    setLocalError(null);
    try {
      await onAccept();
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "The proposal could not be accepted.");
    }
  };

  return (
    <article
      className="atlas-proposal-card"
      data-stale={view.stale ? "true" : "false"}
      data-read-only={view.readOnly ? "true" : "false"}
      aria-labelledby={`atlas-proposal-${view.proposal.id}`}
    >
      <header className="atlas-proposal-heading">
        <div>
          <span>Proposed architecture</span>
          <h2 id={`atlas-proposal-${view.proposal.id}`}>{view.proposal.intent}</h2>
        </div>
        <div className="atlas-proposal-heading-actions">
          <small>Base revision {view.proposal.baseRevision}</small>
          <Button type="button" disabled={!view.canDecide || deciding} onClick={() => void accept()}>
            {deciding ? "Accepting…" : "Accept whole proposal"}
          </Button>
          {blockCopy ? <em>{blockCopy}</em> : null}
        </div>
      </header>

      <ProposalGhostScene scene={view.scene} />

      <div className="atlas-proposal-audit">
        <section>
          <h3>Expected effect</h3>
          <p>{view.expectedExecutionEffect ?? "Not specified by this proposal."}</p>
          {view.affectedExecutionContexts.length ? (
            <ul>{view.affectedExecutionContexts.map((context) => <li key={context}>{context}</li>)}</ul>
          ) : null}
        </section>
        <section>
          <h3>Assumptions</h3>
          {view.assumptions.length ? (
            <ul>{view.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
          ) : <p>None recorded in the proposal.</p>}
        </section>
        <section>
          <h3>Gaps</h3>
          {view.scene.gaps.length ? (
            <ul>{view.scene.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
          ) : <p>No projection gaps were identified from these operations.</p>}
        </section>
        <section>
          <h3>Proposed receipt</h3>
          <ul className="atlas-proposal-receipt">
            {receiptLines(view).map((line) => <li key={line}>{line}</li>)}
          </ul>
          {view.evidenceRefs.length ? (
            <details>
              <summary>{quantity(view.evidenceRefs.length, "evidence reference")}</summary>
              <ul>{view.evidenceRefs.map((ref) => <li key={ref}>{ref}</li>)}</ul>
            </details>
          ) : null}
        </section>
        <section>
          <h3>Verified assembly progress</h3>
          {view.assemblyEvents.length ? (
            <>
              <p>The full proposal validated before this ordered batch was recorded.</p>
              <ol className="atlas-proposal-receipt" aria-label="Validated proposal operations">
                {view.assemblyEvents.map((event) => (
                  <li key={`${event.operationIndex}-${event.op}`}>{event.label}</li>
                ))}
              </ol>
            </>
          ) : <p>No verified assembly receipt was stored for this proposal.</p>}
        </section>
      </div>

      {onAdjustMotion && motionGroups.length ? (
        <section className="atlas-proposal-adjustments" aria-label="Adjust proposed paths">
          <header>
            <h3>Adjust by path</h3>
            <p>Only operations attributable to one path are grouped here. Shared operations stay with the whole proposal.</p>
          </header>
          {motionGroups.map((group) => (
            <div key={group.motionId}>
              <span>
                <strong>{group.motionName}</strong>
                <small>
                  {quantity(group.operationIndexes.length, "exclusive operation")}
                  {group.sharedOperationIndexes.length ? ` · ${quantity(group.sharedOperationIndexes.length, "shared operation")} excluded` : ""}
                </small>
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => onAdjustMotion(group)}>
                Adjust path
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      {localError || error ? <p className="atlas-proposal-error" role="alert">{localError ?? error}</p> : null}
    </article>
  );
}

export function ArchitectureProposalSurface({
  ventureId,
  baseArchitecture = null,
  readOnly = false,
  pollMs,
  className,
  onDecision,
  onAdjustMotion,
}: ArchitectureProposalSurfaceProps) {
  const proposals = useArchitectureProposals(ventureId, { baseArchitecture, readOnly, pollMs });
  if (!proposals.pending.length) return null;

  return (
    <aside className={cn("atlas-proposal-surface", className)} aria-label="Pending architecture proposals">
      {proposals.pending.map((view) => (
        <ArchitectureProposalCard
          key={view.proposal.id}
          view={view}
          deciding={proposals.decidingId === view.proposal.id}
          error={proposals.error}
          onAdjustMotion={onAdjustMotion}
          onAccept={async () => {
            const result = await proposals.decide(view.proposal.id, { decision: "accept" });
            onDecision?.(result);
          }}
        />
      ))}
    </aside>
  );
}
