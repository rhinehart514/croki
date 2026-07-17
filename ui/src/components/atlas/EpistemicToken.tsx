import { memo, type ReactElement } from "react";
import type { EpistemicState } from "./deriveEpistemicState";
import { epistemicPresentation, type EpistemicIconId } from "./epistemicGrammar";
import { useAtlasDensity } from "./atlasDensity";

// The epistemic corner slot (Drover Law 11). ONE component renders every state through four redundant
// non-colour channels — text label, icon shape, node-shape treatment (via data-epi-shape on the node),
// and a FIXED corner position (top-right, always). The slot is ALWAYS rendered: when the state carries no
// establishing claim it renders as a hollow outline placeholder, so absence is a visible claim ("nothing
// establishes this"), never less clutter.
//
// Disclosure scales with the shared semantic band (reused from Slice 2): STRUCTURE = icon shape alone;
// RELATIONSHIPS = + text label; COMPONENTS/ARTIFACTS = + basis line. Position is constant across bands;
// only the fill grows.

const ICON_PATHS: Record<EpistemicIconId, ReactElement> = {
  // A person — founder-established.
  person: (
    <>
      <circle cx="8" cy="5.4" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.8 13.4c0-2.7 2.3-4.4 5.2-4.4s5.2 1.7 5.2 4.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  // Code brackets — repository-backed (a cited fact).
  bracket: (
    <>
      <path d="M6 3L2.6 8 6 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 3l3.4 5L10 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // A bar chart — measured (returned reality).
  "bar-chart": (
    <>
      <rect x="2.6" y="8.5" width="2.4" height="4.5" fill="currentColor" />
      <rect x="6.8" y="5.5" width="2.4" height="7.5" fill="currentColor" />
      <rect x="11" y="2.8" width="2.4" height="10.2" fill="currentColor" />
    </>
  ),
  // A dashed eye — Drover's read (an inference, deliberately provisional).
  "dashed-eye": (
    <>
      <path d="M1.6 8C3.4 5 5.6 3.6 8 3.6S12.6 5 14.4 8C12.6 11 10.4 12.4 8 12.4S3.4 11 1.6 8Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.6" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </>
  ),
  // Opposed arrows — contested (evidence pulling both ways).
  "opposed-arrows": (
    <>
      <path d="M2.4 5.5H9M2.4 5.5l2 -1.8M2.4 5.5l2 1.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.6 10.5H7M13.6 10.5l-2 -1.8M13.6 10.5l-2 1.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // A clock — stale.
  clock: (
    <>
      <circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.6V8l2.6 1.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // An open (hollow) circle — unsupported: nothing filled in behind it.
  "open-circle": (
    <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="1.6 1.8" />
  ),
  // An archive box — historical.
  "archive-box": (
    <>
      <rect x="2.6" y="4.4" width="10.8" height="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.6 7v5.4a.6.6 0 0 0 .6.6h7.6a.6.6 0 0 0 .6-.6V7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6.4 9.4h3.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
};

function EpistemicIcon({ iconId }: { iconId: EpistemicIconId }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      {ICON_PATHS[iconId]}
    </svg>
  );
}

// The reserved corner slot — rendered even when `state` is null so absence stays a visible claim. When a
// state resolves to a hollow presentation (unsupported / Drover's read) the slot keeps its hollow-outline
// treatment; a filled state fills it. `showLabel` / `showBasis` gate the richer disclosure by band.
function EpistemicTokenView({
  state,
  showLabel: showLabelProp,
  showBasis: showBasisProp,
}: {
  state: EpistemicState | null;
  showLabel?: boolean;
  showBasis?: boolean;
}) {
  const density = useAtlasDensity();
  // Band-scaled disclosure (reuses Slice 2 band state): editorial (STRUCTURE) = icon only; standard
  // (RELATIONSHIPS) = + label; detailed (COMPONENTS/ARTIFACTS) = + basis line. Explicit props override
  // for callers (e.g. the selection rail) that always want the full read.
  const showLabel = showLabelProp ?? density !== "editorial";
  const showBasis = showBasisProp ?? density === "detailed";

  // A null state means the surface does not participate in the epistemic grammar (e.g. the default Now/
  // world mounts never compute data.epistemic). Render NOTHING there — a hollow "nothing establishes this"
  // slot over a founder-established or repository-grounded card would be a FALSE provenance claim (Law 11).
  // On the canvas every node carries a real derived state (drovers-read is the default), and the reserved
  // hollow treatment for the genuine absence-states (drovers-read / unsupported) is applied via
  // presentation.hollow below — so the reserved slot is still always present wherever the grammar is live.
  if (!state) return null;

  const presentation = epistemicPresentation(state);
  return (
    <span
      className="epi-token"
      data-epi-state={state}
      data-epi-tone={presentation.tone}
      data-hollow={presentation.hollow ? "true" : "false"}
      aria-label={`Epistemic state: ${presentation.label}. ${presentation.basisLine}`}
    >
      <span className="epi-token-slot" aria-hidden="true">
        <EpistemicIcon iconId={presentation.iconId} />
      </span>
      {showLabel ? <span className="epi-token-label">{presentation.label}</span> : null}
      {showBasis ? <span className="epi-token-basis">{presentation.basisLine}</span> : null}
    </span>
  );
}

export const EpistemicToken = memo(EpistemicTokenView);
