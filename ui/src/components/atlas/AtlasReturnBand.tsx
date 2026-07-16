import { ArrowDownLeft, Waves } from "lucide-react";
import type { FirmArchitectureProjection, FirmLens } from "@/types";

export function AtlasReturnBand({
  projection,
  lens,
  onFocusOutcome,
  onFocusPressure,
}: {
  projection: FirmArchitectureProjection;
  lens: FirmLens;
  onFocusOutcome: (id: string) => void;
  onFocusPressure: (subjectRef: string) => void;
}) {
  const returned = lens.outcomes?.at(-1);
  const pressure = projection.pressure?.[0];
  const pressureSubject = pressure?.subjectRef ?? pressure?.subjectId;

  // Intent already has a permanent home on the canvas. Keep this transient band for
  // consequential change only, so a quiet/new venture does not look half-populated.
  if (!pressure && !returned) return null;

  return (
    <section className="atlas-return-band" aria-label="What changed since you left">
      <div className="atlas-return-intent"><small>Venture direction</small><strong title={projection.document.intent.statement?.trim() || "Direction not named"}>{projection.document.intent.statement?.trim() || "Direction not named"}</strong></div>
      {pressureSubject ? <button className="atlas-return-pressure" type="button" onClick={() => onFocusPressure(String(pressureSubject))}><Waves aria-hidden="true" /><span><small>Pressure changed</small><strong title={pressure?.detail || pressure?.reason.replaceAll("-", " ")}>{pressure?.detail || pressure?.reason.replaceAll("-", " ")}</strong></span></button> : pressure ? <span className="atlas-return-pressure"><Waves aria-hidden="true" /><span><small>Pressure changed</small><strong title={pressure.detail || pressure.reason.replaceAll("-", " ")}>{pressure.detail || pressure.reason.replaceAll("-", " ")}</strong></span></span> : null}
      {returned ? <button className="atlas-return-outcome" type="button" onClick={() => onFocusOutcome(returned.id)}><ArrowDownLeft aria-hidden="true" /><span><small>Returned evidence</small><strong title={returned.body || returned.outcomeKind || "Inspect what returned"}>{returned.body || returned.outcomeKind || "Inspect what returned"}</strong></span></button> : null}
    </section>
  );
}
