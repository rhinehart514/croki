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

function snapshotLabel(timestamp: number | null, now: number) {
  if (timestamp === null) return "No live view is available";
  const age = ageLabel(timestamp, now).replace(/^Updated/, "Snapshot from");
  return `${age} · live updates unavailable`;
}

export function FirmFreshness({ connection, onRetry }: { connection: FirmConnectionState; onRetry: () => void }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (connection.phase === "fresh") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [connection.phase]);

  if (connection.phase === "fresh") {
    return <span className="firm-freshness firm-freshness-fresh">Current</span>;
  }

  const offline = connection.phase === "offline";
  const readOnly = connection.phase === "read-only";
  return (
    <div className="firm-freshness firm-freshness-warning" role="status" aria-live="polite">
      {offline ? <WifiOff aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
      <span>
        <strong>{connection.phase === "opening" ? "Opening the firm" : offline ? "Offline" : readOnly ? "Desktop host required" : "Reconnecting"}</strong>
        <small>{readOnly ? snapshotLabel(connection.lastUpdatedAt, now) : `${ageLabel(connection.lastUpdatedAt, now)} · consequential changes are held`}</small>
      </span>
      {!readOnly ? <button type="button" onClick={onRetry} aria-label="Retry connection">Retry</button> : null}
    </div>
  );
}
