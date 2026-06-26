import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, ArrowUp, Bot, CheckCircle2, Circle, LoaderCircle, Maximize2, MessageSquareText,
  Minimize2, Play, Plus, ShieldCheck, Square, Wrench, X,
} from "lucide-react";
import { statusLabel } from "@/lib/status";
import { DockContext } from "@/components/DockContext";
import "@/styles/dock-context.css";
import type { ContextManifest, OperatorEvent, OperatorSession } from "@/types";

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
  "Land 3 design-partner calls this month",
  "Find people who'd care about my product and draft outreach",
  "Turn my product's strengths into content that ranks",
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
  floating = false, focusSignal = 0,
  contextManifest = null, onOpenGrounding, onOpenPicture, onIdeate,
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
  // On the program workbench the dock floats over a four-zone IDE rather than holding its own
  // column, so it opens collapsed (a pill) to keep the inspector visible until summoned.
  floating?: boolean;
  // Bumped by the host to summon the chat — e.g. "New program" opens and focuses it, since a
  // program is created by telling Claude the outcome, not by filling a form.
  focusSignal?: number;
  // The "what Claude reads" strip in the dock head — the grounding/picture/ideate actions folded in
  // from the old Explorer rail. All optional so the dock still renders without product context.
  contextManifest?: ContextManifest | null;
  onOpenGrounding?: () => void;
  onOpenPicture?: () => void;
  onIdeate?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(floating);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Follow the layout context across navigation: collapse to a pill when the dock starts floating
  // over the program workbench, restore it when it owns its own lane again. Adjusting state during
  // render from a changed prop is React's sanctioned pattern — no effect, no cascading render.
  const [trackedFloating, setTrackedFloating] = useState(floating);
  if (trackedFloating !== floating) {
    setTrackedFloating(floating);
    setCollapsed(floating);
  }

  // When the host bumps focusSignal (e.g. "New program"), open the dock in the same render so the
  // input is mounted, then focus it in an effect (a DOM call, not setState — no cascading render).
  const [trackedFocus, setTrackedFocus] = useState(focusSignal);
  if (focusSignal !== trackedFocus) {
    setTrackedFocus(focusSignal);
    setCollapsed(false);
  }
  useEffect(() => {
    if (focusSignal) inputRef.current?.focus();
  }, [focusSignal]);

  // Opening the command bar drops you straight into the input — it reads as a command line, so a
  // click should land the cursor, not just reveal a panel you then have to click again.
  const [openFocus, setOpenFocus] = useState(0);
  useEffect(() => {
    if (openFocus) inputRef.current?.focus();
  }, [openFocus]);

  // ⌘K / Ctrl-K summons the command dock from anywhere — the canvas's command line, always one key away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCollapsed(false);
        setOpenFocus((n) => n + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.events.length]);

  const sessionActive = !!session && !TERMINAL.has(session.status);
  const waitingGate = session?.status === "waiting_for_gate";
  const pendingGateId = session?.pendingGate?.nodeIds[0];
  // The agent is mid-thought — the input parks until it pauses for you.
  const sendDisabled = running || session?.status === "running" || session?.status === "ready" || waitingGate;
  const working = running || session?.status === "running";

  const send = async () => {
    const value = input.trim();
    if (!value || submitting || sendDisabled) return;
    setSubmitting(true);
    setCollapsed(false); // sending opens the conversation above the composer
    try { await onSend(value); setInput(""); }
    finally { setSubmitting(false); }
  };

  // The command composer — the product's primary input, built to rival a real chat composer: a calm
  // textarea over a control row (context on the left, the live model/state, a dark send on the right).
  // Enter sends, Shift+Enter newlines. Shared by the resting state and the active conversation so the
  // input never changes shape as you move between them.
  const composer = (
    <div className="composer-box">
      <textarea
        ref={inputRef}
        className="composer-box-input"
        placeholder={sendDisabled ? "Claude is working…" : session ? "Reply, redirect, or ask Claude to continue…" : "Ask Claude to build, run, or change anything…"}
        value={input}
        disabled={sendDisabled}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        rows={1}
      />
      <div className="composer-box-bar">
        <div className="composer-box-tools">
          {onOpenGrounding ? (
            <button className="composer-box-tool" onClick={onOpenGrounding} type="button" title="What Claude reads — grounding, product picture, channels">
              <Plus size={16} />
            </button>
          ) : null}
          <span className="composer-box-model" title={sessionActive ? "Claude is on this outcome" : "Runs on your Claude subscription"}>
            <span className={`composer-box-dot ${sessionActive ? "live" : ""}`} />
            {working ? "Working…" : session ? statusLabel(session.status) : "Claude · subscription"}
          </span>
        </div>
        <button
          className="composer-box-send"
          disabled={!input.trim() || sendDisabled || submitting}
          onClick={() => void send()}
          type="button"
          aria-label="Send to Claude"
        >
          {submitting ? <LoaderCircle className="spin" /> : <ArrowUp size={18} />}
        </button>
      </div>
    </div>
  );

  // Resting = the composer alone, centered on the canvas (the command line). The conversation only
  // rises above it once you send or open a live session — minimizing (the header X) returns here.
  if (collapsed) {
    return (
      <aside className="composer-dock floating resting" aria-label="Claude">
        {/* When Claude is live, a slim peek above the composer shows the state and opens the
            conversation — so the resting composer never hides an in-flight session. */}
        {session ? (
          <button className="composer-peek" onClick={() => setCollapsed(false)} type="button" title="Open the conversation">
            <span className={`composer-peek-dot ${working ? "live" : ""}`} />
            <span className="composer-peek-text">
              {working ? "Claude is working…" : session.events.length ? session.events[session.events.length - 1].title : `Claude · ${statusLabel(session.status)}`}
            </span>
            <Maximize2 size={13} />
          </button>
        ) : null}
        {composer}
      </aside>
    );
  }

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
                ? <>{statusLabel(session.status)} · <span className="composer-dock-channel">{boundChannelName}</span></>
                : statusLabel(session.status)
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

      {/* ── What Claude reads — the grounding/picture/ideate actions folded into the dock head, so
          they stop being mystery buttons on a far rail. Shown only when the host wired the views. */}
      {onOpenGrounding && onOpenPicture && onIdeate ? (
        <DockContext
          contextManifest={contextManifest}
          onOpenGrounding={onOpenGrounding}
          onOpenPicture={onOpenPicture}
          onIdeate={onIdeate}
        />
      ) : null}

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
            <p className="composer-idle-lead">Tell Claude the outcome you want. It creates the program, builds the agents that chase it, runs them, and stops at your gate.</p>
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
          <strong>Claude hit a snag</strong>
          <span>
            {/connection closed|mid-response|network|ECONNRESET|timed out|timeout/i.test(session.error)
              ? "The model connection dropped mid-thought — usually transient. Pick up where it left off."
              : session.error}
          </span>
          <button className="composer-dock-retry" onClick={() => void onSend("continue")} type="button">
            <Play size={13} /> Try again
          </button>
        </div>
      )}

      {/* ── Composer input (the same beautiful composer as the resting state) ── */}
      {composer}
    </aside>
  );
}
