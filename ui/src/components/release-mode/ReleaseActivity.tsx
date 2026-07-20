import type { ReleaseDetail, WallQueueItemView } from "@/api";
import { DecisionGate } from "@/components/now/DecisionGate";

const PURPOSES = new Set(["release", "answer", "review-outcome", "end-bet"]);
function pendingGate(value: Record<string, unknown>): WallQueueItemView | null {
  if (typeof value.id !== "string" || typeof value.ventureId !== "string" || typeof value.purpose !== "string" || !PURPOSES.has(value.purpose) || value.decision != null || typeof value.effect !== "object" || value.effect == null) return null;
  return value as WallQueueItemView;
}
function entryLabel(value: Record<string, unknown>) {
  const terminal = value.terminal && typeof value.terminal === "object" ? (value.terminal as Record<string, unknown>).kind : null;
  return String(value.name ?? value.summary ?? value.note ?? value.body ?? value.decision ?? value.outcomeKind ?? terminal ?? "Recorded");
}

export function ReleaseActivity({ release, readOnlyReason, onChanged }: { release: ReleaseDetail; readOnlyReason: string | null; onChanged: () => void }) {
  const entries = [
    ...(release.threads ?? []).map((value) => ({ kind: "Work thread", value })),
    ...(release.runs ?? []).map((value) => ({ kind: "Attempt", value })),
    ...(release.receipts ?? []).map((value) => ({ kind: "Work receipt", value })),
    ...release.decisions.map((value) => ({ kind: "Decision", value })),
    ...release.outcomes.map((value) => ({ kind: "Evidence returned", value })),
  ].sort((a, b) => String(b.value.decidedAt ?? b.value.createdAt ?? b.value.parkedAt ?? "").localeCompare(String(a.value.decidedAt ?? a.value.createdAt ?? a.value.parkedAt ?? "")));
  return <section className="release-activity"><h2>Joined activity</h2><p>{release.threadRefs.length} work threads · {release.runRefs.length} attempts · {release.decisions.length} founder actions · {release.outcomes.length} market returns</p>{entries.length ? <ol>{entries.map(({ kind, value }, index) => { const gate = pendingGate(value); return <li key={`${kind}:${String(value.id ?? index)}`}><span>{kind}</span>{gate ? <DecisionGate ventureId={gate.ventureId} item={gate} onDecided={onChanged} readOnlyReason={readOnlyReason} /> : <><strong>{entryLabel(value)}</strong><small>{String(value.completedAt ?? value.decidedAt ?? value.createdAt ?? value.parkedAt ?? "")}</small></>}</li>; })}</ol> : <div className="mode-empty"><strong>No joined activity yet</strong><p>Work, founder-held actions, failures, retries, and market returns will appear here when they belong to this release.</p></div>}</section>;
}
