import { useEffect, useRef } from "react";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import type { OperatorSession } from "@/types";

// The operator's drive, made watchable. While Claude composes the loop from your goal, its real
// reasoning and the brief it's building stream HERE — the inspections, the opportunities it found,
// its notes — so "building your loop" is something you watch think, not an opaque spinner pointing at
// a panel that isn't open. When the drive fails or blocks (a cold start with no runtime, a hit
// session limit, an error) the reason is surfaced right here, with the trail of what it got through
// and a way to pick the loop back up — instead of dropping you to a blank goal box with the reason
// lost.

// Bookkeeping events that aren't worth a line in the founder-facing trail.
const HIDE_TYPES = new Set(["session_created", "session_resumed"]);

export function OperatorDriveState({ session, productName, onResume, onStartOver }: {
  session: OperatorSession;
  productName: string;
  onResume: () => void;
  onStartOver: () => void;
}) {
  const trailRef = useRef<HTMLDivElement>(null);
  const stopped = session.status === "failed" || session.status === "blocked";
  const events = (session.events ?? []).filter((ev) => !HIDE_TYPES.has(ev.type) && (ev.title || ev.detail));

  // Keep the newest reasoning in view as it streams in (chat-like, pinned to the bottom).
  useEffect(() => {
    const el = trailRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  return (
    <div className={`operator-drive ${stopped ? "is-stopped" : ""}`}>
      <div className="operator-drive-head">
        {stopped
          ? <AlertTriangle className="operator-drive-icon stopped" aria-hidden />
          : <LoaderCircle className="spin operator-drive-icon" aria-hidden />}
        <strong>
          {stopped
            ? (session.status === "blocked" ? "Claude is blocked — your call" : "Claude couldn't finish the loop")
            : "Claude is building your loop"}
        </strong>
        <span className="operator-drive-sub">
          {stopped
            ? (session.error
                || "The drive stopped before composing a workflow. Here's what it got through.")
            : `Reading ${productName} and composing the system to chase your goal — it'll stop at your gate. Watch it think below.`}
        </span>
        {stopped ? (
          <div className="operator-drive-actions">
            <button type="button" className="operator-drive-resume" onClick={onResume}>
              <RotateCcw size={14} /> Resume the loop
            </button>
            <button type="button" className="operator-drive-startover" onClick={onStartOver}>
              Start over
            </button>
          </div>
        ) : null}
      </div>

      {events.length ? (
        <div className="operator-drive-trail" ref={trailRef} aria-label="Operator reasoning">
          {events.map((ev) => (
            <div key={ev.id} className={`operator-drive-line ${ev.type === "operator_note" ? "is-note" : ""} ${ev.type === "session_failed" ? "is-fail" : ""}`}>
              <span className="operator-drive-line-title">{ev.title}</span>
              {ev.detail ? <span className="operator-drive-line-detail">{ev.detail}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
