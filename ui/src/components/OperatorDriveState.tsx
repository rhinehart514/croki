import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, Check, RotateCcw } from "lucide-react";
import type { OperatorSession } from "@/types";
import { humanizeSlugsInText } from "@/lib/labels";

// The operator's drive, made watchable. This is the COLD-START surface — a goal was given but there is
// no graph yet to watch assemble, so the plan-as-loading-state lives here: the few real steps of the
// drive (reading the product, sketching the approach, wiring the crew, staging at the gate) check off
// live with the current one named, an honest running clock beside them, and the crew's real reasoning
// streaming below. Once the first nodes exist the CANVAS takes over and this surface steps aside. When
// the drive fails or blocks, the reason surfaces right here with the trail of what it got through and a
// way to pick the loop back up — never a blank goal box with the reason lost.

// Bookkeeping events that aren't worth a line in the founder-facing trail.
const HIDE_TYPES = new Set(["session_created", "session_resumed"]);

// The plan the founder watches check off. Fixed and honest: every compose drive moves through these,
// and a tiny goal that skips the shape step simply reaches "build" — earlier steps read done, not faked.
type PhaseKey = "read" | "shape" | "build" | "gate";
const PHASES: { key: PhaseKey; label: string; hint: (product: string) => string }[] = [
  { key: "read", label: "Reading your product", hint: (p) => `Seeing what ${p} does and where wins come in.` },
  { key: "shape", label: "Sketching the approach", hint: () => "Laying out a couple of ways to chase your goal." },
  { key: "build", label: "Wiring the crew", hint: () => "Building the steps and the teammates who run them." },
  { key: "gate", label: "Staging at your gate", hint: () => "Bringing the work to your gate — nothing sends." },
];

// How far the drive has actually gotten, from the real event trail + session state — never a guess.
// The furthest phase touched; everything before it is done, that one is active, the rest pending.
function reachedPhase(session: OperatorSession): number {
  let reached = 0;
  for (const ev of session.events ?? []) {
    if (ev.type === "candidates_proposed") reached = Math.max(reached, 1);
    const tool = (ev as { data?: { tool?: string } }).data?.tool;
    if (ev.type === "tool_started" && tool === "compose_and_run") reached = Math.max(reached, 2);
  }
  const bag = session as unknown as { pendingCandidates?: unknown; pendingGate?: unknown };
  if (bag.pendingCandidates) reached = Math.max(reached, 1);
  if (session.status === "waiting_for_gate" || bag.pendingGate) reached = 3;
  return reached;
}

export function OperatorDriveState({ session, productName, onResume, onStartOver, onSteer }: {
  session: OperatorSession;
  productName: string;
  onResume: () => void;
  onStartOver: () => void;
  onSteer?: (note: string) => void | Promise<void>;
}) {
  const trailRef = useRef<HTMLDivElement>(null);
  const stopped = session.status === "failed" || session.status === "blocked";
  const events = (session.events ?? []).filter((ev) => !HIDE_TYPES.has(ev.type) && (ev.title || ev.detail));
  const reached = useMemo(() => reachedPhase(session), [session]);
  const activePhase = PHASES[Math.min(reached, PHASES.length - 1)];

  // Keep the newest reasoning in view as it streams in (chat-like, pinned to the bottom).
  useEffect(() => {
    const el = trailRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  // A live elapsed clock while the drive is working. The longest step (composing the plan) can sit for
  // a minute or two with little to stream, so an honest running time keeps that wait from ever reading as
  // hung — the founder always knows it's still going. Count from the CURRENT run's start, not the
  // session's first-ever event: a resumed session that sat idle should read "0:12", not the whole
  // conversation's age. The most recent start/resume boundary is that run's beginning.
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
  const takingLong = elapsedSec != null && elapsedSec > 180;

  // Mid-run nudge — the founder redirects the crew's course without stopping and starting over. Routes
  // through the steer path (never a release, nothing crosses the wall). Present only while driving.
  const [nudge, setNudge] = useState("");
  const [nudging, setNudging] = useState(false);
  const sendNudge = async () => {
    const note = nudge.trim();
    if (!note || !onSteer || nudging) return;
    setNudging(true);
    try {
      await onSteer(note);
      setNudge("");
    } finally {
      setNudging(false);
    }
  };

  return (
    <div className={`operator-drive ${stopped ? "is-stopped" : ""}`}>
      <div className="operator-drive-head">
        {stopped ? <AlertTriangle className="operator-drive-icon stopped" aria-hidden /> : null}
        <strong>
          {stopped
            ? (session.status === "blocked" ? "Claude is blocked — your call" : "Claude couldn't finish the loop")
            : "Claude is building your loop"}
        </strong>
        <span className="operator-drive-sub">
          {stopped
            ? (session.error || "The drive stopped before composing a workflow. Here's what it got through.")
            : activePhase.hint(productName)}
        </span>
        {!stopped && elapsedLabel ? (
          <span className="operator-drive-elapsed">
            Working for {elapsedLabel}{takingLong ? " · taking longer than usual" : ""}
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

      {!stopped ? (
        <ol className="operator-drive-plan" aria-label="What the crew is doing">
          {PHASES.map((phase, i) => {
            const state = i < reached ? "done" : i === reached ? "active" : "pending";
            return (
              <li key={phase.key} className={`operator-drive-step is-${state}`}>
                <span className="operator-drive-step-mark" aria-hidden>
                  {state === "done" ? <Check size={12} strokeWidth={3} /> : <span className="operator-drive-step-dot" />}
                </span>
                <span className="operator-drive-step-label">{phase.label}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {events.length ? (
        <div className="operator-drive-trail" ref={trailRef} aria-label="Operator reasoning">
          {events.map((ev) => (
            <div key={ev.id} className={`operator-drive-line ${ev.type === "operator_note" ? "is-note" : ""} ${ev.type === "session_failed" ? "is-fail" : ""}`}>
              <span className="operator-drive-line-title">{humanizeSlugsInText(ev.title)}</span>
              {ev.detail ? <span className="operator-drive-line-detail">{ev.detail}</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      {!stopped && onSteer ? (
        <div className="operator-drive-nudge">
          <input
            className="operator-drive-nudge-input"
            value={nudge}
            onChange={(e) => setNudge(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void sendNudge(); }}
            placeholder="Nudge the crew mid-run — “focus on X”, “try a different angle”…"
            aria-label="Redirect the run without stopping it"
            disabled={nudging}
          />
          <button
            type="button"
            className="operator-drive-nudge-send"
            onClick={() => void sendNudge()}
            disabled={!nudge.trim() || nudging}
            aria-label="Send the nudge"
          >
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
