import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, ArrowUp, Bot, ChevronRight, LoaderCircle, Maximize2,
  Minimize2, Play, Plus, ShieldCheck, Square, X,
} from "lucide-react";
import { statusLabel } from "@/lib/status";
import { DockContext } from "@/components/DockContext";
import { SlidingTabs } from "@/components/SlidingTabs";
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
    if (/^-{3,}$|^\*{3,}$/.test(line)) { flush(); blocks.push(<hr key={`hr-${blocks.length}`} className="composer-md-hr" />); continue; }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { flush(); blocks.push(<p key={`h-${blocks.length}`} className="composer-md-h">{renderInline(heading[2], `h-${blocks.length}`)}</p>); continue; }
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

// ─── Conversation rendering — the operator transcript as a CONVERSATION, not a log ──────────────
// Every beat falls into one of five registers, ranked by how much it deserves the eye:
//   ask    — Claude paused for the founder. The one LOUD card (it's the gate moment).
//   say    — Claude's prose (reasoning / the final answer). The substance, prominent + readable.
//   you    — the founder's reply. A distinct bubble, so the two speakers never blur.
//   tool   — a tool call (inspect product, inspect portfolio…). RECEDES: consecutive ones collapse
//            into one quiet "N steps" cluster so the answer never drowns under machine noise.
//   system — session lifecycle (started / resumed). A quiet centered line.
type Speaker = "say" | "you" | "ask" | "system" | "tool";
function speakerOf(ev: OperatorEvent): Speaker {
  const t = ev.type;
  if (t === "operator_note" || t === "session_completed") return "say";
  if (t === "founder_input_received") return "you";
  if (t === "founder_input_requested") return "ask";
  if (t.startsWith("session_")) return "system";
  return "tool";
}

type Segment =
  | { kind: "tool"; id: string; events: OperatorEvent[] }
  | { kind: Exclude<Speaker, "tool">; id: string; event: OperatorEvent };

function segmentEvents(events: OperatorEvent[]): Segment[] {
  const out: Segment[] = [];
  let lastSay: string | null = null;
  for (const ev of events) {
    const kind = speakerOf(ev);
    if (kind === "tool") {
      const last = out[out.length - 1];
      if (last && last.kind === "tool") last.events.push(ev);
      else out.push({ kind: "tool", id: ev.id, events: [ev] });
      continue;
    }
    // "Operator finished" usually repeats the last reasoning verbatim — don't render the wall twice.
    if (kind === "say") {
      const d = (ev.detail ?? "").trim();
      if (d && d === lastSay) continue;
      if (d) lastSay = d;
    }
    out.push({ kind, id: ev.id, event: ev });
  }
  return out;
}

// The collapsed machine trace: one quiet line ("8 steps · Inspected the GTM portfolio") that opens
// to the individual calls. Defaults closed so the conversation, not the tooling, is what you read.
function ToolCluster({ events }: { events: OperatorEvent[] }) {
  const [open, setOpen] = useState(false);
  const failed = events.some((e) => e.type === "tool_failed" || /failed/i.test(e.title));
  return (
    <div className={`cnv-tools ${open ? "open" : ""}`}>
      <button className="cnv-tools-head" onClick={() => setOpen((v) => !v)} type="button">
        <ChevronRight className="cnv-tools-chev" size={13} aria-hidden="true" />
        <span className={`cnv-tools-dot ${failed ? "fail" : "done"}`} aria-hidden="true" />
        <span className="cnv-tools-count">{events.length} step{events.length === 1 ? "" : "s"}</span>
        {!open ? <span className="cnv-tools-peek">{events[events.length - 1].title}</span> : null}
      </button>
      {open ? (
        <ul className="cnv-tools-list">
          {events.map((e) => (
            <li key={e.id} className="cnv-tool">
              <span className="cnv-tool-title">{e.title}</span>
              {e.detail ? <span className="cnv-tool-detail">{e.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// FOCUS — the dock's default face. Not a scrolling log: it shows the operator's STATE. While Claude
// works, a live "now" presence (the current beat). When it's done, the answer itself, prominent and
// readable. The full transcript is the Thread mode, one click away — you opt into the history, you
// don't land in it. This is the rebuild: state-first, not log-first.
function FocusView({ session }: { session: OperatorSession }) {
  if (session.status === "running") {
    const beat = [...session.events].reverse().find((e) => e.title);
    return (
      <div className="cnv-focus cnv-focus-live">
        <span className="cnv-focus-orb" aria-hidden="true" />
        <div className="cnv-focus-live-body">
          <strong>{beat?.title ?? "Working…"}</strong>
          {beat?.detail ? <p>{beat.detail}</p> : null}
        </div>
      </div>
    );
  }
  const answer = [...session.events].reverse().find((e) => speakerOf(e) === "say" && (e.detail ?? "").trim());
  if (answer) {
    return (
      <div className="cnv-focus cnv-focus-answer">
        <span className="cnv-focus-eyebrow">Claude</span>
        <div className="cnv-say-body"><MarkdownLite text={answer.detail ?? answer.title} /></div>
      </div>
    );
  }
  return (
    <div className="cnv-focus cnv-focus-empty">
      <p>{session.summary ?? statusLabel(session.status)}</p>
    </div>
  );
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
  // The dock leads with the operator's STATE (focus), not the transcript (thread). You opt into history.
  const [view, setView] = useState<"focus" | "thread">("focus");
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
        {session && session.events.length > 0 ? (
          <SlidingTabs
            items={[{ value: "focus", label: "Focus" }, { value: "thread", label: "Thread" }]}
            value={view}
            onChange={setView}
            layoutId="dock-view"
            size="sm"
          />
        ) : null}
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
      <div key={session ? view : "idle"} className={`composer-dock-timeline view-enter ${session && view === "focus" ? "is-focus" : ""}`} ref={timelineRef} aria-live="polite">
        {!session ? (
          <div className="composer-dock-idle">
            <p className="composer-idle-lead">Tell Claude the outcome you want. It creates the program, builds the agents that chase it, runs them, and stops at your gate.</p>
            <div className="composer-idle-starters">
              {STARTERS.map((s) => (
                <button key={s} className="composer-idle-starter" onClick={() => setInput(s)} type="button">{s}</button>
              ))}
            </div>
          </div>
        ) : view === "focus" ? (
          <FocusView session={session} />
        ) : (
          segmentEvents(session.events).map((seg) =>
            seg.kind === "tool" ? (
              <ToolCluster key={seg.id} events={seg.events} />
            ) : seg.kind === "say" ? (
              <div className="cnv-say" key={seg.id}>
                <div className="cnv-say-body">
                  {seg.event.detail ? <MarkdownLite text={seg.event.detail} /> : <p>{seg.event.title}</p>}
                </div>
              </div>
            ) : seg.kind === "you" ? (
              <div className="cnv-you" key={seg.id}>
                <div className="cnv-you-bubble">{seg.event.detail || seg.event.title}</div>
              </div>
            ) : seg.kind === "ask" ? (
              <div className="cnv-ask" key={seg.id}>
                <ShieldCheck size={15} aria-hidden="true" />
                <div className="cnv-ask-body">
                  <strong>{seg.event.title}</strong>
                  {seg.event.detail ? <div className="cnv-ask-detail"><MarkdownLite text={seg.event.detail} /></div> : null}
                </div>
              </div>
            ) : (
              <div className="cnv-sys" key={seg.id}>
                <span>{seg.event.detail || seg.event.title}</span>
              </div>
            ),
          )
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
