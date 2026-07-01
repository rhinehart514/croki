// BeliefSpine — the L1 belief-spine lens: the nine-layer board folded to ONE pipeline's five faces.
//
// Renders the five faces (Who · trigger → What you say · positioning → Who you reached · people →
// Did it work · measure → the Verdict · learn) as a row of cards, matching L1 in
// docs/mockups/one-canvas-altitudes.html. A pure read — no edits, no gate, no run. Honest blind /
// empty / error states; conviction is ink darkness + stroke, never hue; amber never appears here
// (amber is the gate alone, which lives at L3).
//
// ─── INTEGRATOR WIRING ─────────────────────────────────────────────────────────
// API: the fetch is currently self-contained in beliefSpine.ts (`getSpine`, mirroring api.ts's
// `get<T>`) so this lens builds without touching api.ts. To consolidate, add this one line to
// ui/src/api.ts and swap beliefSpine.ts's local getSpine for the import (behaviour is identical):
//
//   export const getSpine = (projectId: string, channelId: string) =>
//     get<SpineView>(
//       `/api/projects/${encodeURIComponent(projectId)}/pipelines/${encodeURIComponent(channelId)}/spine`,
//     );
//
// (SpineView is exported from "@/lib/beliefSpine"; import the type in api.ts alongside the others.)
//
// Backend contract — GET /api/projects/:id/pipelines/:channelId/spine returns:
//   { projectId, channelId, spine: { who, say, reached, worked, verdict } }
// where each face is { belief: string|null; confidence: 0-100; status:
//   "blind"|"assumed"|"testing"|"validated"; groundingMode: "stated"|"gated"|"derived" }.
//
// MOUNT (one line, wherever the L1 pipeline unfold renders — e.g. GtmBoard / GtmCanvas):
//
//   <BeliefSpine projectId={model.projectId} channelId={activeChannelId} />
//
// Props are pure read inputs; no callbacks. ────────────────────────────────────

import { useSpine, faceMeta, faceBadge, confidenceLabel, FACE_ORDER } from "@/lib/beliefSpine";
import "./BeliefSpine.css";

interface BeliefSpineProps {
  projectId: string;
  channelId: string;
}

export function BeliefSpine({ projectId, channelId }: BeliefSpineProps) {
  const state = useSpine(projectId, channelId);

  if (state.status === "loading") {
    return (
      <div className="spine-state" role="status" aria-live="polite">
        Reading the spine…
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <div className="spine-state spine-state-muted">
        No pipeline chosen yet — pick a pipeline to read its belief spine.
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="spine-state spine-state-error" role="alert">
        Couldn't read the spine. {state.error}
      </div>
    );
  }

  const { spine } = state;

  return (
    <div className="spine-row" role="list" aria-label="Belief spine — one pipeline">
      {FACE_ORDER.map((key) => {
        const face = spine[key];
        const meta = faceMeta(key);
        const badge = faceBadge(face);
        const width = Math.max(0, Math.min(100, face.confidence));
        return (
          <div className="spine-card" role="listitem" key={key} aria-label={meta.label}>
            <div className="spine-role">{meta.role}</div>
            <div className={`spine-belief${face.belief ? "" : " spine-belief-blind"}`}>
              {face.belief ?? "No signal yet — blind at this face."}
            </div>
            <div className="spine-barfill">
              <i className={`tone-${badge.tone}`} style={{ width: `${width}%` }} />
            </div>
            <div className="spine-foot">
              <span className="spine-chip">
                <span className={`spine-dot tone-${badge.tone}`} />
                {badge.label}
              </span>
              <span className="spine-conf">{confidenceLabel(face.confidence)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default BeliefSpine;
