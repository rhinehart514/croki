import { useEffect, useRef, useState } from "react";
import {
  ArrowUp, CheckCircle2, CircleDashed, LoaderCircle, Radio, ShieldCheck, Workflow, X,
} from "lucide-react";
import type { OperatorEvent, OperatorSession } from "@/types";
import "@/styles/go-panel.css";

// One goal → go. The single entry that kicks off an autonomous operator: you say what you want, it
// composes the workflow (if there isn't one), runs it node by node, and stops at the shared founder
// gate — never sending. Below the box, the work streams live, so "agents that go out and do the
// work" is something you watch happen, not a black box you wait on.
//
// The event trail is the session's own .events[] (composing → running → node start/done → reached
// gate → released). App owns the durable session and its polling; this panel reads what it's given
// and turns each event into a plain line of what the operator just did.

const EXAMPLE_GOALS = [
  "Get 5 qualified pilot conversations without paid ads",
  "Find developers using tools like mine and draft outreach",
  "Turn my product's strengths into content that ranks",
];

// Map a raw operator event to a human line. Unknown event types fall back to their title so a new
// backend event still reads as something, never as a blank row.
function describe(ev: OperatorEvent): { icon: "spin" | "node" | "done" | "gate" | "dot"; text: string; sub?: string } | null {
  const data = (ev.data ?? {}) as Record<string, unknown>;
  switch (ev.type) {
    case "operator_composing":
      return { icon: "spin", text: "Composing the channel", sub: typeof data.goal === "string" ? data.goal : undefined };
    case "operator_workflow_composed":
      return { icon: "done", text: "Channel composed", sub: typeof data.nodes === "number" ? `${data.nodes} steps` : undefined };
    case "operator_running":
      return { icon: "spin", text: "Running the channel" };
    case "operator_node_start":
      return { icon: "node", text: `Running ${String(data.category ?? data.kind ?? "step")}`, sub: typeof data.nodeId === "string" ? data.nodeId : undefined };
    case "operator_node_done":
      return {
        icon: "done",
        text: `Finished ${String(data.nodeId ?? "step")}`,
        sub: typeof data.itemCount === "number" ? `${data.itemCount} item${data.itemCount === 1 ? "" : "s"}` : undefined,
      };
    case "operator_reached_gate":
      return {
        icon: "gate",
        text: "Reached the founder gate",
        sub: typeof data.itemCount === "number" ? `${data.itemCount} draft${data.itemCount === 1 ? "" : "s"} waiting for review` : "waiting for review",
      };
    case "gate_resolved": {
      const by = data.releasedBy as { name?: string } | undefined;
      return { icon: "done", text: "Gate released", sub: by?.name ? `by ${by.name}` : undefined };
    }
    default:
      // Surface composing/running/error-shaped events we didn't special-case, using their own title.
      if (!ev.title) return null;
      return { icon: "dot", text: ev.title, sub: ev.detail ?? undefined };
  }
}

const STREAM_TYPES = new Set([
  "operator_composing", "operator_workflow_composed", "operator_running",
  "operator_node_start", "operator_node_done", "operator_reached_gate", "gate_resolved",
]);

const LIVE_STATUSES = new Set(["running", "ready"]);

export function GoPanel({
  session,
  onGo,
  onClose,
  onReviewGate,
}: {
  // The live session for this project (App polls it). Null until a goal has been launched.
  session: OperatorSession | null;
  onGo: (goal: string) => void | Promise<void>;
  onClose: () => void;
  // Jump to the gate review when the operator has paused with drafts waiting.
  onReviewGate?: () => void;
}) {
  const [goal, setGoal] = useState("");
  const [launching, setLaunching] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  const submit = async () => {
    const g = goal.trim();
    if (!g || launching) return;
    setLaunching(true);
    try { await onGo(g); setGoal(""); }
    finally { setLaunching(false); }
  };

  // The streamable trail — only the work events, newest pinned to the bottom (chat-like).
  const events = (session?.events ?? []).filter((e) => STREAM_TYPES.has(e.type) || (e.type !== "session_created" && describe(e)));
  const live = !!session && LIVE_STATUSES.has(session.status);
  const atGate = session?.status === "waiting_for_gate";

  // Auto-scroll to the newest line as work streams in.
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  return (
    <aside className="go-panel" role="dialog" aria-label="Give it a goal" aria-modal="false">
      <header className="go-panel-head">
        <div className="go-panel-head-title">
          <Workflow />
          <strong>Give it a goal</strong>
          {live ? <span className="go-panel-live"><Radio size={11} /> working</span> : null}
        </div>
        <button className="go-panel-close" onClick={onClose} type="button" aria-label="Close">
          <X />
        </button>
      </header>

      <div className="go-panel-body">
        <p className="go-panel-lead">
          Say the outcome you want. It composes a channel, runs it, and stops at your gate before
          anything is sent — you watch it work below.
        </p>

        <div className="go-panel-box">
          <textarea
            className="go-panel-input"
            placeholder="e.g. Find 10 dev-tool founders who'd want this and draft an intro"
            value={goal}
            disabled={launching}
            rows={2}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
          />
          <button className="go-panel-send" type="button" disabled={!goal.trim() || launching} onClick={() => void submit()} title="Go (Enter)">
            {launching ? <LoaderCircle className="spin" size={16} /> : <ArrowUp size={16} />}
          </button>
        </div>

        {!session ? (
          <div className="go-panel-examples">
            {EXAMPLE_GOALS.map((g) => (
              <button key={g} className="go-panel-example" type="button" disabled={launching} onClick={() => setGoal(g)}>{g}</button>
            ))}
          </div>
        ) : null}

        {/* ── Live work stream ── */}
        {session ? (
          <section className="go-panel-stream-wrap">
            <div className="go-panel-stream-head">
              <span className="go-panel-stream-goal">{session.goal}</span>
              <span className={`go-panel-stream-status status-${session.status}`}>{session.status.replace(/_/g, " ")}</span>
            </div>
            {(session.status === "failed" || session.status === "blocked") && session.error ? (
              // The reason the drive stopped, stated plainly — not buried in the event trail. A
              // transient cause (a hit session limit) reads as "resume once it clears," not a dead end.
              <div className="go-panel-error">{session.error}</div>
            ) : null}
            <div className="go-panel-stream" ref={streamRef}>
              {events.length === 0 ? (
                <div className="go-panel-stream-empty"><CircleDashed size={16} /> Starting up…</div>
              ) : events.map((ev) => {
                const d = describe(ev);
                if (!d) return null;
                return (
                  <div className={`go-panel-event icon-${d.icon}`} key={ev.id}>
                    <span className="go-panel-event-icon" aria-hidden>
                      {d.icon === "spin" ? <LoaderCircle className="spin" size={14} />
                        : d.icon === "done" ? <CheckCircle2 size={14} />
                        : d.icon === "gate" ? <ShieldCheck size={14} />
                        : d.icon === "node" ? <Workflow size={14} />
                        : <CircleDashed size={14} />}
                    </span>
                    <div className="go-panel-event-body">
                      <span className="go-panel-event-text">{d.text}</span>
                      {d.sub ? <span className="go-panel-event-sub">{d.sub}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {atGate ? (
              <button className="go-panel-gate-cta" type="button" onClick={onReviewGate}>
                <ShieldCheck size={14} /> Drafts are waiting at the gate — review
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
