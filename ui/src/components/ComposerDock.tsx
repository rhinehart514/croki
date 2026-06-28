import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle, ArrowUp, Bot, Boxes, ChevronRight, LoaderCircle, Maximize2,
  Minimize2, Play, Plus, ShieldCheck, Square, X,
} from "lucide-react";
import { statusLabel } from "@/lib/status";
import { DockContext } from "@/components/DockContext";
import { SlidingTabs } from "@/components/SlidingTabs";
import { Collapse, Reveal, Stagger, StaggerItem } from "@/lib/motion";
import { STEP_OPTIONS, type StepOption } from "@/lib/step-options";
import "@/styles/dock-context.css";
import type { ContextManifest, GTMNode, OperatorEvent, OperatorSession } from "@/types";

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

// The operator's work, woven into the thread: a collapsed "N steps" receipt that opens to the
// individual calls, each with its own status dot. Defaults closed so the conversation, not the
// tooling, is what you read — but it's one keystroke and one click from the full trace, and it never
// hides that work happened. Fully keyboard- and screen-reader-reachable (a real disclosure widget).
function ToolCluster({ events, idBase }: { events: OperatorEvent[]; idBase: string }) {
  const [open, setOpen] = useState(false);
  const failed = events.some((e) => e.type === "tool_failed" || /failed/i.test(e.title));
  const listId = `cnv-tools-${idBase}`;
  const label = `${events.length} step${events.length === 1 ? "" : "s"}${failed ? ", one failed" : ""} — ${open ? "collapse" : "expand"}`;
  return (
    <div className={`cnv-tools ${open ? "open" : ""}`}>
      <button
        className="cnv-tools-head"
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
      >
        <ChevronRight className="cnv-tools-chev" size={13} aria-hidden="true" />
        <span className={`cnv-tools-dot ${failed ? "fail" : "done"}`} aria-hidden="true" />
        <span className="cnv-tools-count">{events.length} step{events.length === 1 ? "" : "s"}</span>
        {!open ? <span className="cnv-tools-peek">{events[events.length - 1].title}</span> : null}
      </button>
      <Collapse open={open}>
        <ul className="cnv-tools-list" id={listId}>
          {events.map((e) => {
            const stepFailed = e.type === "tool_failed" || /failed/i.test(e.title);
            return (
              <li key={e.id} className="cnv-tool">
                <span className={`cnv-tool-dot ${stepFailed ? "fail" : "done"}`} aria-hidden="true" />
                <span className="cnv-tool-text">
                  <span className="cnv-tool-title">{e.title}</span>
                  {e.detail ? <span className="cnv-tool-detail">{e.detail}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </Collapse>
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
  floating = false, focusSignal = 0, recede = false,
  contextManifest = null, onOpenGrounding, onOpenPicture, onIdeate,
  onAddNode, onAddChain, onOpenLibrary,
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
  // While Claude is staging a graph change, the cursor builds it onto the canvas and the inline
  // ✓/✕/note carry the decision — so the dock RECEDES to its peek to leave the watch beat
  // unobstructed. It re-opens itself the moment the founder resolves the proposal (recede → false).
  recede?: boolean;
  // The "what Claude reads" strip in the dock head — the grounding/picture/ideate actions folded in
  // from the old Explorer rail. All optional so the dock still renders without product context.
  contextManifest?: ContextManifest | null;
  onOpenGrounding?: () => void;
  onOpenPicture?: () => void;
  onIdeate?: () => void;
  // The composer's "+" is the canvas's ONE add affordance now (the separate canvas "Add step" was
  // collapsed into it): add a building-block step, or open the library for your real agents/skills.
  onAddNode?: (spec: Partial<GTMNode> & { label: string }) => void;
  // Drop a connected chain of steps at once — "Review & stage" uses it to place the gate and the
  // staged-output node already wired, so the wall holds by construction.
  onAddChain?: (specs: (Partial<GTMNode> & { label: string })[]) => void;
  onOpenLibrary?: () => void;
}) {
  // Rest as a pill on first paint when the dock floats over the program workbench, OR when a FINISHED
  // session would otherwise open its full transcript over the read-only overview canvas. Either way the
  // founder lands on the work, not a panel covering it; the conversation is one click away on the peek.
  const [collapsed, setCollapsed] = useState(floating || (!floating && !!session && TERMINAL.has(session.status)));
  const [addOpen, setAddOpen] = useState(false);
  // The "+" stages building-block MODES as chips in the composer instead of dropping a card on the
  // canvas. The card lands on SEND, built from the typed description — so "+ Input" then "a CSV of WNY
  // operators" + Enter creates the Input node labeled from your words. Library stays a palette (you
  // pick a real agent, you don't describe one), so it isn't chipped.
  const [stepChips, setStepChips] = useState<StepOption[]>([]);
  // The add menu renders in a body portal so the dock's `overflow: hidden` (the rounded glass card)
  // can't clip it when it opens upward. We anchor it to the live "+" button rect, fixed to the viewport.
  const [addPos, setAddPos] = useState<{ left: number; bottom: number } | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const toggleAdd = () => {
    if (addOpen) { setAddOpen(false); return; }
    const r = addBtnRef.current?.getBoundingClientRect();
    if (r) setAddPos({ left: r.left, bottom: window.innerHeight - r.top + 8 });
    setAddOpen(true);
  };
  useEffect(() => {
    if (!addOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".composer-add-portal") || t.closest(".composer-add-wrap")) return;
      setAddOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setAddOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onEsc); };
  }, [addOpen]);
  const [expanded, setExpanded] = useState(false);
  // The dock leads with the THREAD — the whole conversation in one scroll (your messages, Claude's
  // work folded into a step receipt, the answer, the gate). Focus (just the latest answer/state) is
  // still one click away for when you only want the result, but you land in the conversation.
  const [view, setView] = useState<"focus" | "thread">("thread");
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

  // A FINISHED session on the read-only overview (the dock is not floating over a program there) rests
  // as a pill, so a completed transcript never covers the engine the founder came to see. The thread is
  // one click away on the peek bar. An ACTIVE session, or any session in the focused program view,
  // behaves as before. Adjusting state during render from a changed prop is React's sanctioned pattern.
  const terminalOverview = !floating && !!session && TERMINAL.has(session.status);
  const [trackedTerminalOverview, setTrackedTerminalOverview] = useState(terminalOverview);
  if (terminalOverview !== trackedTerminalOverview) {
    setTrackedTerminalOverview(terminalOverview);
    if (terminalOverview) setCollapsed(true);
  }

  // When the host bumps focusSignal (e.g. "New program"), open the dock in the same render so the
  // input is mounted, then focus it in an effect (a DOM call, not setState — no cascading render). A
  // finished session over the overview is the one case we don't auto-open: it would re-cover the engine.
  const [trackedFocus, setTrackedFocus] = useState(focusSignal);
  if (focusSignal !== trackedFocus) {
    setTrackedFocus(focusSignal);
    if (!terminalOverview) setCollapsed(false);
  }
  useEffect(() => {
    if (focusSignal) inputRef.current?.focus();
  }, [focusSignal]);

  // Recede while a proposal stages onto the canvas; rise again once it's resolved. Adjusting state
  // during render from a changed prop is React's sanctioned pattern — no effect, no extra render.
  const [trackedRecede, setTrackedRecede] = useState(recede);
  if (recede !== trackedRecede) {
    setTrackedRecede(recede);
    setCollapsed(recede);
  }

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
    if (submitting) return;
    // Chips first: an active step chip means "build this block from my words," a local graph edit —
    // not a message to Claude. It runs even while the operator is working (adding a node is design-time
    // and reversible), so it bypasses sendDisabled. The card lands here, on send, never on the +click.
    if (stepChips.length) {
      const value = input.trim();
      for (const chip of stepChips) {
        const spec = value ? { ...chip.spec, label: value } : chip.spec;
        if (chip.then && onAddChain) onAddChain([spec, chip.then]);
        else onAddNode?.(spec);
      }
      setStepChips([]);
      setInput("");
      return;
    }
    const value = input.trim();
    if (!value || sendDisabled) return;
    setSubmitting(true);
    setCollapsed(false); // sending opens the conversation above the composer
    try { await onSend(value); setInput(""); }
    finally { setSubmitting(false); }
  };

  // The command composer — the product's primary input, built to rival a real chat composer: a calm
  // textarea over a control row (context on the left, the live model/state, a dark send on the right).
  // Enter sends, Shift+Enter newlines. Shared by the resting state and the active conversation so the
  // input never changes shape as you move between them.
  const chipMode = stepChips.length > 0;
  const composer = (
    <div className={`composer-box ${chipMode ? "has-chips" : ""}`}>
      {/* Staged step modes. While any chip is set, the composer is in "build a step" mode — your words
          describe the block, Enter creates it on the canvas, and the chip clears. Remove a chip to drop
          back to talking to Claude. */}
      {chipMode ? (
        <div className="composer-chips">
          {stepChips.map((chip, i) => (
            <span key={chip.label} className="composer-chip">
              <span className="composer-chip-icon">{chip.icon}</span>
              <span className="composer-chip-label">{chip.label}</span>
              <button
                className="composer-chip-x"
                type="button"
                aria-label={`Remove ${chip.label}`}
                onClick={() => setStepChips((chips) => chips.filter((_, j) => j !== i))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <textarea
        ref={inputRef}
        className="composer-box-input"
        aria-label={chipMode ? `Describe the ${stepChips[stepChips.length - 1].label} step` : "Message Claude"}
        placeholder={chipMode ? `Describe the ${stepChips[stepChips.length - 1].label} step…` : sendDisabled ? "Claude is working…" : session ? "Reply, redirect, or ask Claude to continue…" : "Ask Claude to build, run, or change anything…"}
        value={input}
        disabled={sendDisabled && !chipMode}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        rows={1}
      />
      <div className="composer-box-bar">
        <div className="composer-box-tools">
          {/* The ONE add affordance. Opens upward from the "+": your library (real agents/skills) and
              the building blocks. The separate canvas "Add step" was collapsed into this. */}
          {onAddNode ? (
            <div className="composer-add-wrap">
              <button
                ref={addBtnRef}
                className={`composer-box-tool ${addOpen ? "open" : ""}`}
                onClick={toggleAdd}
                type="button"
                aria-haspopup="menu"
                aria-expanded={addOpen}
                title="Add a step — your library, or a building block"
              >
                <Plus size={16} />
              </button>
              {addPos ? createPortal(
                <div className="composer-add-portal" style={{ left: addPos.left, bottom: addPos.bottom }}>
                  <Reveal open={addOpen} className="menu composer-add-menu" role="menu" origin="bottom-left">
                    {/* The wedge action, elevated: your REAL agents and skills, ranked above the generic
                        building blocks. The one place boldness is spent — a filled row with a trailing chevron. */}
                    {onOpenLibrary ? (
                      <button className="menu-item menu-primary" onClick={() => { onOpenLibrary(); setAddOpen(false); }} role="menuitem" type="button">
                        <Boxes className="menu-item-icon" />
                        <span className="menu-item-body">
                          <span className="menu-item-label">Browse the library</span>
                          <span className="menu-item-meta">Your real agents and skills</span>
                        </span>
                        <ChevronRight className="menu-primary-chev" size={15} aria-hidden="true" />
                      </button>
                    ) : null}
                    {/* The building blocks — the deterministic spine the Library and the vibe path
                        don't hand you, in flow order (in → transform → ship → measure). No eyebrows:
                        at four rows the order carries the anatomy. "Review & stage" drops the gate
                        and the staged-output node as one wired pair. */}
                    {STEP_OPTIONS.map((opt) => (
                      <button
                        key={opt.label}
                        className="menu-item"
                        onClick={() => {
                          // Stage the mode as a chip — the card is created on send, not here.
                          setStepChips((chips) => chips.some((c) => c.label === opt.label) ? chips : [...chips, opt]);
                          setAddOpen(false);
                          inputRef.current?.focus();
                        }}
                        role="menuitem"
                        type="button"
                      >
                        <span className="menu-item-icon">{opt.icon}</span>
                        <span className="menu-item-body">
                          <span className="menu-item-label">{opt.label}</span>
                          <span className="menu-item-meta">{opt.detail}</span>
                        </span>
                      </button>
                    ))}
                  </Reveal>
                </div>,
                document.body,
              ) : null}
            </div>
          ) : null}
          <span className="composer-box-model" title={sessionActive ? "Claude is on this outcome" : "Runs on your Claude subscription"}>
            <span className={`composer-box-dot ${sessionActive ? "live" : ""}`} />
            {working ? "Working…" : session ? statusLabel(session.status) : "Claude · subscription"}
          </span>
        </div>
        <button
          className="composer-box-send"
          disabled={submitting || (chipMode ? false : (!input.trim() || sendDisabled))}
          onClick={() => void send()}
          type="button"
          aria-label={chipMode ? "Add the step" : "Send to Claude"}
        >
          {submitting ? <LoaderCircle className="spin" /> : chipMode ? <Plus size={18} /> : <ArrowUp size={18} />}
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
          <button className="composer-peek" onClick={() => setCollapsed(false)} type="button" title="Open the conversation" aria-label="Open the conversation with Claude">
            <span className={`composer-peek-dot ${working ? "live" : ""}`} aria-hidden="true" />
            <span className="composer-peek-text">
              {recede ? "Staged on the canvas — keep, change, or note it there" : working ? "Claude is working…" : session.events.length ? session.events[session.events.length - 1].title : `Claude · ${statusLabel(session.status)}`}
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
          <button className="composer-dock-stop" onClick={() => void onCancel()} type="button" title="Stop" aria-label="Stop Claude">
            <Square />
          </button>
        )}
        <button className="composer-dock-icon" onClick={() => setExpanded((v) => !v)} type="button" title={expanded ? "Shrink" : "Expand"} aria-label={expanded ? "Shrink the panel" : "Expand the panel"} aria-pressed={expanded}>
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button className="composer-dock-icon" onClick={() => setCollapsed(true)} type="button" title="Minimize" aria-label="Minimize the panel">
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
      <div
        key={session ? view : "idle"}
        className={`composer-dock-timeline view-enter ${session && view === "focus" ? "is-focus" : ""}`}
        ref={timelineRef}
        role="log"
        aria-label="Conversation with Claude"
        aria-live="polite"
        aria-relevant="additions text"
      >
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
          <Stagger className="cnv-thread">
            {segmentEvents(session.events).map((seg) =>
              seg.kind === "tool" ? (
                <StaggerItem key={seg.id}>
                  <ToolCluster events={seg.events} idBase={seg.id} />
                </StaggerItem>
              ) : seg.kind === "say" ? (
                <StaggerItem key={seg.id}>
                  <div className="cnv-say">
                    <div className="cnv-say-body">
                      {seg.event.detail ? <MarkdownLite text={seg.event.detail} /> : <p>{seg.event.title}</p>}
                    </div>
                  </div>
                </StaggerItem>
              ) : seg.kind === "you" ? (
                <StaggerItem key={seg.id}>
                  <div className="cnv-you">
                    <div className="cnv-you-bubble">{seg.event.detail || seg.event.title}</div>
                  </div>
                </StaggerItem>
              ) : seg.kind === "ask" ? (
                <StaggerItem key={seg.id}>
                  <div className="cnv-ask">
                    <ShieldCheck size={15} aria-hidden="true" />
                    <div className="cnv-ask-body">
                      <strong>{seg.event.title}</strong>
                      {seg.event.detail ? <div className="cnv-ask-detail"><MarkdownLite text={seg.event.detail} /></div> : null}
                    </div>
                  </div>
                </StaggerItem>
              ) : (
                <StaggerItem key={seg.id}>
                  <div className="cnv-sys">
                    <span>{seg.event.detail || seg.event.title}</span>
                  </div>
                </StaggerItem>
              ),
            )}
            {/* The live "now" beat — keeps the thread honest about latency: while Claude works, the
                bottom of the conversation shows what it's doing this second, not a frozen log. */}
            {working ? (
              <div className="cnv-live" role="status">
                <span className="cnv-live-orb" aria-hidden="true" />
                <span className="cnv-live-text">{session.events.at(-1)?.title ?? "Working…"}</span>
              </div>
            ) : null}
          </Stagger>
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
