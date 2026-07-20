import type { SystemIndexObject } from "@/api";
import { returnedEvidence } from "./returnedEvidence";

function observedLabel(value: string | null) {
  if (!value) return "Observation time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function SystemEvidenceReturn({ object, objects, onStartWork }: {
  object: SystemIndexObject;
  objects: SystemIndexObject[];
  onStartWork: (subjectRefs: string[]) => void;
}) {
  const evidence = returnedEvidence(object);
  if (!evidence) return null;
  const affected = evidence.affectedObjectRefs.map((ref) => objects.find((entry) => entry.objectRef === ref)).filter(Boolean) as SystemIndexObject[];
  return <section className="system-evidence-return" aria-label="Returned evidence consequence">
    <div>
      <span>What happened</span>
      <blockquote>{object.statement}</blockquote>
      <small>{evidence.from ?? evidence.source ?? "Observed source"} · {observedLabel(evidence.observedAt)} · {evidence.attribution}</small>
    </div>
    <div>
      <span>What it may mean</span>
      <strong>No interpretation has been adopted.</strong>
      <p>The return is joined to this release and visibly affects the connected Product / GTM path. Drover has not changed canonical understanding.</p>
    </div>
    <div>
      <span>Affects</span>
      {affected.length ? <ul>{affected.map((entry) => <li key={entry.objectRef}>{entry.name}</li>)}</ul> : <p>The release has no exact Product / GTM connection yet.</p>}
    </div>
    <button type="button" onClick={() => onStartWork([evidence.outcomeRef, ...evidence.affectedObjectRefs])}>Start next work</button>
  </section>;
}
