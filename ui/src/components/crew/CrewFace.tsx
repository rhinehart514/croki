// One teammate's face, everywhere a teammate appears — the rail, the canvas node, the profile sheet
// and its team grid, the crew room. Two registers, one identity:
//
//   • the default "character" face draws the hand-drawn crew character (CrewAvatar), degrading to the
//     two-letter monogram in the agent's family tint if it can't render;
//   • the "roundel" variant (opt-in) draws the teammate as a clean monogram roundel for deliberately
//     compact, authorship-first surfaces such as message threads.
//
// Keeping the monogram as the fallback for the character face is deliberate: a broken character must
// degrade to a legible identity, not to nothing.

import { Component, type ReactNode } from "react";
import { agentPersona, FAMILY_TINT, type AgentFamily } from "@/lib/agentPersona";
import { CrewAvatar } from "./CrewAvatar";
import "./CrewFace.css";

// If CrewAvatar throws while rendering, swap in the monogram fallback instead of tearing down the
// surface around it. Scoped per-face so one bad character never blanks a whole roster.
class FaceBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <>{this.props.fallback}</> : <>{this.props.children}</>; }
}

export function CrewFace({
  agentRef, job, family: familyProp, monogram: monogramProp, size = 28, state = "idle", variant = "character", className,
}: {
  agentRef: string;
  job?: string;
  // Pass family + monogram to skip the persona lookup when the caller already derived it; otherwise
  // this reads them from the same persona library every other surface uses, so faces never drift.
  family?: AgentFamily;
  monogram?: string;
  size?: number;
  state?: "idle" | "working";
  // "character" = the hand-drawn crew face (default, unchanged everywhere it already renders). "roundel"
  // = the monogram roundel presentation the crew/composer surfaces use.
  variant?: "character" | "roundel";
  className?: string;
}) {
  const persona = familyProp && monogramProp ? null : agentPersona(agentRef, job);
  const family = familyProp ?? persona!.family;
  const monogram = monogramProp ?? persona!.monogram;
  const tint = FAMILY_TINT[family];

  // The monogram roundel — the Warm Atelier crew presentation. Initials in the sleek display sans; a
  // spruce ring + breathing dot mark a working teammate, a settled sage dot marks one that's idle/done.
  if (variant === "roundel") {
    const working = state === "working";
    return (
      <span
        className={className ? `crew-roundel ${className}${working ? " is-working" : ""}` : `crew-roundel${working ? " is-working" : ""}`}
        style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
        aria-hidden="true"
      >
        <span className="crew-roundel-mono">{monogram}</span>
        <span className="crew-roundel-breath" />
      </span>
    );
  }

  const fallback = (
    <span
      className="crew-face-monogram"
      style={{ background: tint.bg, color: tint.fg, fontSize: Math.max(9, Math.round(size * 0.4)) }}
    >
      {monogram}
    </span>
  );

  return (
    <span className={className ? `crew-face ${className}` : "crew-face"} style={{ width: size, height: size }}>
      <FaceBoundary fallback={fallback}>
        <CrewAvatar agentRef={agentRef} family={family} size={size} state={state} />
      </FaceBoundary>
    </span>
  );
}
