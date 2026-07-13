import { useEffect, useState } from "react";
import { Check, GitCompareArrows, LoaderCircle } from "lucide-react";
import { createWorkArtifact, listWorkArtifacts } from "@/api";
import { getIdentity } from "@/lib/identity";
import { statusLabel } from "@/lib/status";
import { humanizeSlugsInText } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import type { OperatorEvent, OperatorSession } from "@/types";
import { artifactMatchesComparison, comparisonArtifactFor, type RuntimeBranchComparisonModel } from "@/lib/runtimeBranchComparison";
import type { WorkArtifactRevision } from "@/openCanvasTypes";
import "@/styles/runtime-branch-comparison.css";

function runtimeName(session: OperatorSession): "Claude" | "Codex" {
  return session.worker?.runtime === "codex" ? "Codex" : "Claude";
}

function readableModel(session: OperatorSession): string {
  return session.worker?.model?.trim() || session.model?.trim() || "Default model";
}

function latestUsefulEvent(events: OperatorEvent[]): OperatorEvent | null {
  return [...events].reverse().find((event) =>
    event.type === "operator_note"
    || event.type === "teammate_said"
    || event.type === "session_completed"
    || event.type === "run_completed"
    || event.type === "tool_result",
  ) ?? events.at(-1) ?? null;
}

function branchReadout(session: OperatorSession): string {
  const event = latestUsefulEvent(session.events ?? []);
  const raw = session.summary?.trim() || event?.detail?.trim() || event?.title?.trim();
  if (raw) return humanizeSlugsInText(raw);
  if (session.status === "running" || session.status === "ready") return "Starting from the shared canvas context.";
  return "No response has landed yet.";
}

function isWorking(session: OperatorSession): boolean {
  return session.status === "running" || session.status === "ready";
}

export function RuntimeBranchComparison({
  comparison,
  onChoose,
  onKeepBoth,
  onMaterialized,
}: {
  comparison: RuntimeBranchComparisonModel;
  onChoose: (sessionId: string) => void | Promise<void>;
  onKeepBoth: () => void;
  onMaterialized?: (ref: { type: "work-artifact"; id: string }) => void;
}) {
  const branches = [...comparison.branches].sort((a, b) => runtimeName(a).localeCompare(runtimeName(b)));
  const selected = branches.find((branch) => branch.id === comparison.selectedSessionId) ?? null;
  const projectId = branches[0]?.projectId && branches.every((branch) => branch.projectId === branches[0].projectId) ? branches[0].projectId : null;
  const [artifact, setArtifact] = useState<WorkArtifactRevision | null>(null);
  const [materializing, setMaterializing] = useState(false);
  const [materializeError, setMaterializeError] = useState<string | null>(null);
  const loadArtifact = async () => {
    if (!projectId) return null;
    const result = await listWorkArtifacts(projectId);
    const found = result.artifacts.find((item) => artifactMatchesComparison(item, comparison.branchGroupId)) ?? null;
    setArtifact(found);
    return { found, storeRevision: result.storeRevision };
  };
  useEffect(() => {
    if (!projectId) return;
    void Promise.resolve().then(() => listWorkArtifacts(projectId)).then((result) => {
      setArtifact(result.artifacts.find((item) => artifactMatchesComparison(item, comparison.branchGroupId)) ?? null);
    }).catch((cause) => setMaterializeError(cause instanceof Error ? cause.message : "Comparison work could not be loaded."));
  }, [comparison.branchGroupId, projectId]);
  const materialize = async () => {
    if (!projectId || materializing) return;
    setMaterializing(true); setMaterializeError(null);
    try {
      const current = await loadArtifact();
      const created = current?.found ?? (await createWorkArtifact(projectId, comparisonArtifactFor(comparison, current?.storeRevision ?? 0, getIdentity().userId))).artifact;
      setArtifact(created); onMaterialized?.({ type: "work-artifact", id: created.artifactId });
    } catch (cause) {
      // A simultaneous creator wins the CAS. Reload once so the shared durable artifact becomes the receipt.
      if (/stale|revision|idempotency/i.test(cause instanceof Error ? cause.message : String(cause))) {
        const current = await loadArtifact();
        if (current?.found) { onMaterialized?.({ type: "work-artifact", id: current.found.artifactId }); return; }
      }
      setMaterializeError(cause instanceof Error ? cause.message : "The comparison work could not be created.");
    } finally { setMaterializing(false); }
  };

  return (
    <section className="runtime-compare" aria-labelledby={`runtime-compare-${comparison.branchGroupId}`}>
      <header className="runtime-compare-head">
        <div>
          <span className="runtime-compare-kicker">Two independent reads</span>
          <h3 id={`runtime-compare-${comparison.branchGroupId}`}>Claude and Codex are working from the same canvas context</h3>
        </div>
        <span className="runtime-compare-context">Separate branches</span>
      </header>

      <p className="runtime-compare-explainer">
        Compare what each model actually produces. Choosing one only changes which thread is in focus. It does not merge work, stop the other branch, or approve an action.
      </p>

      <div className="runtime-compare-branches">
        {branches.map((branch) => {
          const name = runtimeName(branch);
          const working = isWorking(branch);
          const chosen = branch.id === comparison.selectedSessionId;
          return (
            <article className={`runtime-compare-branch${chosen ? " chosen" : ""}`} key={branch.id} aria-label={`${name} branch`}>
              <div className="runtime-compare-branch-head">
                <div>
                  <strong>{name}</strong>
                  <span className="runtime-compare-model">{readableModel(branch)}</span>
                </div>
                <span className={`runtime-compare-status${working ? " working" : ""}`}>
                  {working ? <LoaderCircle aria-hidden="true" /> : null}
                  {statusLabel(branch.status)}
                </span>
              </div>

              <p className="runtime-compare-readout">{branchReadout(branch)}</p>

              <div className="runtime-compare-branch-foot">
                <span className="runtime-compare-attribution">Produced by {name}</span>
                <button
                  className="runtime-compare-choose"
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => void onChoose(branch.id)}
                >
                  {chosen ? <><Check aria-hidden="true" /> {name} chosen</> : `Choose ${name}`}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="runtime-compare-foot">
        <span aria-live="polite">
          {comparison.keptBoth
            ? "Both branches are kept as separate work. Nothing was merged or approved."
            : selected
            ? `${runtimeName(selected)} is in focus. The other branch remains intact and attributable.`
            : "No branch has been chosen. Both continue independently."}
        </span>
        <button
          className="runtime-compare-keep"
          type="button"
          aria-pressed={comparison.keptBoth}
          disabled={comparison.keptBoth}
          onClick={onKeepBoth}
        >
          {comparison.keptBoth ? <><Check aria-hidden="true" /> Both branches kept</> : "Keep both branches"}
        </button>
        <Button variant="ghost" className="runtime-compare-materialize" type="button" disabled={!projectId || materializing || Boolean(artifact)} onClick={() => void materialize()}>
          {artifact ? <><Check aria-hidden="true" /> Comparison on canvas</> : <><GitCompareArrows aria-hidden="true" /> {materializing ? "Creating comparison…" : "Make comparison work"}</>}
        </Button>
      </footer>
      {artifact ? <p className="runtime-compare-artifact-receipt">A third, editable comparison object now references both branches. Neither branch was merged, chosen, stopped, or authorized.</p> : null}
      {materializeError ? <p className="runtime-compare-error" role="alert">{materializeError}</p> : null}
    </section>
  );
}
