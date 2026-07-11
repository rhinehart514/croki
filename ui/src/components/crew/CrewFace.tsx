// One teammate's face, everywhere a teammate appears: the rail, canvas, conversation, profile, and
// crew room. The hand-drawn character is the teammate's persistent identity. The two-letter monogram
// exists only as a render-failure fallback, so a broken character degrades to a legible identity rather
// than making one surface silently switch to a different avatar language.

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
