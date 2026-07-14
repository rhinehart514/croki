// One teammate's face, everywhere a teammate appears: the rail, canvas, conversation, profile, and
// crew room. The hand-drawn character is the teammate's persistent identity. The two-letter monogram
// exists only as a render-failure fallback, so a broken character degrades to a legible identity rather
// than making one surface silently switch to a different avatar language.

import { Component, type ReactNode } from "react";
import { CrewAvatar } from "./CrewAvatar";
import "./CrewFace.css";

// If CrewAvatar throws while rendering, swap in the monogram fallback instead of tearing down the
// surface around it. Scoped per-face so one bad character never blanks a whole roster.
class FaceBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <>{this.props.fallback}</> : <>{this.props.children}</>; }
}

function monogramOf(ref: string) {
  const words = ref.replace(/^gtm-/, "").split(/[-_\s]+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return (words[0] ?? "T").slice(0, 2).toUpperCase();
}

export function CrewFace({ agentRef, size = 28, state = "idle", className }: {
  agentRef: string;
  size?: number;
  state?: "idle" | "working";
  className?: string;
}) {
  const monogram = monogramOf(agentRef);

  const fallback = (
    <span
      className="crew-face-monogram"
      style={{ background: "var(--surface-2)", color: "var(--muted)", fontSize: Math.max(9, Math.round(size * 0.4)) }}
    >
      {monogram}
    </span>
  );

  return (
    <span className={className ? `crew-face ${className}` : "crew-face"} style={{ width: size, height: size }}>
      <FaceBoundary fallback={fallback}>
        <CrewAvatar agentRef={agentRef} size={size} state={state} />
      </FaceBoundary>
    </span>
  );
}
