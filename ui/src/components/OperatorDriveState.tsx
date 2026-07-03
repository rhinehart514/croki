import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import type { OperatorSession } from "@/types";

// The operator's drive, made watchable. While Claude composes the loop from your goal, its real
// reasoning and the brief it's building stream HERE — the inspections, the ideas it found,
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

  // A live elapsed clock while the drive is working. The longest step (composing the plan) can sit for
  // a minute or two with little to stream, so an honest running time plus an expectation keeps that wait
  // from ever reading as hung — the founder always knows it's still going and roughly how long is normal.
  // Count from the CURRENT run's start, not the session's first-ever event: a resumed session that sat
  // idle for a while should read "Working for 0:12", not the wall-clock age of the whole conversation.
  // The most recent start/resume boundary is that run's beginning; fall back to the first event.
  const startedAtMs = (() => {
    const evs = session.events ?? [];
    for (let i = evs.length - 1; i >= 0; i--) {
      if (evs[i].type === "session_created" || /start|resum/i.test(evs[i].type)) {
        return new Date(evs[i].createdAt).getTime();
      }
    }
    return evs[0]?.createdAt ? new Date(evs[0].createdAt).getTime() : null;
  })();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (stopped) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [stopped]);
  const elapsedSec = startedAtMs != null ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000)) : null;
  const elapsedLabel = elapsedSec != null ? `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}` : null;
  // Past a few minutes the "usually a minute or two" reassurance turns into a lie — switch to honesty.
  const takingLong = elapsedSec != null && elapsedSec > 180;

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
        {!stopped && elapsedLabel ? (
          <span className="operator-drive-elapsed">
            Working for {elapsedLabel} · {takingLong ? "taking longer than usual" : "usually a minute or two"}
          </span>
        ) : null}
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
