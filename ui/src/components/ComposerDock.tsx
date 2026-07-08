import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  AlertTriangle, ArrowUp, Bot, Check, ChevronRight, LoaderCircle,
  Lightbulb, Maximize2, Mic, Pin, Play, Plus, ShieldCheck, Square, X,
} from "lucide-react";
import { statusLabel } from "@/lib/status";
import { subjectActions } from "@/lib/subjectActions";
import { kindIcon } from "@/lib/objectKindIcons";
import { humanizeFieldLabel } from "@/lib/labels";
import type { CanvasSubject, CardDetail } from "@/lib/cardDetail";
import type { AgentBenchRow, OperatorHints } from "@/api";
import { motion } from "motion/react";
import { AgentPicker } from "@/components/AgentPicker";
import { DEFAULT_MODEL, modelById } from "@/components/agent-picker-models";
import { Collapse, Stagger, StaggerItem } from "@/lib/motion";
// ── The four embodied response/roster components — "one inventory, one language." The same roster tile
// renders in the @-menu, the parts tray, the idea flow, and the plan checklist. ────────────────────────
import { RosterTile } from "@/components/composer/RosterTile";
import { EmbodiedFlow } from "@/components/composer/EmbodiedFlow";
import { MentionMenu } from "@/components/composer/MentionMenu";
import { CrewFace } from "@/components/crew/CrewFace";
import { agentPersona } from "@/lib/agentPersona";
import {
  buildRoster, detectMentionQuery, rankRoster,
  type MentionEntity, type PlacedMention,
} from "@/lib/mention";
import { STEP_DRAG_MIME } from "@/lib/objectPalette";
import type { StepDragPayload } from "@/components/LeftRail";
import { GateReview } from "@/components/gate/GateReview";
import type { GatePromote } from "@/lib/gateItem";
import "@/styles/composer-posture.css";
import "@/styles/composer-candidates.css";
import "@/styles/chat-tabs.css";
import "@/styles/our-chat.css";
import type { ClarityKind, GateDecision, GTMEdge, GTMGraph, GTMItem, GTMNode, OperatorEvent, OperatorSession, OperatorSessionSummary, OperatorStatus } from "@/types";

// A pipeline SHAPE the operator returns when a goal admits more than one way through — a named shape the
// founder can pick from, not a draft to approve. Mirrors the backend's candidate result: each carries its
// full crew (nodes with kind/ref/connector) and a gate, so it renders embodied — a chain of faces/marks —
// not as prose. Picking one starts the build (which still stops at the founder gate downstream).
type Candidate = { id: string; label: string; rationale: string; nodes: GTMNode[]; edges: GTMEdge[] };

// ─── The ONE seam where the backend's candidate result is read off the session ──────────────────────────
// The operator surfaces ideation exclusively via embodied candidates now (the prose ideate path was
// retired from the operator's toolset). This reads them off whichever field the session carries them on —
// a `pendingCandidates` bag, a top-level `candidates`, or a staged event whose `data.kind === "candidates"`
// — and returns [] when absent, so the dock degrades to the plain conversation.
function normalizeCandidates(raw: unknown): Candidate[] {
  if (!Array.isArray(raw)) return [];
  const out: Candidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const id = typeof c.id === "string" ? c.id : null;
    const label = typeof c.label === "string" ? c.label : null;
    if (!id || !label) continue;
    const nodes = (Array.isArray(c.nodes) ? c.nodes : []).map((n) => {
      const node = n as GTMNode;
      // Candidate nodes may arrive un-laid-out; a missing position would crash the flow-order sort.
      return node.position ? node : { ...node, position: { x: 0, y: 0 } };
    });
    out.push({
      id,
      label,
      rationale: typeof c.rationale === "string" ? c.rationale : "",
      nodes,
      edges: Array.isArray(c.edges) ? (c.edges as GTMEdge[]) : [],
    });
  }
  return out;
}
function candidatesFromEvents(events: OperatorEvent[]): unknown {
  for (let i = events.length - 1; i >= 0; i--) {
    const data = events[i].data;
    if (data && typeof data === "object" && (data as Record<string, unknown>).kind === "candidates") {
      return (data as Record<string, unknown>).candidates;
    }
  }
  return null;
}
function sessionCandidates(session: OperatorSession | null): Candidate[] {
  if (!session) return [];
  const bag = session as unknown as { pendingCandidates?: { candidates?: unknown } | null; candidates?: unknown };
  const raw =
    (Array.isArray(bag.pendingCandidates?.candidates) ? bag.pendingCandidates!.candidates : null) ??
    (Array.isArray(bag.candidates) ? bag.candidates : null) ??
    candidatesFromEvents(session.events);
  return normalizeCandidates(raw);
}

// Minimal shape of the Web Speech API's SpeechRecognition we touch — the DOM lib types it behind
// a vendor-prefixed global that isn't in our tsconfig's lib, so we declare just the surface we use.
type SpeechResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: { results: ArrayLike<SpeechResult> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

// Operator narration arrives as markdown (the model writes tables, bold, bullets). Rendered raw
// it's an illegible wall of pipes and asterisks. This is a deliberately tiny renderer: bold spans,
// bullet lines, and markdown tables collapsed to readable "col · col" rows — just enough to make Claude
// legible, not a full markdown engine.
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
//   tool   — a tool call (inspect product, inspect context…). RECEDES: consecutive ones collapse
//            into one quiet "N steps" cluster so the answer never drowns under machine noise.
//   system — session lifecycle (started / resumed). A quiet centered line.
// A resolved gate ("gate_resolved") is not a message — it's a settled decision, and it renders as a
// stamped receipt line ("Released — you · 9:14 AM"), the persistent record of a call the founder made.
type Speaker = "say" | "you" | "ask" | "system" | "tool" | "receipt" | "crew";
function speakerOf(ev: OperatorEvent): Speaker {
  const t = ev.type;
  if (t === "gate_resolved") return "receipt";
  if (t === "operator_note" || t === "session_completed") return "say";
  if (t === "founder_input_received") return "you";
  if (t === "founder_input_requested") return "ask";
  // A teammate's first-person heartbeat while the run advances — rendered as its own crew bubble whose
  // face/name resolve PER MESSAGE from the event's ref (not the single session voice).
  if (t === "teammate_said") return "crew";
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

// A plain-word verb-face for each tool step, read ONLY off the sanitized `data.category` the backend
// already narrates (never the node's prompt/config/soul). So the trace reads as a sequence of real
// actions — "Read your product", "Drafted 4 leads" — not "Running node-3".
function stepVerb(category: unknown): string {
  switch (category) {
    case "source": return "Read";
    case "enrich": return "Enriched";
    case "generate": return "Drafted";
    case "measure": return "Measured";
    case "gate": return "Reached the wall";
    default: return "Ran";
  }
}

// The operator's work, woven into the thread: a collapsed "N steps" receipt that opens to the
// individual calls, each with its own status dot. Defaults closed so the conversation, not the
// tooling, is what you read — but it's one keystroke and one click from the full trace, and it never
// hides that work happened. Fully keyboard- and screen-reader-reachable (a real disclosure widget).
// When it's the live, still-running segment (`live`), the collapsed dot breathes so the trace stays
// honest that work is happening now.
function ToolCluster({ events, idBase, live = false }: { events: OperatorEvent[]; idBase: string; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const failed = events.some((e) => e.type === "tool_failed" || /failed/i.test(e.title));
  const listId = `cnv-tools-${idBase}`;
  const label = `${events.length} step${events.length === 1 ? "" : "s"}${failed ? ", one failed" : ""} — ${open ? "collapse" : "expand"}`;
  const dotState = failed ? "fail" : live ? "live" : "done";
  return (
    <div className={`oc-steps ${open ? "open" : ""}`}>
      <button
        className="oc-steps-head"
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
      >
        <ChevronRight className="oc-steps-chev" size={13} aria-hidden="true" />
        <span className={`oc-steps-dot ${dotState}`} aria-hidden="true" />
        <span className="oc-steps-count">{events.length} step{events.length === 1 ? "" : "s"}</span>
        {!open ? <span className="oc-steps-peek">{events[events.length - 1].title}</span> : null}
      </button>
      <Collapse open={open}>
        <ul className="oc-steps-list" id={listId}>
          {events.map((e, i) => {
            const stepFailed = e.type === "tool_failed" || /failed/i.test(e.title);
            const verb = stepVerb((e.data ?? null)?.category);
            return (
              <li key={e.id} className="oc-step" style={{ animationDelay: `${Math.min(i * 0.045, 0.5)}s` }}>
                <span className={`oc-step-node ${stepFailed ? "fail" : "done"}`} aria-hidden="true">
                  {stepFailed ? <X size={7} strokeWidth={3} /> : <Check size={8} strokeWidth={3} />}
                </span>
                <span className="oc-step-text">
                  <span className="oc-step-title"><span className="oc-step-kind">{verb}</span>{e.title}</span>
                  {e.detail ? <span className="oc-step-detail">{e.detail}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </Collapse>
    </div>
  );
}

// The first of two stops — "your call". The stem reads as a real question; each option is a soft,
// tappable chip. Tapping one drafts its label into the reply (append-only, unchanged) AND marks it as
// chosen in place — a decision persists as a receipt, per doctrine, with the radio filled in the calm
// green. Local pick-state resets whenever the question changes (the parent keys this by the event id).
function AskCard({ event, onPick }: { event: OperatorEvent; onPick: (label: string) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const stem = stripOptions(event.title) || event.title;
  const fromTitle = parseAskOptions(event.title);
  const opts = fromTitle.length ? fromTitle : parseAskOptions(event.detail ?? "");
  return (
    <div className="oc-card">
      <div className="oc-card-h">
        <span className="oc-card-tag">Your call</span>
        <span className="oc-card-q">{stem}</span>
      </div>
      {event.detail ? <div className="oc-card-detail"><MarkdownLite text={event.detail} /></div> : null}
      {opts.map((o, i) => (
        <button
          type="button"
          key={i}
          className={`oc-opt ${picked === i ? "picked" : ""}`}
          aria-pressed={picked === i}
          onClick={() => { onPick(o.label); setPicked(i); }}
        >
          <span className="oc-opt-pick" aria-hidden="true" />
          <span className="oc-opt-body">
            <span className="oc-opt-t">{o.label}</span>
            {o.detail ? <span className="oc-opt-d">{o.detail}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

// The four durable shapes a conversation insight can take when it leaves the chat and lands on the
// canvas as a clarity card. Kept here next to the control that emits them.
const CLARITY_KINDS: { kind: ClarityKind; label: string }[] = [
  { kind: "claim", label: "Claim" },
  { kind: "direction", label: "Direction" },
  { kind: "icp", label: "ICP" },
  { kind: "question", label: "Open question" },
];

// Pin — the quiet affordance on each Claude paragraph in the thread. It appears on hover, and one
// click opens a tiny menu of the four clarity kinds; choosing one pins THAT message's text onto the
// canvas as a durable card via onPin.
function PinControl({ text, onPin }: { text: string; onPin: (kind: ClarityKind, text: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onEsc); };
  }, [open]);
  return (
    <div className={`cnv-pin ${open ? "open" : ""}`} ref={wrapRef}>
      <button
        className="cnv-pin-btn"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Pin this as a clarity card"
        onClick={() => setOpen((v) => !v)}
      >
        <Pin size={12} aria-hidden="true" />
        <span className="cnv-pin-label">Pin</span>
      </button>
      {open ? (
        <div className="cnv-pin-menu" role="menu">
          {CLARITY_KINDS.map(({ kind, label }) => (
            <button
              key={kind}
              className="cnv-pin-item"
              type="button"
              role="menuitem"
              onClick={() => { onPin(kind, text); setOpen(false); }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// A canvas object's type, in founder words — "value_prop"/"valueProposition" → "Value proposition".
function humanizeKind(kind: string): string {
  return humanizeFieldLabel(kind) || "Block";
}

// ─── The card face (a selected object graph card, folded into the top of the composer) ──────────
// When the founder selects a card on the object graph, the composer BECOMES that card: this face sits
// pinned at the top and the conversation/input scope to it below. The state-colored type chip + maturity,
// the statement, the evidence receipts, a clickable Related list, a weakness line, and the Claude action
// chips (each drops its phrasing into the input, editable — never a bare fire).
function cardFaceIcon(type: string) {
  const Icon = kindIcon(type);
  return <Icon size={13} aria-hidden="true" />;
}

function SubjectCardFace({ detail, onClose, onAction, onRelated }: {
  detail: CardDetail;
  onClose?: () => void;
  onAction: (action: string) => void;
  onRelated: (rel: { id: string; name: string }) => void;
}) {
  const receipts = detail.receipts.slice(0, 3);
  const related = detail.related.slice(0, 5);
  return (
    <div className={`composer-card tone-${detail.tone}`}>
      <div className="composer-card-head">
        <span className={`composer-card-chip tone-${detail.tone}`}>
          {cardFaceIcon(detail.type)}
          <span className="composer-card-kind">{humanizeKind(detail.type)}</span>
          <span className="composer-card-maturity">· {detail.maturity}</span>
        </span>
        {onClose ? (
          <button className="composer-card-close" type="button" aria-label="Close this card" title="Deselect" onClick={onClose}>
            <X size={15} />
          </button>
        ) : null}
      </div>
      <p className="composer-card-statement">{detail.statement}</p>

      <div className="composer-card-section">
        <span className="composer-card-eyebrow">Evidence <span aria-hidden="true">·</span> {detail.evidenceLabel}</span>
        {receipts.length ? (
          receipts.map((r) => {
            const soft = r.kind === "inferred" || r.kind === "speculative";
            return (
              <div className={`composer-card-receipt ${soft ? "soft" : "grounded"}`} key={`${r.kind}-${r.ref}-${r.preview}`}>
                <p className="composer-card-receipt-claim">{r.preview}</p>
                <span className="composer-card-receipt-src">{r.kind ?? "unsupported"} <span aria-hidden="true">·</span> {r.ref}</span>
              </div>
            );
          })
        ) : (
          <p className="composer-card-empty">No receipt captured yet — this card is unsupported.</p>
        )}
      </div>

      {related.length ? (
        <div className="composer-card-section">
          <span className="composer-card-eyebrow">Related</span>
          <div className="composer-card-related">
            {related.map((rel) => (
              <button className="composer-card-related-row" type="button" key={rel.id} onClick={() => onRelated({ id: rel.id, name: rel.name })}>
                <span className="composer-card-related-verb">{rel.verb.replace(/_/g, " ")}</span>
                <span className="composer-card-related-name">{rel.name}</span>
                <ChevronRight size={13} aria-hidden="true" className="composer-card-related-chev" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {detail.weakness ? (
        <div className="composer-card-weakness">
          <AlertTriangle size={14} aria-hidden="true" />
          <div>
            <strong>{detail.weakness.statement}</strong>
            <span>{detail.weakness.repair}</span>
          </div>
        </div>
      ) : null}

      <div className="composer-card-actions">
        {subjectActions(detail.type).map((action) => (
          <button className="composer-card-action" type="button" key={action} onClick={() => onAction(action)}>
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}

// A founder decision that arrives as a numbered list in the ask text ("1. **The win event** — …") is a
// multiple-choice question wearing prose. Pull the choices out so they can be tapped instead of re-typed.
type AskOption = { label: string; detail: string };
function parseAskOptions(text: string): AskOption[] {
  const options: AskOption[] = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const item = line.match(/^\s*(?:\d+[.)]|[-*•])\s+(.+)$/);
    if (!item) continue;
    let label = item[1].trim();
    let detail = "";
    const bold = label.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    if (bold) {
      label = bold[1];
      detail = bold[2].replace(/^\s*[—–:-]\s*/, "");
    } else {
      const split = label.match(/^(.+?)\s*[—–:]\s+(.+)$/);
      if (split) { label = split[1]; detail = split[2]; }
    }
    label = label.replace(/\*\*/g, "").replace(/[.:]\s*$/, "").trim();
    detail = detail.replace(/\*\*/g, "").trim();
    if (label) options.push({ label, detail });
  }
  return options;
}

// Strip the option lines out of the ask, leaving just the question — the stem the founder reads first.
function stripOptions(text: string): string {
  return String(text ?? "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:\d+[.)]|[-*•])\s+/.test(line))
    .filter((line) => !/^\s*if\s+(it'?s\s+)?more than one/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Chat tabs (one per pipeline the founder is running in parallel) ────────────────────────────
type ChatTabState = "working" | "needs" | "done";
function chatTabState(status: OperatorStatus): ChatTabState {
  if (status === "waiting_for_gate" || status === "waiting_for_proposal" || status === "waiting_for_ideas" || status === "waiting_for_input") return "needs";
  if (status === "running" || status === "ready") return "working";
  return "done"; // completed · cancelled · blocked · failed · interrupted
}
function chatTabName(s: OperatorSessionSummary): string {
  const raw = (s.goal || s.summary || "Untitled pipeline").replace(/^\[[^\]]*\]\s*/, "").trim();
  return raw || "Untitled pipeline";
}

function ChatTabs({ roster, activeId, onSwitch, onNew, onStop, onClose }: {
  roster: OperatorSessionSummary[];
  activeId: string | null;
  onSwitch: (id: string) => void;
  onNew?: () => void;
  // End a running thread (routes through the authorized cancel path) / dismiss an idle or finished one.
  // A tab shows exactly one trailing control on hover: Stop for a live run, Close for a paused/done thread.
  onStop?: (id: string) => void | Promise<void>;
  onClose?: (id: string) => void;
}) {
  const tabs = [...roster].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // Two-tap confirm for a tab that has something to lose — a running run or a pending gate. The first tap
  // on its control ARMS it (swaps to a small "End?"), the second tap within ~3s confirms; switching tabs
  // or the timeout disarms. A finished tab has nothing to lose, so it closes on a single tap, no arm.
  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disarm = () => {
    if (armTimer.current) { clearTimeout(armTimer.current); armTimer.current = null; }
    setArmed(null);
  };
  const arm = (id: string) => {
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmed(id);
    armTimer.current = setTimeout(() => setArmed(null), 3000);
  };
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

  return (
    <div className="chat-tabs" role="tablist" aria-label="Your pipelines">
      {tabs.map((s) => {
        const active = s.id === activeId;
        const state = chatTabState(s.status);
        const running = state === "working";
        // Confirm-required for anything not finished: a live run OR a tab waiting on a founder decision.
        // Never silently drop a run mid-flight or a pending gate.
        const confirmRequired = state !== "done";
        const isArmed = armed === s.id;
        const handleControl = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (running) {
            // Stopping a live run: arm first, confirm on the second tap.
            if (confirmRequired && !isArmed) { arm(s.id); return; }
            disarm();
            void onStop?.(s.id);
          } else {
            // Closing a paused/finished thread. A pending-gate tab still confirms; a done tab closes at once.
            if (confirmRequired && !isArmed) { arm(s.id); return; }
            disarm();
            onClose?.(s.id);
          }
        };
        const controlLabel = running ? `Stop ${chatTabName(s)}` : `Close ${chatTabName(s)}`;
        return (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={active}
            className={`chat-tab ${active ? "active" : ""}`}
            title={chatTabName(s)}
            onClick={() => { if (isArmed) disarm(); onSwitch(s.id); }}
            onBlur={(e) => { if (isArmed && !e.currentTarget.contains(e.relatedTarget as Node)) disarm(); }}
          >
            {active ? (
              <motion.span
                layoutId="chat-tab-pill"
                className="chat-tab-pill"
                transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.8 }}
              />
            ) : null}
            <span className="chat-tab-face">
              <span className={`chat-tab-dot ${state}`} aria-hidden="true" />
              <span className="chat-tab-name">{chatTabName(s)}</span>
            </span>
            {(onStop || onClose) ? (
              <span
                role="button"
                tabIndex={0}
                className={`chat-tab-close ${isArmed ? "armed" : ""}`}
                aria-label={isArmed ? `Confirm — ${controlLabel}` : controlLabel}
                title={isArmed ? "End this pipeline?" : controlLabel}
                onClick={handleControl}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleControl(e as unknown as React.MouseEvent); }
                }}
              >
                {isArmed ? <span className="chat-tab-close-text">End?</span> : running ? <Square size={11} /> : <X size={13} />}
              </span>
            ) : null}
          </button>
        );
      })}
      {onNew ? (
        <button className="chat-tab-new" type="button" onClick={onNew} title="Start another pipeline" aria-label="Start another pipeline">
          <Plus size={15} />
        </button>
      ) : null}
    </div>
  );
}

// ─── Placed mention chips (the @-team the founder named, rendered as roster tiles) ──────────────────────
// The mentions placed in the sentence, surfaced as removable roster tiles below the line so the founder
// can see (and drop) exactly which teammates and capabilities the turn will steer toward. Same RosterTile
// that renders in the @-menu, the parts tray, the idea flow, and the plan — one inventory, one language.
function MentionChips({ mentions, onRemove }: {
  mentions: PlacedMention[];
  onRemove: (m: PlacedMention) => void;
}) {
  if (!mentions.length) return null;
  return (
    <div className="cmp-chips" role="list" aria-label="Teammates and capabilities in this message">
      {mentions.map((m) => (
        <span key={`${m.kind}:${m.id}`} className={`cmp-chip ${m.gated ? "gated" : ""}`} role="listitem">
          {m.kind === "capability"
            ? <RosterTile kind="capability" id={m.id} size="xs" />
            : <RosterTile kind="agent" ref={m.ref ?? m.id} size="xs" />}
          <span className="cmp-chip-label">{m.label}</span>
          <button
            className="cmp-chip-x"
            type="button"
            aria-label={`Remove ${m.label}`}
            title={`Remove ${m.label}`}
            onClick={() => onRemove(m)}
          >
            <X size={11} aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}

// Turn a picked roster entity / dragged step into the structured mention the send path binds.
function entityToPlaced(entity: MentionEntity): PlacedMention {
  if (entity.kind === "agent") return { kind: "agent", id: entity.id, ref: entity.ref, label: entity.label, gated: false };
  return { kind: "capability", id: entity.id, label: entity.label, gated: entity.gated };
}
function dragToPlaced(payload: StepDragPayload): PlacedMention {
  if (payload.kind === "capability") return { kind: "capability", id: payload.id, label: payload.name, gated: payload.gated };
  return { kind: "agent", id: payload.ref, ref: payload.ref, label: payload.label, gated: false };
}

// ─── The crew voice (who speaks a `say` turn) ───────────────────────────────────────────────────
// A conversation is spoken by the crew, never by a faceless "Claude". Take the first real teammate we
// can name — an agent node in the running graph, else the founder's first bench teammate — and fall back
// to a stable crew identity when neither is known. Resolves to a real Notionists face + a plain-English
// role, so every crew turn has a person behind it.
type CrewVoice = { ref: string; job?: string; name: string; role: string };
// Resolve ONE teammate's face + name + role from a ref against the bench — the shared resolver a `say`
// turn and a per-message crew heartbeat both use, so a face never drifts between them. A ref that isn't
// on the bench still lands a real role (agentPersona reads the ref) and a monogram face downstream.
// nameHint is the node's own label, used when the bench carries no name for this ref.
function voiceForRef(ref: string | null | undefined, bench: AgentBenchRow[] | null, nameHint?: string): CrewVoice {
  const resolved = ref || "gtm-compose-workflow";
  const row = bench?.find((b) => b.ref === resolved) ?? null;
  const persona = agentPersona(resolved, row?.job);
  return { ref: resolved, job: row?.job, name: nameHint?.trim() || row?.name?.trim() || persona.role, role: persona.role };
}
// The session-level voice for a `say` turn — the first real teammate in the running graph, else the
// founder's first bench teammate, else a stable crew identity.
function sessionVoice(graph: GTMGraph | null, bench: AgentBenchRow[] | null): CrewVoice {
  const agentNode = graph?.nodes.find((n) => n.kind === "agent" && n.ref);
  const ref = agentNode?.ref ?? bench?.find((b) => b.ref)?.ref ?? "gtm-compose-workflow";
  return voiceForRef(ref, bench);
}

// A friendly clock stamp ("9:14 AM") from an ISO timestamp — for receipts and turn times.
function clockTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ─── The opening briefing ───────────────────────────────────────────────────────────────────────
// One row per live pipeline (the same roster the tabs read): a state dot — a decision waiting is amber,
// working is neutral, quiet is hollow — the pipeline's name, and one plain line about where it stands.
// The host may hand a fuller `briefing` down later; until then this is the honest client-side read.
type BriefingRow = { id: string; name: string; state: "needs" | "work" | "quiet"; what: string };
type Briefing = { eyebrow: string; rows: BriefingRow[] };

function briefingStateOf(status: OperatorStatus): BriefingRow["state"] {
  const s = chatTabState(status);
  return s === "needs" ? "needs" : s === "working" ? "work" : "quiet";
}
function briefingLine(s: OperatorSessionSummary): string {
  const state = chatTabState(s.status);
  if (state === "needs") return "waiting at your gate";
  if (state === "working") return s.summary?.trim() || "working…";
  return s.summary?.trim() || "quiet for now";
}
function deriveBriefing(roster: OperatorSessionSummary[]): Briefing {
  const rows = [...roster]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((s) => ({ id: s.id, name: chatTabName(s), state: briefingStateOf(s.status), what: briefingLine(s) }));
  const now = new Date();
  const eyebrow = `${now.toLocaleDateString([], { weekday: "long" })}, ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return { eyebrow, rows };
}

export function ComposerDock({
  session, running, onSend, onCancel, onReviewGate,
  bench = null,
  roster = [], activeSessionId = null, onSwitchSession, onNewChat, onStopSession, onCloseSession,
  floating = false, focusSignal = 0, recede = false,
  posture, onExitPosture, onPin,
  graph = null,
  subject = null, onClearSubject, onRetargetSubject, isNavCommand,
  onProposeCandidates, onBuildCandidate,
  briefing = null,
  onSubmitGateReview, onRefineItem, onRecordItemOutcome,
  gateLearned = 0, gateOffer = null, gatePromote,
  seed = null, startOpen = false,
}: {
  session: OperatorSession | null;
  running: boolean;
  // The founder's crew — the same bench the rail reads. Feeds the @-mention roster and the parts tray so
  // "@" autocompletes teammates and the summoned tray shows their faces. null while loading; empty is fine.
  bench?: AgentBenchRow[] | null;
  // The founder's live pipelines — one operator session each. The tab strip renders them; `activeSessionId`
  // is the one on screen; switching swaps the conversation. `onNewChat` starts another.
  roster?: OperatorSessionSummary[];
  activeSessionId?: string | null;
  onSwitchSession?: (id: string) => void;
  onNewChat?: () => void;
  // Per-tab lifecycle: STOP a running thread (routes through the authorized cancel path) or CLOSE a
  // paused/finished one (a client-side dismissal). Threaded straight to ChatTabs — no dock-side logic.
  onStopSession?: (id: string) => void | Promise<void>;
  onCloseSession?: (id: string) => void;
  // The canvas↔chat tie: the object the founder handed to Claude from the canvas. A node-graph step shows
  // the lightweight header; an object-graph card carries `detail` and the composer BECOMES that card.
  subject?: CanvasSubject | null;
  onClearSubject?: () => void;
  onRetargetSubject?: (rel: { id: string; name: string }) => void;
  // True when the text is a canvas navigation command ("go to the gate") — steering, not a question.
  isNavCommand?: (text: string) => boolean;
  // Send a turn to Claude. Carries the optional advisory @-mention hints (the teammates & capabilities the
  // founder named in the sentence) so composition prefers the named crew — never a contract, never blocking.
  onSend: (text: string, hints?: OperatorHints) => void | Promise<void | { mode: "fast" | "drive"; intent: string; answer?: string }>;
  onCancel: () => void | Promise<void>;
  onReviewGate: (nodeId: string) => void;
  // The founder gate, brought INTO the chat. When a run pauses at the wall, "Review & send" opens the real
  // GateReview stage in-thread; approving routes through onSubmitGateReview — the SAME authorized release
  // path the canvas gate uses (App.submitGateReview → resolveOperatorGate). Nothing here sends: the founder's
  // explicit approve flows through the unchanged handler. onRefineItem is veto-as-loop (send back to the crew,
  // not a release); onRecordItemOutcome records what already happened on an approved item.
  onSubmitGateReview?: (nodeId: string, decisions: Record<string, GateDecision>) => void | Promise<void>;
  onRefineItem?: (item: GTMItem, note: string) => void | Promise<void>;
  onRecordItemOutcome?: (item: GTMItem, outcome: { outcomeKind: string; value?: number }) => void | Promise<void>;
  gateLearned?: number;
  gateOffer?: string | null;
  gatePromote?: GatePromote;
  floating?: boolean;
  focusSignal?: number;
  // The cold landing of an empty product: the composer opens instead of resting as a slim edge rail, so
  // "State a go-to-market goal" points at a visible input. Only forces open on the rising edge.
  startOpen?: boolean;
  // A message the founder started from the canvas — the host pre-fills the input (and opens the dock) but
  // NEVER sends it: the founder reads, edits, and presses send. The token makes an identical re-ask re-seed.
  seed?: { text: string; token: number } | null;
  // While Claude stages a graph change, the cursor builds it onto the canvas and the composer RECEDES to
  // its slim line to leave the watch beat unobstructed. It re-opens the moment the proposal resolves.
  recede?: boolean;
  // Ideate posture — the composer in a "thinking, not building" register. Undefined is treated as "build".
  posture?: "build" | "ideate";
  onExitPosture?: () => void;
  onPin?: (kind: ClarityKind, text: string) => void;
  // The live graph — read only for the session-level teammate voice (the first real agent in the running graph).
  graph?: GTMGraph | null;
  // Candidate pipeline SHAPES. When a goal admits more than one way through, the dock renders them as
  // embodied idea flows (a chain of faces/marks ending at the gate). `onProposeCandidates` fires once per
  // new set so the host can also ghost them on the canvas; `onBuildCandidate` is the founder's pick.
  onProposeCandidates?: (candidates: Candidate[]) => void;
  onBuildCandidate?: (candidate: Candidate) => void | Promise<void>;
  // The opening briefing — the "here's where things stand" block at the top of the thread. Optional: when
  // absent the dock derives it client-side from `roster` (one row per live pipeline), so it works today with
  // no host wiring; when the host later hands a fuller read, it overrides the derived one.
  briefing?: Briefing | null;
}) {
  // ── THE STATE MODEL: closed (a slim edge line) vs open (the three zones). It opens itself for exactly
  // one reason — the founder is needed — and never self-drives between the six shapes it used to. `floating`
  // keeps its own resting-pill model for the rare over-canvas usage; docked is closed/open only.
  const [collapsed, setCollapsed] = useState(
    startOpen ? false : (floating || !session || TERMINAL.has(session.status)),
  );
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Ephemeral fast-lane turns (status/explain) — answered without a session, so they aren't in
  // session.events. Rendered in the thread just after the opening briefing; cleared when a drive lands
  // or the session switches.
  const [fastTurns, setFastTurns] = useState<{ id: string; you: string; answer: string; at: string }[]>([]);

  // ── @-mention state: the roster (crew + capabilities), the mentions placed in the sentence, the live
  // "@query" being typed, and whether the summoned parts tray is open. ──────────────────────────────────
  const rosterEntities = useMemo(() => buildRoster(bench ?? []), [bench]);
  const [mentions, setMentions] = useState<PlacedMention[]>([]);
  const [mentionQuery, setMentionQuery] = useState<{ query: string; start: number; end: number } | null>(null);

  // Voice — a simple tap-to-talk mic (the composer's calm signature; the heavy amplitude waveform was
  // retired). TAP the mic → hands-free listening locks on (tap again to stop and send); HOLD → push-to-talk
  // (release to send). What's heard shows as a tentative line; when you stop, the settled transcript sends
  // (or lands in the input if Claude is mid-turn).
  const [voiceOn, setVoiceOn] = useState(false);
  const [locked, setLocked] = useState(false);
  const [heardText, setHeardText] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const engagedRef = useRef(false);
  const lockedRef = useRef(false);
  const pressStartRef = useRef(0);
  const heardRef = useRef("");
  const sendOnEndRef = useRef(false);
  const TAP_MS = 350;
  // Which engine + model drives the operator — Claude or Codex. A persisted founder preference.
  const [model, setModel] = useState<string>(() =>
    (typeof localStorage !== "undefined" && localStorage.getItem("gtm.model")) || DEFAULT_MODEL);
  const pickModel = (id: string) => { setModel(id); try { localStorage.setItem("gtm.model", id); } catch { /* private mode */ } };
  const engineName = modelById(model).agent === "codex" ? "Codex" : "Claude";
  const timelineRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const startVoice = () => {
    if (engagedRef.current) return;
    engagedRef.current = true;
    setVoiceError(null);
    setHeardText("");
    heardRef.current = "";
    const SR = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = SR.SpeechRecognition ?? SR.webkitSpeechRecognition;
    if (!Ctor) {
      setVoiceError("Voice typing isn't supported in this browser.");
      engagedRef.current = false;
      return;
    }
    setVoiceOn(true);
    const r = new Ctor();
    r.continuous = true; r.interimResults = true; r.lang = "en-US";
    r.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      txt = txt.trim();
      heardRef.current = txt;
      setHeardText(txt);
    };
    r.onerror = () => { setVoiceError("Microphone is blocked. Allow mic access to talk to your crew."); };
    r.onend = () => {
      recognitionRef.current = null;
      if (sendOnEndRef.current) { sendOnEndRef.current = false; flushHeard(); }
    };
    recognitionRef.current = r;
    try { r.start(); } catch { /* a double-start throws; ignore */ }
  };

  const stopVoice = () => {
    if (!engagedRef.current) return;
    engagedRef.current = false;
    lockedRef.current = false;
    setLocked(false);
    setVoiceOn(false);
    const r = recognitionRef.current;
    if (r) { sendOnEndRef.current = true; try { r.stop(); } catch { flushHeard(); } }
    else { flushHeard(); }
  };

  const pressVoice = (ts: number) => {
    if (lockedRef.current) { stopVoice(); return; }
    if (engagedRef.current) return;
    pressStartRef.current = ts;
    startVoice();
  };

  const releaseVoice = (ts: number) => {
    if (!engagedRef.current || lockedRef.current) return;
    if (ts - pressStartRef.current < TAP_MS) { lockedRef.current = true; setLocked(true); }
    else stopVoice();
  };

  const flushHeard = () => {
    const text = heardRef.current.trim();
    heardRef.current = "";
    setHeardText("");
    if (!text) return;
    const nav = isNavCommand?.(text) ?? false;
    if (sendDisabled && !nav) { setInput((prev) => (prev ? prev + " " : "") + text); inputRef.current?.focus(); }
    else void sendText(text);
  };

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  // Follow the layout context: collapse to the slim line when the dock starts floating over a workbench.
  const [trackedFloating, setTrackedFloating] = useState(floating);
  if (trackedFloating !== floating) {
    setTrackedFloating(floating);
    setCollapsed(floating);
  }

  // Cold landing of an empty product: open so its goal input is visible. Rising edge only.
  const [trackedStartOpen, setTrackedStartOpen] = useState(startOpen);
  if (startOpen !== trackedStartOpen) {
    setTrackedStartOpen(startOpen);
    if (startOpen) setCollapsed(false);
  }

  // A FINISHED session on the read-only overview rests as the slim line, so a completed transcript never
  // covers the canvas. The thread is one click away. An active session stays open.
  const terminalOverview = !floating && !!session && TERMINAL.has(session.status);
  const [trackedTerminalOverview, setTrackedTerminalOverview] = useState(terminalOverview);
  if (terminalOverview !== trackedTerminalOverview) {
    setTrackedTerminalOverview(terminalOverview);
    if (terminalOverview) setCollapsed(true);
  }

  // focusSignal — the founder EXPLICITLY asked for the composer (stated a goal, handed Claude a node,
  // started another pipeline). Always open in the same render (so the input is mounted) and focus it.
  const [trackedFocus, setTrackedFocus] = useState(focusSignal);
  if (focusSignal !== trackedFocus) {
    setTrackedFocus(focusSignal);
    setCollapsed(false);
  }
  useEffect(() => {
    if (focusSignal) inputRef.current?.focus();
  }, [focusSignal]);

  // A canvas-started message pre-fills the input, opens the dock, and focuses it — but is never sent.
  const [trackedSeed, setTrackedSeed] = useState(seed?.token ?? 0);
  if (seed && seed.token !== trackedSeed) {
    setTrackedSeed(seed.token);
    setInput(seed.text);
    setCollapsed(false);
  }
  useEffect(() => {
    if (seed?.token) inputRef.current?.focus();
  }, [seed?.token]);

  // Recede while a proposal stages onto the canvas; rise again once it's resolved.
  const [trackedRecede, setTrackedRecede] = useState(recede);
  if (recede !== trackedRecede) {
    setTrackedRecede(recede);
    setCollapsed(recede);
  }

  // Selecting a card on the object graph opens the dock so the composer BECOMES that card.
  const subjectCardKey = subject?.detail ? subject.id : "";
  const [trackedSubjectCard, setTrackedSubjectCard] = useState(subjectCardKey);
  if (subjectCardKey !== trackedSubjectCard) {
    setTrackedSubjectCard(subjectCardKey);
    if (subjectCardKey) setCollapsed(false);
  }

  // ⌘K / Ctrl-K summons the composer from anywhere — always one key away.
  const [openFocus, setOpenFocus] = useState(0);
  useEffect(() => {
    if (openFocus) inputRef.current?.focus();
  }, [openFocus]);
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

  // A new conversation starts clean — the ephemeral fast answers belong to the session they were asked in.
  // Adjust-during-render (the file's idiom), not a setState-in-effect: reset only when the session id changes.
  const [trackedFastSession, setTrackedFastSession] = useState(session?.id);
  if (trackedFastSession !== session?.id) { setTrackedFastSession(session?.id); setFastTurns([]); }

  const ideating = posture === "ideate";
  const sessionActive = !!session && !TERMINAL.has(session.status);
  const waitingGate = session?.status === "waiting_for_gate";
  const pendingGateId = session?.pendingGate?.nodeIds[0];
  // The staged drafts to review — read straight off the session's own pending-gate payload (the gate
  // node's result.items), not a top-level .items (GTMRunResult has none). Empty when the node result or
  // its items are missing, so the gate falls back to its summary card rather than opening a hollow stage.
  const gateItems = useMemo<GTMItem[]>(() => {
    const id = session?.pendingGate?.nodeIds[0];
    const r = session?.pendingGate?.runResult;
    return (id && r?.nodes[id]?.items) || [];
  }, [session?.pendingGate]);
  // The in-thread review stage — flipped open by "Review & send". Local, so it never sends; it just opens
  // the real GateReview whose approve routes through the authorized release handler.
  const [reviewOpen, setReviewOpen] = useState(false);
  // A resolved gate or a switched pipeline closes a stale-open stage. Keyed off the pending-gate identity
  // (the gate node id) and the waiting flag so it resets when the gate clears or the founder switches away.
  // Adjust-during-render (the file's idiom), not a setState-in-effect.
  const gateStageKey = `${pendingGateId ?? ""}|${waitingGate ? 1 : 0}|${session?.id ?? ""}`;
  const [trackedGateStageKey, setTrackedGateStageKey] = useState(gateStageKey);
  if (trackedGateStageKey !== gateStageKey) { setTrackedGateStageKey(gateStageKey); setReviewOpen(false); }
  const sendDisabled = running || session?.status === "running" || session?.status === "ready" || waitingGate;
  const working = running || session?.status === "running";
  // The latest reasoning turn, while the crew is still producing — it gets the soft streaming shimmer + a
  // caret, so the output reads as "still forming" instead of a finished block that popped in.
  const streamingSayId = working && session
    ? [...session.events].reverse().find((e) => speakerOf(e) === "say")?.id ?? null
    : null;
  // The newest teammate heartbeat while the run is live — it gets the same soft shimmer as a forming
  // say-turn, so the latest beat reads as "still working" and older beats settle behind it.
  const streamingCrewId = working && session
    ? [...session.events].reverse().find((e) => e.type === "teammate_said")?.id ?? null
    : null;
  // Who voices the crew's turns in this thread — a real face + role, never a faceless "Claude".
  const voice = sessionVoice(graph, bench);

  // A gate or a pending question is the founder's judgment moment — open on its rising edge.
  const needsDecision = waitingGate || !!session?.pendingQuestion;
  const [trackedNeedsDecision, setTrackedNeedsDecision] = useState(needsDecision);
  if (needsDecision !== trackedNeedsDecision) {
    setTrackedNeedsDecision(needsDecision);
    if (needsDecision) setCollapsed(false);
  }

  // The run is the plan made live — open on its rising edge so the plan checklist is in front of the
  // founder, striking off step by step in lockstep with the canvas.
  const runLive = running && !!graph && graph.nodes.length > 0;
  const [trackedRunLive, setTrackedRunLive] = useState(runLive);
  if (runLive !== trackedRunLive) {
    setTrackedRunLive(runLive);
    if (runLive) setCollapsed(false);
  }

  // Ambiguous-goal shapes, read off the session through the one isolated seam.
  const candidates = sessionCandidates(session);
  const candidateSig = candidates.map((c) => c.id).join("|");
  const [pickedCandidateId, setPickedCandidateId] = useState<string | null>(null);
  const [trackedCandidateSig, setTrackedCandidateSig] = useState(candidateSig);
  if (candidateSig !== trackedCandidateSig) {
    setTrackedCandidateSig(candidateSig);
    setPickedCandidateId(null);
    if (candidateSig) setCollapsed(false);
  }
  const proposedSigRef = useRef<string>("");
  useEffect(() => {
    if (candidateSig && candidateSig !== proposedSigRef.current) {
      proposedSigRef.current = candidateSig;
      onProposeCandidates?.(candidates);
    } else if (!candidateSig) {
      proposedSigRef.current = "";
    }
  }, [candidateSig, candidates, onProposeCandidates]);

  const buildCandidate = (candidate: Candidate) => {
    if (pickedCandidateId) return;
    setPickedCandidateId(candidate.id);
    setCollapsed(false);
    if (onBuildCandidate) { void onBuildCandidate(candidate); return; }
    void onSend(`Build this pipeline — ${candidate.label}. ${candidate.rationale} Compose it and run it to my gate.`);
  };

  // ── @-mention wiring ──────────────────────────────────────────────────────────────────────────────────
  // The advisory hints a send carries: the teammates (crew refs) and capabilities the founder @-named. Built
  // from the placed mentions; folded into the operator's context so composition prefers them — never blocks.
  const hintsFromMentions = (): OperatorHints | undefined => {
    const teammates = mentions.filter((m) => m.kind !== "capability").map((m) => m.ref ?? m.id);
    const capabilities = mentions.filter((m) => m.kind === "capability").map((m) => m.id);
    if (!teammates.length && !capabilities.length) return undefined;
    return {
      ...(teammates.length ? { teammates } : {}),
      ...(capabilities.length ? { capabilities } : {}),
    };
  };

  // Detect the live "@query" at the caret and open/close the mention menu accordingly.
  const syncMentionQuery = (value: string, caret: number) => {
    setMentionQuery(detectMentionQuery(value, caret));
  };

  // Splice a placed mention's readable surface ("@Label ") into the sentence, recording the structured
  // mention so the send path can steer toward it. `range` (from detectMentionQuery) replaces the live query;
  // without one the mention lands at the caret (a parts-tray click or a dropped tile).
  const insertMention = (placed: PlacedMention, range?: { start: number; end: number }) => {
    const surface = `@${placed.label} `;
    const el = inputRef.current;
    const caret = range ? range.end : (el?.selectionStart ?? input.length);
    const start = range ? range.start : caret;
    const next = input.slice(0, start) + surface + input.slice(caret);
    setInput(next);
    setMentions((prev) => (prev.some((m) => m.kind === placed.kind && m.id === placed.id) ? prev : [...prev, placed]));
    setMentionQuery(null);
    const pos = start + surface.length;
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (node) { node.focus(); node.setSelectionRange(pos, pos); }
    });
  };

  // Drop a placed mention: pull it from the strip and remove one "@Label" occurrence from the sentence.
  const removeMention = (m: PlacedMention) => {
    setMentions((prev) => prev.filter((x) => !(x.kind === m.kind && x.id === m.id)));
    const needle = `@${m.label}`;
    setInput((prev) => {
      const idx = prev.indexOf(needle);
      if (idx < 0) return prev;
      return (prev.slice(0, idx) + prev.slice(idx + needle.length)).replace(/ {2,}/g, " ");
    });
  };

  // A tile dropped from the parts tray (or the rail) onto the line inserts a mention chip — the same
  // PlacedMention the click and the @-menu produce, so all three paths land identically.
  const onInputDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const raw = e.dataTransfer.getData(STEP_DRAG_MIME);
    if (!raw) return;
    e.preventDefault();
    try { insertMention(dragToPlaced(JSON.parse(raw) as StepDragPayload)); } catch { /* not a step payload */ }
  };

  const sendText = async (raw: string, hints?: OperatorHints) => {
    if (submitting) return;
    const value = raw.trim();
    if (!value) return;
    const nav = isNavCommand?.(value) ?? false;
    if (sendDisabled && !nav) return;
    setSubmitting(true);
    setCollapsed(false);
    setMentionQuery(null);
    try {
      const r = await onSend(value, hints);
      setInput("");
      setMentions([]);
      if (r && r.mode === "fast" && typeof r.answer === "string") {
        setFastTurns((prev) => [...prev, { id: `fast-${Date.now()}`, you: value, answer: r.answer!, at: new Date().toISOString() }]);
      } else if (r && r.mode === "drive") {
        setFastTurns([]);
      }
    } finally { setSubmitting(false); }
  };

  // Send the sentence to the crew — plus the advisory @-mention hints, unless it's a canvas nav command.
  const send = () => {
    const nav = isNavCommand?.(input.trim()) ?? false;
    void sendText(input, nav ? undefined : hintsFromMentions());
  };

  // Tapping an inline "your call" option drops its label into the reply (appending, so several can stack).
  const askPick = (text: string) => {
    setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
    inputRef.current?.focus();
  };

  // The briefing shown at the top of the thread: the host's read when handed, else derived from the roster.
  const briefingModel = briefing ?? deriveBriefing(roster);

  // ── The input zone (Zone 3): the calm sentence line — @-chips, the mention menu, a small model picker,
  // the mic, and a plain send button. Shared by the open panel and the floating resting state so the input
  // never changes shape as you move.
  const composer = (
    <div className="oc-input-wrap">
      {ideating ? (
        <div className="composer-posture">
          <Lightbulb className="composer-posture-icon" size={13} aria-hidden="true" />
          <span className="composer-posture-label">Ideating — thinking, not building</span>
          {onExitPosture ? (
            <button
              className="composer-posture-x"
              type="button"
              aria-label="Exit the ideate posture"
              title="Exit ideating"
              onClick={onExitPosture}
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      ) : null}
      {/* Node-graph step attached from the canvas — a lightweight header. Object-graph cards render the full
          card face at the top of the panel instead (subject.detail), so this stays for steps only. */}
      {subject && !subject.detail ? (
        <div className="composer-attached">
          <div className="composer-attached-head">
            <span className="composer-attached-title">
              Your crew <span aria-hidden="true">·</span> editing {humanizeKind(subject.kind)}
            </span>
            {onClearSubject ? (
              <button
                className="composer-subject-x"
                type="button"
                aria-label={`Stop editing ${subject.label}`}
                title="Let go of this object"
                onClick={onClearSubject}
              >
                <X size={12} />
              </button>
            ) : null}
          </div>
          <div className="composer-attached-label" title={subject.label}>{subject.label}</div>
        </div>
      ) : null}

      {/* The @-mention menu — Notion-style, sectioned Teammates / Capabilities. The parent detects & ranks;
          the menu owns highlight + arrow/enter/esc nav. Anchored above the input line. */}
      {mentionQuery ? (
        <MentionMenu
          query={mentionQuery.query}
          results={rankRoster(rosterEntities, mentionQuery.query)}
          onPick={(entity) => insertMention(entityToPlaced(entity), { start: mentionQuery.start, end: mentionQuery.end })}
          onClose={() => setMentionQuery(null)}
          className="composer-mention"
        />
      ) : null}

      <div className="oc-input">
        <textarea
          ref={inputRef}
          className="oc-input-text"
          aria-label="Message your crew"
          placeholder={subject ? `Ask about “${subject.label}” — make it shorter, why it's empty, run it…` : sendDisabled ? "Your crew is working — you can still say “go to …” to move the canvas" : ideating ? "Think through your GTM — who's the real buyer, where's the wedge, why now" : session ? "Reply, redirect, or @-mention a teammate…" : "Message your crew — build, run, or change anything"}
          value={input}
          disabled={submitting}
          onChange={(e) => {
            const el = e.currentTarget;
            setInput(el.value);
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
            syncMentionQuery(el.value, el.selectionStart ?? el.value.length);
          }}
          onKeyUp={(e) => { const el = e.currentTarget; syncMentionQuery(el.value, el.selectionStart ?? el.value.length); }}
          onClick={(e) => { const el = e.currentTarget; syncMentionQuery(el.value, el.selectionStart ?? el.value.length); }}
          onKeyDown={(e) => {
            // While the mention menu is open it owns arrows/enter/esc/tab (a capture-phase listener); don't
            // let Enter also send. Otherwise Enter sends, Shift+Enter newlines.
            if (mentionQuery && ["Enter", "Tab", "ArrowUp", "ArrowDown", "Escape"].includes(e.key)) return;
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          onDrop={onInputDrop}
          onDragOver={(e) => { if (e.dataTransfer.types.includes(STEP_DRAG_MIME)) e.preventDefault(); }}
          rows={1}
        />

        {/* The placed @-team — removable roster tiles, the same tile the menu shows. */}
        <MentionChips mentions={mentions} onRemove={removeMention} />

        {voiceOn && heardText ? <div className="oc-heard" aria-live="polite">{heardText}</div> : null}
        {voiceError ? <p className="oc-voice-error" role="status">{voiceError}</p> : null}

        <div className="oc-input-bar">
          {/* The @-mention keystone — one tap drops an "@" and opens the crew menu at the caret. */}
          <button
            className="oc-ib at"
            type="button"
            aria-label="Mention a teammate"
            title="@ a teammate"
            onClick={() => {
              const el = inputRef.current;
              const caret = el?.selectionStart ?? input.length;
              const end = el?.selectionEnd ?? caret;
              const next = input.slice(0, caret) + "@" + input.slice(end);
              setInput(next);
              const pos = caret + 1;
              requestAnimationFrame(() => {
                const node = inputRef.current;
                if (node) { node.focus(); node.setSelectionRange(pos, pos); syncMentionQuery(node.value, pos); }
              });
            }}
          >
            @
          </button>
          <span className="oc-input-picker" title={sessionActive ? `${engineName} is on this outcome` : "The engine and model working this outcome"}>
            <AgentPicker value={model} onChange={pickModel} />
          </span>
          <button
            className={`oc-ib ${voiceOn ? "active" : ""}`}
            type="button"
            aria-label={locked ? "Listening hands-free — tap to stop and send" : "Tap or hold to talk"}
            aria-pressed={voiceOn}
            title={locked ? "Listening hands-free — tap to stop" : voiceOn ? "Listening… release to send" : "Tap for hands-free, or hold to talk"}
            onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pressVoice(e.timeStamp); }}
            onPointerUp={(e) => releaseVoice(e.timeStamp)}
            onPointerCancel={(e) => releaseVoice(e.timeStamp)}
            onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); pressVoice(e.timeStamp); } }}
            onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); releaseVoice(e.timeStamp); } }}
            onBlur={() => { if (!lockedRef.current) stopVoice(); }}
          >
            <Mic size={15} />
          </button>
          <button
            className="oc-send"
            disabled={submitting || !input.trim() || (sendDisabled && !(isNavCommand?.(input.trim()) ?? false))}
            onClick={() => void send()}
            type="button"
            aria-label="Send to your crew"
          >
            {submitting ? <LoaderCircle className="spin" size={15} /> : <ArrowUp size={15} />}
          </button>
        </div>
      </div>
      <p className="oc-hint">@ a teammate · everything you approve stays as a receipt</p>
    </div>
  );

  // ── CLOSED — the slim edge line. Docked hands the width back to the canvas; floating rests as the
  // command-line pill with a peek at any live session. ─────────────────────────────────────────────────
  if (collapsed) {
    if (!floating) {
      return (
        <aside className="composer-dock docked collapsed our-chat" aria-label="Your crew">
          <button
            className="dock-rail-launcher"
            onClick={() => setCollapsed(false)}
            type="button"
            title="Open Claude"
            aria-label="Open the conversation with Claude"
          >
            <span className={`dock-rail-orb ${working ? "live" : ""}`} aria-hidden="true">
              {working ? <LoaderCircle className="spin" /> : <Bot size={16} />}
            </span>
            <span className="dock-rail-label">Claude</span>
            {waitingGate ? (
              <span className="dock-rail-gate" aria-hidden="true" title="Your review is required">
                <ShieldCheck size={14} />
              </span>
            ) : null}
          </button>
        </aside>
      );
    }
    return (
      <aside className="composer-dock floating resting our-chat" aria-label="Your crew">
        {session ? (
          <button className="composer-peek" onClick={() => setCollapsed(false)} type="button" title="Open the conversation" aria-label="Open the conversation with your crew">
            <span className={`composer-peek-dot ${working ? "live" : ""}`} aria-hidden="true" />
            <span className="composer-peek-text">
              {recede ? "Staged on the canvas — keep, change, or note it there" : working ? "Your crew is working…" : session.events.length ? session.events[session.events.length - 1].title : `Your crew · ${statusLabel(session.status)}`}
            </span>
            <Maximize2 size={13} />
          </button>
        ) : null}
        {composer}
      </aside>
    );
  }

  // ── OPEN — the three zones: chrome (header + tabs), the response stream, the input. ───────────────────
  return (
    <aside className={`composer-dock ${floating ? "floating" : "docked"} our-chat`} aria-label="Your crew">
      {/* ── Zone 1 · chrome — header. The working teammate's face carries the soft rotating ring: calm,
          meaningful presence (the signature). ─────────────────────────── */}
      <header className="oc-head">
        <span className={`oc-presence ${working ? "working" : ""}`}>
          <span className="oc-ring" aria-hidden="true" />
          <CrewFace agentRef={voice.ref} job={voice.job} size={34} state={working ? "working" : "idle"} />
        </span>
        <span className="oc-head-title">Your crew</span>
        <span className="oc-head-sub">
          {working ? `${voice.name} is working…` : session ? "just now" : "on your subscription"}
        </span>
        {onNewChat && roster.length < 2 ? (
          <button className="oc-head-icon" onClick={onNewChat} type="button" title="Start another pipeline" aria-label="Start another pipeline">
            <Plus size={15} />
          </button>
        ) : null}
        {sessionActive && (
          <button className="oc-head-icon oc-head-stop" onClick={() => void onCancel()} type="button" title="Stop" aria-label="Stop your crew">
            <Square size={15} />
          </button>
        )}
        <button
          className="oc-head-icon"
          onClick={() => setCollapsed(true)}
          type="button"
          title={floating ? "Minimize" : "Collapse to the slim line"}
          aria-label={floating ? "Minimize the panel" : "Collapse to the slim line"}
        >
          <X size={16} />
        </button>
      </header>

      {/* ── Zone 1 · chrome — the pipelines you're running, as tabs (only at 2+). */}
      {roster.length >= 2 && onSwitchSession ? (
        <ChatTabs roster={roster} activeId={activeSessionId} onSwitch={onSwitchSession} onNew={onNewChat} onStop={onStopSession} onClose={onCloseSession} />
      ) : null}

      {/* ── The card face — a selected object-graph card, pinned at the top: the composer BECOMES that card. */}
      {subject?.detail ? (
        <SubjectCardFace
          detail={subject.detail}
          onClose={onClearSubject}
          onAction={(action) => { setInput(action); inputRef.current?.focus(); }}
          onRelated={(rel) => onRetargetSubject?.(rel)}
        />
      ) : null}

      {/* ── Zone 2 · the response stream — the opening briefing, then the crew-voiced conversation with its
          two stops (a "your call" card and the calm amber gate) and settled receipts, all in one scroll. */}
      <div
        key={session ? "thread" : "idle"}
        className="composer-dock-timeline oc-thread"
        ref={timelineRef}
        role="log"
        aria-label="Conversation with your crew"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {/* Opening briefing — one row per live pipeline; derived from the roster (or the host's read). */}
        {briefingModel.rows.length ? (
          <div className="oc-briefing oc-rise">
            <div className="oc-briefing-ey"><b>{briefingModel.eyebrow}</b> — here's where things stand</div>
            {briefingModel.rows.map((r) => (
              <div className="oc-vrow" key={r.id}>
                <span className={`oc-vdot ${r.state}`} aria-hidden="true" />
                <span className="oc-vname" title={r.name}>{r.name}</span>
                <span className="oc-vwhat">{r.what}</span>
              </div>
            ))}
          </div>
        ) : null}

        {fastTurns.map((t) => (
          <div key={t.id} className="oc-fast">
            <div className="oc-you-wrap">
              <div className="oc-you">{t.you}</div>
              <div className="oc-you-t tnum">{clockTime(t.at)}</div>
            </div>
            <div className="oc-msg">
              <CrewFace className="oc-msg-face" agentRef={voice.ref} job={voice.job} size={32} />
              <div className="oc-msg-body">
                <div className="oc-who">
                  <span className="oc-who-n">{voice.name}</span>
                  <span className="oc-who-t tnum">{clockTime(t.at)}</span>
                </div>
                <div className="oc-bubble"><MarkdownLite text={t.answer} /></div>
              </div>
            </div>
          </div>
        ))}

        {!session ? (
          <div className="oc-idle">
            <p className="oc-idle-lead">Tell your crew the outcome you want. They compose the teammates that chase it, run them, and stop at your gate.</p>
            <div className="oc-idle-starters">
              {STARTERS.map((s) => (
                <button key={s} className="oc-idle-starter" onClick={() => setInput(s)} type="button">{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <Stagger className="oc-thread-list">
            {(() => { const segs = segmentEvents(session.events); const lastIdx = segs.length - 1; return segs.map((seg, segIdx) =>
              seg.kind === "tool" ? (
                <StaggerItem key={seg.id}>
                  <ToolCluster events={seg.events} idBase={seg.id} live={working && segIdx === lastIdx} />
                </StaggerItem>
              ) : seg.kind === "say" ? (
                <StaggerItem key={seg.id}>
                  <div className="oc-msg">
                    <CrewFace className="oc-msg-face" agentRef={voice.ref} job={voice.job} size={32} />
                    <div className="oc-msg-body">
                      <div className="oc-who">
                        <span className="oc-who-n">{voice.name}</span>
                        {voice.role !== voice.name ? <span className="oc-who-role">{voice.role}</span> : null}
                        <span className="oc-who-t tnum">{clockTime(seg.event.createdAt)}</span>
                      </div>
                      <div className={`oc-bubble ${seg.id === streamingSayId ? "streaming" : ""}`}>
                        {seg.event.detail ? <MarkdownLite text={seg.event.detail} /> : <p>{seg.event.title}</p>}
                      </div>
                      {onPin ? <div className="oc-pin"><PinControl text={(seg.event.detail ?? seg.event.title).trim()} onPin={onPin} /></div> : null}
                    </div>
                  </div>
                </StaggerItem>
              ) : seg.kind === "crew" ? (
                <StaggerItem key={seg.id}>
                  {(() => {
                    // A teammate's first-person heartbeat — face + name resolved PER MESSAGE from the
                    // event's own ref, so consecutive beats can switch teammate to teammate. A `.beat`
                    // reads lighter than a full say-turn; the newest one shimmers while the run is live.
                    const d = (seg.event.data ?? null) as { ref?: string; label?: string } | null;
                    const v = voiceForRef(d?.ref, bench, d?.label);
                    return (
                      <div className="oc-msg beat">
                        <CrewFace className="oc-msg-face" agentRef={v.ref} job={v.job} size={28} state={seg.id === streamingCrewId ? "working" : "idle"} />
                        <div className="oc-msg-body">
                          <div className="oc-who">
                            <span className="oc-who-n">{v.name}</span>
                            {v.role !== v.name ? <span className="oc-who-role">{v.role}</span> : null}
                            <span className="oc-who-t tnum">{clockTime(seg.event.createdAt)}</span>
                          </div>
                          <div className={`oc-bubble beat ${seg.id === streamingCrewId ? "streaming" : ""}`}>
                            <p>{seg.event.title}</p>
                            {seg.event.detail ? <MarkdownLite text={seg.event.detail} /> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </StaggerItem>
              ) : seg.kind === "you" ? (
                <StaggerItem key={seg.id}>
                  <div className="oc-you-wrap">
                    <div className="oc-you">{seg.event.detail || seg.event.title}</div>
                    <div className="oc-you-t tnum">{clockTime(seg.event.createdAt)}</div>
                  </div>
                </StaggerItem>
              ) : seg.kind === "ask" ? (
                <StaggerItem key={seg.id}>
                  {/* Keyed by the event id so a NEW question remounts and clears the old pick. */}
                  <AskCard key={seg.id} event={seg.event} onPick={askPick} />
                </StaggerItem>
              ) : seg.kind === "receipt" ? (
                <StaggerItem key={seg.id}>
                  {(() => {
                    // A settled decision, stamped as a persistent receipt. Never fabricated — it reads the
                    // released-by name off the real gate_resolved event.
                    const data = seg.event.data as { releasedBy?: { name?: string } } | null;
                    const who = data?.releasedBy?.name?.trim() || "you";
                    const time = clockTime(seg.event.createdAt);
                    return (
                      <div className="oc-receipt">
                        <span className="oc-receipt-rc" aria-hidden="true"><Check /></span>
                        <span className="oc-receipt-t"><b>Released</b> — the reviewed work continued</span>
                        <span className="oc-receipt-stamp tnum">{who}{time ? ` · ${time}` : ""}</span>
                      </div>
                    );
                  })()}
                </StaggerItem>
              ) : (
                <StaggerItem key={seg.id}>
                  <div className="oc-sys">
                    <span>{seg.event.detail || seg.event.title}</span>
                  </div>
                </StaggerItem>
              ),
            ); })()}

            {/* ── Embodied idea shapes — a goal with more than one way through returns a few pipeline SHAPES,
                each a chain of crew faces & capability marks ending at the amber gate. Picking one builds it
                (still stops at the gate). Hidden while a gate is waiting so the two decisions never collide. */}
            {candidates.length > 0 && !waitingGate ? (
              <div className="cmp-response-group">
                <p className="cmp-response-lead">A few ways to shape this — each shows its crew in order, ending at your gate. Pick one, edit it, nothing sends until you approve.</p>
                {candidates.map((c) => (
                  <EmbodiedFlow
                    key={c.id}
                    nodes={c.nodes}
                    edges={c.edges}
                    title={c.label}
                    rationale={c.rationale}
                    onBuild={() => buildCandidate(c)}
                    dimmed={!!pickedCandidateId && pickedCandidateId !== c.id}
                    building={pickedCandidateId === c.id}
                  />
                ))}
              </div>
            ) : null}

            {/* ── The gate — the second of two stops. SACRED: it arrives calm and certain, and does not
                perform (no pulse, no bloom). Amber only here. "Review & send" no longer selects an invisible
                canvas node (the dead door) — it opens the REAL review IN the thread: the same GateReview the
                canvas gate uses, releasing through the same authorized handler. Nothing sends until approve. */}
            {waitingGate && pendingGateId ? (
              reviewOpen && gateItems.length ? (
                <div className="oc-gate-stage">
                  <div className="oc-gate-stage-h">
                    <span className="oc-gate-lock" aria-hidden="true"><ShieldCheck /></span>
                    <div>
                      <div className="oc-gate-t">Your call — review your crew's work</div>
                      <div className="oc-gate-s">Nothing sends until you approve.</div>
                    </div>
                    <button
                      className="oc-gate-stage-close"
                      type="button"
                      onClick={() => setReviewOpen(false)}
                    >
                      <X size={13} aria-hidden="true" /> Close
                    </button>
                  </div>
                  <div className="oc-gate-stage-body">
                    <GateReview
                      variant="stage"
                      items={gateItems}
                      run={session.pendingGate?.runResult ?? null}
                      onSubmit={(d) =>
                        onSubmitGateReview ? onSubmitGateReview(pendingGateId, d) : onReviewGate(pendingGateId)}
                      learned={gateLearned}
                      offer={gateOffer}
                      promote={gatePromote}
                      onRefineItem={onRefineItem}
                      onRecordOutcome={onRecordItemOutcome}
                    />
                  </div>
                </div>
              ) : (
                <div className="oc-gate">
                  <div className="oc-gate-h">
                    <span className="oc-gate-lock" aria-hidden="true"><ShieldCheck /></span>
                    <div>
                      <div className="oc-gate-t">Ready to leave — your release</div>
                      <div className="oc-gate-s">
                        {gateItems.length
                          ? "Your crew reached the wall. Nothing sends until you approve."
                          : "Your crew reached the wall — but there's nothing staged to review yet."}
                      </div>
                    </div>
                  </div>
                  <div className="oc-gate-f">
                    <button
                      className="oc-btn amber"
                      onClick={() => { if (gateItems.length) setReviewOpen(true); }}
                      disabled={!gateItems.length}
                      type="button"
                    >
                      Review &amp; send
                    </button>
                  </div>
                </div>
              )
            ) : null}

            {/* ── Error — a snag your crew hit; one calm sentence, never the raw engine text. */}
            {session?.error && !session.pendingQuestion ? (
              <div className="oc-error">
                <span>Your crew hit a snag and paused. You can pick up where it left off.</span>
                <button className="oc-btn" onClick={() => void onSend("continue")} type="button">
                  <Play size={13} aria-hidden="true" /> Try again
                </button>
              </div>
            ) : null}

            {/* The live "now" beat — keeps the thread honest about latency while the crew works. */}
            {working ? (
              <div className="oc-live" role="status">
                <span className="oc-live-orb" aria-hidden="true" />
                <span className="oc-live-text">{session.events.at(-1)?.title ?? "Working…"}</span>
              </div>
            ) : null}
          </Stagger>
        )}
      </div>

      {/* ── Zone 3 · the input ── */}
      {composer}
    </aside>
  );
}
