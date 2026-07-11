// A proposed pipeline shape, embodied — one of the "a few ways to shape this" ideas Claude hands back.
// Instead of a paragraph, the shape reads as its crew in order: a left-to-right chain of steps, each a
// teammate face (or a capability's brand mark) WITH its plain-English role beside it — "Prospect
// Researcher › Outreach Writer › Your gate" — joined by thin chevrons and ending at the amber "Your gate"
// chip. Every step names who does what, so the shape reads as "who does what, in order" at a glance,
// never a row of unreadable two-letter tokens. It mirrors the canvas's own flow, so the idea reads
// instantly as a runnable pipeline — and "nothing sends until you approve" is visible in the shape itself.
//
// It wears the shared .composer-card2 frame, the same frame the pre-run plan wears, so an idea set and a
// plan read as siblings in the stream.

import { ChevronRight, Shield } from "lucide-react";
import { RosterTile } from "./RosterTile";
import { CAPABILITIES } from "@/lib/capabilities";
import { agentPersona } from "@/lib/agentPersona";
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

// The plain-English role/name to print beside each step's face — so the chain reads as words, never the
// two-letter monogram the face falls back to. A teammate (a node with a `ref`) resolves to its role via
// the same persona library every other surface uses ("Prospect Researcher"); a capability (a `connector`)
// reads as its real service name ("Gmail", "Clay"); anything else degrades to its humanized label. This is
// the SAME identity the face already carries — the label just makes it legible at a glance.
function stepLabel(n: GTMNode): string {
  if (n.ref) return agentPersona(n.ref, n.label ?? n.agentPrompt).role;
  if (n.connector) {
    const cap = CAPABILITIES.find((c) => c.id === n.connector);
    if (cap) return cap.name;
  }
  return humanizeStepLabel(n.label) || "Step";
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
          {steps.map((n) => {
            const label = stepLabel(n);
            return (
              <span className="ef-step" key={n.id}>
                <span className="ef-role">
                  <RosterTile node={n} size="sm" title={label} />
                  <span className="ef-role-name">{label}</span>
                </span>
                <ChevronRight className="ef-chev" size={13} aria-hidden="true" />
              </span>
            );
          })}
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
