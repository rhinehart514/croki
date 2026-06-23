import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, Bot, CheckCircle2, Circle, LoaderCircle, Maximize2, MessageSquareText,
  Minimize2, Play, Send, ShieldCheck, Square, Wrench, X,
} from "lucide-react";
import type { OperatorEvent, OperatorSession } from "@/types";

// Operator narration arrives as markdown (the model writes tables, bold, bullets). Rendered raw
// it's an illegible wall of pipes and asterisks — the thing that read as "broken" in the panel.
// This is a deliberately tiny renderer: bold spans, bullet lines, and markdown tables collapsed
// to readable "col · col" rows. Not a full markdown engine — just enough to make Claude legible.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>
      : <span key={`${keyBase}-${i}`}>{part}</span>,
  );
}

function MarkdownLite({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="composer-md-list">
        {bullets.map((b, i) => <li key={i}>{renderInline(b, `li-${blocks.length}-${i}`)}</li>)}
      </ul>,
    );
    bullets = [];
  };
  for (const line of lines) {
    if (/^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?$/.test(line)) continue; // table separator row
    if (line.startsWith("|")) {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length) bullets.push(cells.join(" · "));
      continue;
    }
    if (/^[-*]\s+/.test(line)) { bullets.push(line.replace(/^[-*]\s+/, "")); continue; }
    flush();
    blocks.push(<p key={`p-${blocks.length}`}>{renderInline(line, `p-${blocks.length}`)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

const TERMINAL = new Set(["completed", "blocked", "failed", "cancelled"]);

const STARTERS = [
  "Find people who'd care about my product and draft outreach",
  "Shape this channel from its outcome backward",
  "Debug this workflow until it reaches my review gate",
];

function eventIcon(event: OperatorEvent) {
  if (event.type === "graph_patched") return <Wrench aria-hidden="true" />;
  if (event.type === "run_completed") return <Play aria-hidden="true" />;
  if (event.type.includes("gate")) return <ShieldCheck aria-hidden="true" />;
  if (event.type.includes("failed") || event.type.includes("interrupted")) return <AlertCircle aria-hidden="true" />;
  if (event.type.includes("completed")) return <CheckCircle2 aria-hidden="true" />;
  if (event.type.includes("founder")) return <MessageSquareText aria-hidden="true" />;
  return <Circle aria-hidden="true" />;
}

// The persistent co-pilot. Always docked, never summoned: your channels at the head, the
// operator's live narration in the middle, one input at the foot. Talking to Claude here
// either starts a new session (when idle) or continues the current one — one conversation.
export function ComposerDock({
  session, running, boundChannelName, viewingMismatch, onSend, onCancel, onReviewGate, onReturnToChannel,
}: {
  session: OperatorSession | null;
  running: boolean;
  // The channel the operator session is actually editing, and whether the founder is
  // currently looking at a different channel than that. The dock narrates one channel's
  // work; without this it silently describes a graph you may not be viewing.
  boundChannelName?: string | null;
  viewingMismatch?: boolean;
  onSend: (text: string) => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  onReviewGate: (nodeId: string) => void;
  onReturnToChannel?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.events.length]);

  // Collapsed = a small floating pill on the canvas (avatar + live status), click to reopen the
  // dock. Keeps Claude present without taking canvas space.
  if (collapsed) {
    return (
      <button className="composer-pill" onClick={() => setCollapsed(false)} type="button" title="Open Claude">
        <span className={`composer-pill-avatar ${session && !TERMINAL.has(session.status) ? "running" : ""}`}>
          {running || session?.status === "running" ? <LoaderCircle className="spin" /> : <Bot />}
        </span>
        <span className="composer-pill-text">
          {session && !TERMINAL.has(session.status) ? "Claude is working…" : "Ask Claude"}
        </span>
      </button>
    );
  }

  const sessionActive = !!session && !TERMINAL.has(session.status);
  const waitingGate = session?.status === "waiting_for_gate";
  const pendingGateId = session?.pendingGate?.nodeIds[0];
  // The agent is mid-thought — the input parks until it pauses for you.
  const sendDisabled = running || session?.status === "running" || session?.status === "ready" || waitingGate;

  const send = async () => {
    const value = input.trim();
    if (!value || submitting || sendDisabled) return;
    setSubmitting(true);
    try { await onSend(value); setInput(""); }
    finally { setSubmitting(false); }
  };

  return (
    <aside className={`composer-dock floating ${expanded ? "expanded" : ""}`} aria-label="Claude co-pilot">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="composer-dock-head">
        <span className={`composer-dock-avatar ${sessionActive ? "running" : ""}`}>
          {running || session?.status === "running" ? <LoaderCircle className="spin" /> : <Bot />}
        </span>
        <div className="composer-dock-head-text">
          <strong>Claude</strong>
          <span className="composer-dock-sub">
            {session
              ? boundChannelName
                ? <>{session.status.replaceAll("_", " ")} · <span className="composer-dock-channel">{boundChannelName}</span></>
                : session.status.replaceAll("_", " ")
              : "co-pilot · on your subscription"}
          </span>
        </div>
        {sessionActive && (
          <button className="composer-dock-stop" onClick={() => void onCancel()} type="button" title="Stop">
            <Square />
          </button>
        )}
        <button className="composer-dock-icon" onClick={() => setExpanded((v) => !v)} type="button" title={expanded ? "Shrink" : "Expand"}>
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button className="composer-dock-icon" onClick={() => setCollapsed(true)} type="button" title="Minimize">
          <X size={16} />
        </button>
      </header>

      {/* ── Channel mismatch — this session edits a channel you're not viewing ── */}
      {viewingMismatch && boundChannelName && (
        <div className="composer-dock-mismatch">
          <AlertCircle size={14} />
          <span>Editing <strong>{boundChannelName}</strong> — not the channel on screen.</span>
          {onReturnToChannel ? (
            <button onClick={() => onReturnToChannel()} type="button">Go to it</button>
          ) : null}
        </div>
      )}

      {/* ── Conversation / narration ───────────────────────────── */}
      <div className="composer-dock-timeline" ref={timelineRef} aria-live="polite">
        {!session ? (
          <div className="composer-dock-idle">
            <p className="composer-idle-lead">Tell Claude what this channel should do. It reads your product, builds the workflow, runs it, and stops at your gate.</p>
            <div className="composer-idle-starters">
              {STARTERS.map((s) => (
                <button key={s} className="composer-idle-starter" onClick={() => setInput(s)} type="button">{s}</button>
              ))}
            </div>
          </div>
        ) : (
          session.events.map((event) => (
            <article className={`composer-event composer-event-${event.type}`} key={event.id}>
              <span className="composer-event-icon">{eventIcon(event)}</span>
              <div className="composer-event-body">
                <div className="composer-event-title">
                  <strong>{event.title}</strong>
                  <time>{new Date(event.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                </div>
                {event.detail ? <div className="composer-event-detail"><MarkdownLite text={event.detail} /></div> : null}
                {event.type === "graph_patched" && Array.isArray(event.data?.changes) ? (
                  <ul>
                    {(event.data.changes as Array<{ detail?: string }>).map((c, i) => (
                      <li key={`${event.id}-${i}`}>{c.detail}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>

      {/* ── Gate prompt ────────────────────────────────────────── */}
      {waitingGate && pendingGateId && (
        <div className="composer-dock-gate">
          <ShieldCheck />
          <div>
            <strong>Your review is required</strong>
            <span>Claude reached the wall. Nothing leaves until you approve.</span>
          </div>
          <button onClick={() => onReviewGate(pendingGateId)} type="button">Review</button>
        </div>
      )}

      {/* ── Pending question / error ───────────────────────────── */}
      {session?.pendingQuestion && (
        <div className="composer-dock-question">
          <strong>{session.pendingQuestion.question}</strong>
          <span>{session.pendingQuestion.reason}</span>
        </div>
      )}
      {session?.error && !session.pendingQuestion && (
        <div className="composer-dock-question error">
          <strong>Claude stopped</strong>
          <span>{session.error}</span>
        </div>
      )}

      {/* ── Composer input (always present) ────────────────────── */}
      <div className="composer-dock-input-wrap">
        <textarea
          className="composer-dock-input"
          placeholder={sendDisabled ? "Claude is working…" : session ? "Reply, redirect, or ask it to continue…" : "Ask Claude to build this channel…"}
          value={input}
          disabled={sendDisabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }}
          rows={2}
        />
        <button className="composer-dock-send" disabled={!input.trim() || sendDisabled || submitting} onClick={() => void send()} type="button">
          {submitting ? <LoaderCircle className="spin" /> : <Send />}
        </button>
      </div>
    </aside>
  );
}
