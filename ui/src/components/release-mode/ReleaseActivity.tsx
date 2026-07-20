import type { ReleaseDetail } from "@/api";
import { pendingGate, recordDetail, recordLabel, recordTime } from "./releaseRecords";

export function ReleaseActivity({ release }: { release: ReleaseDetail; readOnlyReason?: string | null; onChanged?: () => void }) {
  const entries = [
    ...(release.threads ?? []).map((value) => ({ kind: "Work thread", value })),
    ...(release.runs ?? []).map((value) => ({ kind: "Attempt", value })),
    ...(release.receipts ?? []).map((value) => ({ kind: "Work receipt", value })),
    ...release.decisions.map((value) => ({ kind: "Founder action", value })),
    ...release.outcomes.map((value) => ({ kind: "Evidence returned", value })),
  ].sort((a, b) => recordTime(b.value).localeCompare(recordTime(a.value)));

  return <section className="release-activity" aria-labelledby="release-activity-title">
    <header className="release-section-head"><div><span>Trace</span><h2 id="release-activity-title">Joined activity</h2></div><p>{release.threadRefs.length} work {release.threadRefs.length === 1 ? "thread" : "threads"} · {release.runRefs.length} {release.runRefs.length === 1 ? "attempt" : "attempts"} · {release.decisions.length} founder {release.decisions.length === 1 ? "action" : "actions"} · {release.outcomes.length} evidence {release.outcomes.length === 1 ? "return" : "returns"}</p></header>
    {entries.length ? <ol>{entries.map(({ kind, value }, index) => {
      const waiting = Boolean(pendingGate(value));
      const detail = recordDetail(value);
      return <li key={`${kind}:${String(value.id ?? index)}`}>
        <span>{kind}</span>
        <strong>{waiting ? "Waiting for your decision" : recordLabel(value)}</strong>
        {detail ? <p>{detail}</p> : null}
        {recordTime(value) ? <small>{recordTime(value)}</small> : null}
      </li>;
    })}</ol> : <div className="release-activity-empty"><strong>No joined activity yet</strong><p>Work, exact actions, failures, retries, and returned evidence will appear here when they belong to this release.</p></div>}
  </section>;
}
