// A proposed pipeline shape, embodied — one of the "a few ways to shape this" ideas Claude hands back.
// Instead of a paragraph, the shape reads as its crew in order: a left-to-right chain of teammate faces
// and capability marks, joined by thin chevrons, ending at the amber "Your gate" chip. It mirrors the
// canvas's own flow, so the idea reads instantly as a runnable pipeline — and "nothing sends until you
// approve" is visible in the shape itself, not just the copy.
//
// It wears the shared .composer-card2 frame, the same frame the pre-run plan wears, so an idea set and a
// plan read as siblings in the stream.

import { ChevronRight, Shield } from "lucide-react";
import { RosterTile } from "./RosterTile";
import { humanizeStepLabel } from "@/lib/labels";
import type { GTMEdge, GTMNode } from "@/types";
import "@/styles/composer-embodied.css";

// The steps that carry the shape, in flow order. Context and resource nodes (floating reference, not a
// step) and the gate (rendered as the amber chip at the end) drop out; the rest sort top-down by canvas
// position — the same reading order the overview canvas and the build roster use.
function flowNodes(nodes: GTMNode[]): GTMNode[] {
  return [...nodes]
    .filter((n) => n.category !== "context" && n.category !== "resource" && n.category !== "gate")
    .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
}

export function EmbodiedFlow({
  nodes,
  title,
  rationale,
  onBuild,
  buildLabel = "Build this",
  dimmed = false,
  building = false,
}: {
  nodes: GTMNode[];
  // Reserved for future edge-aware ordering; the shape reads top-down by position today.
  edges?: GTMEdge[];
  title: string;
  rationale?: string;
  onBuild?: () => void;
  buildLabel?: string;
  // A secondary option reads quieter — its Build button recedes so the recommended shape leads.
  dimmed?: boolean;
  building?: boolean;
}) {
  const steps = flowNodes(nodes);
  return (
    <div className="composer-card2">
      <div className="ef-opt">
        <div className="ef-opt-h">
          <span className="ef-ol">{humanizeStepLabel(title)}</span>
          {onBuild ? (
            <button
              className={`ef-ob ${dimmed ? "dim" : ""}`}
              type="button"
              onClick={onBuild}
              disabled={building}
            >
              {building ? "Building…" : buildLabel}
            </button>
          ) : null}
        </div>

        <div className="ef-flow">
          {steps.map((n) => (
            <span className="ef-step" key={n.id}>
              <RosterTile node={n} size="sm" />
              <ChevronRight className="ef-chev" size={13} aria-hidden="true" />
            </span>
          ))}
          <span className="ef-gate-chip">
            <Shield size={14} aria-hidden="true" />
            Your gate
          </span>
        </div>

        {rationale ? <p className="ef-why">{rationale}</p> : null}
      </div>
    </div>
  );
}
