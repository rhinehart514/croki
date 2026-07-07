// One teammate's face, everywhere a teammate appears — the rail, the canvas node, the profile sheet
// and its team grid, the crew room. It draws the hand-drawn crew character (CrewAvatar). If that ever
// can't render, it falls back — gracefully, never a blank tile — to the two-letter monogram in the
// agent's family tint, the mark this product showed before the crew grew faces. Keeping the monogram
// as the fallback is deliberate: a broken character must degrade to a legible identity, not to nothing.

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
  agentRef, job, family: familyProp, monogram: monogramProp, size = 28, state = "idle", className,
}: {
  agentRef: string;
  job?: string;
  // Pass family + monogram to skip the persona lookup when the caller already derived it; otherwise
  // this reads them from the same persona library every other surface uses, so faces never drift.
  family?: AgentFamily;
  monogram?: string;
  size?: number;
  state?: "idle" | "working";
  className?: string;
}) {
  const persona = familyProp && monogramProp ? null : agentPersona(agentRef, job);
  const family = familyProp ?? persona!.family;
  const monogram = monogramProp ?? persona!.monogram;
  const tint = FAMILY_TINT[family];

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
