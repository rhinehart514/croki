import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { EPISTEMIC_EDGE_PRESENTATION, type EpistemicEdgeTreatment } from "./epistemicGrammar";
import { useAtlasDensity } from "./atlasDensity";

// The epistemic edge (Drover Law 10). Join truth lives on the LINE, never a clean solid arrow for an
// inference. Treatments:
//   exact-receipt    solid double line + receipt glyph
//   contextual       single solid + half-receipt glyph
//   founder-applied  solid + person glyph
//   inferred         hairline dashed + hollow glyph + "unconfirmed" tag
//   unattributed     dotted "joined, not caused"
//   stale            dotted grey + clock notch
//   unsupported      NO drawn line (proximity + both cards' hollow slots)
// Join strength is a discrete four-rung shape ladder (data-rung), never a gradient/opacity. The glyph is
// the shape channel; colour is never load-bearing.

type EpistemicEdgeData = {
  treatment?: EpistemicEdgeTreatment;
  label?: string | null;
};

type EdgeGlyphKind = NonNullable<(typeof EPISTEMIC_EDGE_PRESENTATION)[EpistemicEdgeTreatment]["glyph"]>;

function EdgeGlyph({ glyph }: { glyph: EdgeGlyphKind }) {
  // Small greyscale-safe inline shapes at the edge midpoint; each treatment has a distinct silhouette.
  if (glyph === "receipt") {
    return (
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path d="M4 2.4h8v11l-1.3-.9-1.3.9-1.4-.9-1.3.9-1.4-.9-1.3.9z" fill="var(--card-raised)" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M6 5.4h4M6 7.6h4M6 9.8h2.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    );
  }
  if (glyph === "half-receipt") {
    return (
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path d="M4 2.4h8v11l-1.3-.9-1.3.9-1.4-.9-1.3.9-1.4-.9-1.3.9z" fill="var(--card-raised)" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M6 5.4h4M6 7.6h2.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    );
  }
  if (glyph === "person") {
    return (
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <circle cx="8" cy="5.4" r="2.4" fill="var(--card-raised)" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3.4 12.6c0-2.4 2-3.9 4.6-3.9s4.6 1.5 4.6 3.9" fill="var(--card-raised)" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (glyph === "hollow") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="8" r="4.6" fill="var(--card-raised)" stroke="currentColor" strokeWidth="1.3" strokeDasharray="1.6 1.8" />
      </svg>
    );
  }
  if (glyph === "joined-not-caused") {
    return (
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <circle cx="5.4" cy="8" r="2.4" fill="var(--card-raised)" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="10.6" cy="8" r="2.4" fill="var(--card-raised)" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  // clock-notch
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="4.8" fill="var(--card-raised)" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 5V8l2 1.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EpistemicEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const density = useAtlasDensity();
  const treatment = (data as EpistemicEdgeData | undefined)?.treatment ?? "inferred";
  const presentation = EPISTEMIC_EDGE_PRESENTATION[treatment];
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  // Unsupported: NO drawn line at all (Law 10 — proximity + both cards' hollow slots carry the claim).
  if (!presentation.draws) return null;

  const glyph = presentation.glyph;
  const showTag = presentation.tag && density === "detailed";

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={`epi-edge ${presentation.className}`}
        // The discrete four-rung shape ladder is a data attribute the CSS keys off — never opacity.
        data-rung={presentation.rung}
        data-treatment={treatment}
      />
      {presentation.treatment === "exact-receipt" ? (
        // The second rail of the solid-double line, offset via the same path.
        <path className="epi-edge-double" d={path} fill="none" data-rung={presentation.rung} />
      ) : null}
      {glyph || showTag ? (
        <EdgeLabelRenderer>
          <div
            className="epi-edge-badge nodrag nopan"
            data-treatment={treatment}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {glyph ? <EdgeGlyph glyph={glyph} /> : null}
            {showTag ? <span className="epi-edge-tag">{presentation.tag}</span> : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const EpistemicEdge = memo(EpistemicEdgeView);
