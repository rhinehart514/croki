import type { ReleaseDetail, ReleaseMutation, SystemIndexObject, WorkIndexItem } from "@/api";
import { DecisionGate } from "@/components/now/DecisionGate";
import { deriveReleasePath, pendingGate, recordTime, type ReleasePathKey } from "./releaseRecords";

function ActionEntry({ entry, readOnlyReason, onChanged }: {
  entry: ReturnType<typeof deriveReleasePath>[number]["entries"][number];
  readOnlyReason: string | null;
  onChanged: () => void;
}) {
  const gate = entry.raw ? pendingGate(entry.raw) : null;
  if (gate) return <DecisionGate ventureId={gate.ventureId} item={gate} onDecided={onChanged} readOnlyReason={readOnlyReason} />;
  const failed = Boolean(entry.raw?.lastExecutionError);
  const released = Boolean(entry.raw?.releasedAt);
  return <div className="release-path-entry-body">
    <strong>{entry.label}</strong>
    <small>{failed ? "Action failed" : released ? "Released" : "Recorded founder decision"}{entry.detail ? ` · ${entry.detail}` : ""}</small>
  </div>;
}

export function ReleasePath({ release, objects, threads, readOnlyReason, onConfigure, onMutate, onChanged }: {
  release: ReleaseDetail;
  objects: SystemIndexObject[];
  threads: WorkIndexItem[];
  readOnlyReason: string | null;
  onConfigure: (key: ReleasePathKey) => void;
  onMutate: (mutations: ReleaseMutation[]) => Promise<void>;
  onChanged: () => void;
}) {
  const steps = deriveReleasePath(release, objects, threads);
  return <section className="release-path" aria-labelledby="release-path-title">
    <header className="release-section-head">
      <div><span>Release path</span><h2 id="release-path-title">From product change to returned reality</h2></div>
      <p>Every item is joined to this release. An open step is a missing link, not a readiness score.</p>
    </header>
    <ol>
      {steps.map((step, index) => <li className="release-path-step" data-empty={!step.entries.length} key={step.key}>
        <div className="release-path-marker" aria-hidden="true"><span>{index + 1}</span></div>
        <article>
          <header>
            <div><span>{step.title}</span>{step.entries.length ? <small>{step.entries.length} joined</small> : <small>Open</small>}</div>
            {step.key !== "evidence" ? <button type="button" onClick={() => onConfigure(step.key)}>{step.key === "action" ? "Join work" : "Link"}</button> : null}
          </header>
          {step.entries.length ? <ul>
            {step.entries.map((entry) => <li key={entry.id}>
              {step.key === "action" ? <ActionEntry entry={entry} readOnlyReason={readOnlyReason} onChanged={onChanged} /> : <div className="release-path-entry-body">
                {entry.eyebrow ? <small>{entry.eyebrow}</small> : null}<strong>{entry.label}</strong>
                {step.key === "evidence" && entry.raw ? <small>{[entry.detail, recordTime(entry.raw)].filter(Boolean).join(" · ")}</small> : null}
              </div>}
              {entry.relationshipRef ? <button type="button" aria-label={`Remove ${entry.label}`} disabled={Boolean(readOnlyReason)} onClick={() => void onMutate([{ op: "unlink-object", relationshipRef: entry.relationshipRef! }])}>Remove</button> : null}
            </li>)}
          </ul> : <p>{step.prompt}</p>}
        </article>
      </li>)}
    </ol>
  </section>;
}
