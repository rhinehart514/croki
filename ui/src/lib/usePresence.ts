import { useEffect, useState } from "react";

// Founder presence — the away / unattended state (EXPERIMENT-MACHINE-SPEC rail 1). The browser posts a
// heartbeat on an interval while the page is open; the backend keeps a volatile lease that lapses to
// "away" when the heartbeats stop (tab closed, laptop asleep, page hidden). This hook drives that
// heartbeat AUTOMATICALLY — the founder's recommended default — and reads back the state for an
// always-visible indicator, so the system is never guessing silently. A future manual toggle would post
// the same endpoint with { away: true }; only this driver would change, not the backend.
//
// The wall is unchanged: presence only lets the backend HOLD an unattended outward auto-approval. So a
// missed heartbeat is always safe — it can only make the machine more conservative, never less.

export type PresenceState = {
  state: "present" | "away";
  present: boolean;
  // When away, the backend holds an unattended standing-autonomy auto-approval of an outward item.
  outwardHold: boolean;
  detection: "automatic";
  leaseMs: number;
};

// Ping a little more often than half the lease, so a single dropped request never flips the founder to
// "away" while their tab is genuinely open. The lease length itself is owned by the backend.
const HEARTBEAT_MS = 20_000;

type HeartbeatResult =
  | { state: PresenceState }
  | { unauthorized: true }
  | null;

async function postHeartbeat(away = false): Promise<HeartbeatResult> {
  try {
    const res = await fetch("/api/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ away }),
    });
    if (res.status === 401 || res.status === 403) return { unauthorized: true };
    if (!res.ok) return null;
    return { state: (await res.json()) as PresenceState };
  } catch {
    return null;
  }
}

export function usePresence(authenticated: boolean, onUnauthorized?: () => void): PresenceState | null {
  const [presence, setPresence] = useState<PresenceState | null>(null);

  useEffect(() => {
    // A present heartbeat removes the unattended safety hold, so it is valid only after the founder
    // browser has claimed its session. Waiting here also prevents an expected locked session from
    // producing a repeating 403 in the console and network panel.
    if (!authenticated) return;

    let alive = true;
    const beat = async () => {
      // While the tab is hidden the founder is not attending, so heartbeat as "away" — the backend then
      // holds outward work. When visible again, the next beat marks present. This is the automatic
      // detection: no toggle, driven purely by whether the page is really being watched.
      const away = typeof document !== "undefined" && document.visibilityState === "hidden";
      const next = await postHeartbeat(away);
      if (!alive || !next) return;
      if ("unauthorized" in next) {
        setPresence(null);
        onUnauthorized?.();
        return;
      }
      setPresence(next.state);
    };
    void beat();
    const timer = window.setInterval(() => void beat(), HEARTBEAT_MS);
    const onVisibility = () => void beat();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      // Best-effort: on unmount (app closing / navigating away) drop to away so nothing outward runs while
      // the founder is gone. Fire-and-forget; the lease would lapse on its own regardless.
      void postHeartbeat(true);
    };
  }, [authenticated, onUnauthorized]);

  return presence;
}
