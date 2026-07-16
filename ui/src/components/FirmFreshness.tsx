import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import type { FirmConnectionState } from "@/hooks/use-firm-connection";
import "@/styles/freshness.css";

function ageLabel(timestamp: number | null, now: number) {
  if (timestamp === null) return "No current view yet";
  const seconds = Math.max(0, Math.round((now - timestamp) / 1_000));
  if (seconds < 5) return "Updated just now";
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `Updated ${minutes}m ago`;
}

export function FirmFreshness({ connection, onRetry }: { connection: FirmConnectionState; onRetry: () => void }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (connection.phase === "fresh") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [connection.phase]);

  // The founder surface renders the live-host state (contract §2.8). The web build is a dev/test
  // harness only: it never has founder authority, so its "read-only" phase is not a degraded founder
  // state — it renders at most a quiet grey snapshot chip (never a red band, never a disabled
  // composer). The host authority model is unchanged: a write still fails server-side without the
  // capability; this only stops the harness's expected read-only phase from contaminating the surface.
  if (connection.phase === "fresh" || connection.phase === "read-only" || connection.phase === "opening") {
    return null;
  }

  const offline = connection.phase === "offline";
  return (
    <div className="firm-freshness firm-freshness-warning" role="status" aria-live="polite">
      {offline ? <WifiOff aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
      <span>
        <strong>{offline ? "Offline" : "Reconnecting"}</strong>
        <small>{`${ageLabel(connection.lastUpdatedAt, now)} · consequential changes are held`}</small>
      </span>
      <button type="button" onClick={onRetry} aria-label="Retry connection">Retry</button>
    </div>
  );
}
