import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, ArrowUp, BarChart3, Bot, Boxes, Check, ChevronDown, ChevronRight, Code, Database, Filter, LoaderCircle, Lightbulb, Maximize2,
  Mic, Minimize2, PenLine, Pin, Play, Plus, Search, Send, ShieldCheck, Square, Wand2, X,
} from "lucide-react";
import { CrewAvatar } from "@/components/crew/CrewAvatar";
import { agentPersona } from "@/lib/agentPersona";
import { statusLabel } from "@/lib/status";
import { subjectActions } from "@/lib/subjectActions";
import { COMPOSER_VERBS, deriveVerb, frameVerbMessage, type ComposerVerb } from "@/lib/composerVerb";
import { rosterState, type RosterState } from "@/lib/rosterState";
import { kindIcon } from "@/lib/objectKindIcons";
import { humanizeFieldLabel } from "@/lib/labels";
import type { CanvasSubject, CardDetail } from "@/lib/cardDetail";
import type { ObjectCandidate } from "@/api";
import { motion } from "motion/react";
import { AgentPicker } from "@/components/AgentPicker";
import { DEFAULT_MODEL, modelById } from "@/components/agent-picker-models";
import { DockContext } from "@/components/DockContext";
import { Collapse, Stagger, StaggerItem } from "@/lib/motion";
import "@/styles/dock-context.css";
import "@/styles/composer-posture.css";
import "@/styles/composer-candidates.css";
import "@/styles/chat-tabs.css";
import type { ClarityKind, ContextManifest, GTMEdge, GTMGraph, GTMNode, GTMNodeCategory, GTMRunResult, OperatorEvent, OperatorSession, OperatorSessionSummary, OperatorStatus } from "@/types";

// A pipeline SKETCH the operator returns when the goal is too vague to compose one graph — a named
// shape the founder can pick from, not a draft to approve. Mirrors the backend's ambiguous-goal
// result: { kind: "candidates", candidates: [...] }. These never run or send; picking one is what
// starts the build (which still stops at the founder gate downstream).
type Candidate = { id: string; label: string; rationale: string; nodes: GTMNode[]; edges: GTMEdge[] };

// ─── The ONE seam where the backend's ambiguous-goal result is read off the session ─────────────
// The backend agent defines, in parallel, an operator capability that stages candidate pipeline
// shapes for a vague goal. Until the exact landing field is pinned, this probes the likely spots (a
// `pendingCandidates` field mirroring the existing `pendingIdeas`, a top-level `candidates`, or a
// staged event whose `data.kind === "candidates"`). Returns [] when absent, so the dock degrades to
// the normal conversation. To reconcile with the backend's real field name, change only this reader.
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
//   tool   — a tool call (inspect product, inspect context…). RECEDES: consecutive ones collapse
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
// canvas as a durable card via onPin. Self-contained (own open state, own outside-click), so adding
// it to a message never touches the conversation rendering around it.
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

// ─── The build room (expanded dock) ─────────────────────────────────────────────────────────────
// The right zone of the expanded dock: a live slice of the real canvas. The graph's nodes render in
// the product's own card language (icon tile + eyebrow + label, amber gate, green grounded), the node
// executing right now lit by the rainbow "happening now" signal. Watch it build while you keep talking.
const CATEGORY_META: Record<GTMNodeCategory, { eyebrow: string; Icon: typeof Search }> = {
  source: { eyebrow: "Source", Icon: Search },
  enrich: { eyebrow: "Enrich", Icon: Database },
  filter: { eyebrow: "Filter", Icon: Filter },
  generate: { eyebrow: "Draft", Icon: PenLine },
  gate: { eyebrow: "Gate", Icon: ShieldCheck },
  execute: { eyebrow: "Send", Icon: Send },
  measure: { eyebrow: "Measure", Icon: BarChart3 },
  context: { eyebrow: "Context", Icon: Boxes },
  resource: { eyebrow: "Connection", Icon: Boxes },
};
// Open `kind` steps (agent/skill/code/mcp) carry no `category` — it's an optional label, not the
// dispatch key (see AGENTS.md). Falling through to CATEGORY_META for them mislabeled every agent
// step "Source" here. Mirrors GraphCanvas.tsx's KIND_META so a step reads the same kind in both places.
const KIND_META: Partial<Record<NonNullable<GTMNode["kind"]>, { eyebrow: string; Icon: typeof Search }>> = {
  agent: { eyebrow: "Agent", Icon: Bot },
  skill: { eyebrow: "Skill", Icon: Wand2 },
  code: { eyebrow: "Code", Icon: Code },
  mcp: { eyebrow: "Connector", Icon: Boxes },
};
function buildCardMeta(node: GTMNode) {
  if (node.kind && node.kind !== "tool" && KIND_META[node.kind]) return KIND_META[node.kind]!;
  return CATEGORY_META[node.category] ?? CATEGORY_META.source;
}

function BuildCard({ node, live, ghost }: { node: GTMNode; live: boolean; ghost: boolean }) {
  const meta = buildCardMeta(node);
  const isGate = node.category === "gate";
  const { Icon } = meta;
  return (
    <div className={`dock-build-card ${isGate ? "gate" : ""} ${live ? "live" : ""} ${ghost ? "ghost" : ""}`}>
      <div className="dock-build-card-head">
        <span className="dock-build-card-ico">{live ? null : <Icon size={14} aria-hidden="true" />}</span>
        <span className="dock-build-card-eyebrow">{meta.eyebrow}</span>
        {isGate ? <span className="dock-build-card-tag">your gate</span> : null}
        {live ? <span className="dock-build-card-tag now">building</span> : null}
        {ghost && !live ? <span className="dock-build-card-tag proposed">proposed</span> : null}
      </div>
      <div className="dock-build-card-label">{node.label}</div>
    </div>
  );
}

// ─── The plan roster (the run's live checklist) ─────────────────────────────────
// The composed plan is known the instant a build/run starts, so it renders as a checklist: one row per
// step, each wearing the pixel face of the agent doing it (a deterministic step wears its tool icon; the
// founder gate wears amber). Row state binds to the streamed run — waiting until the step starts, a live
// rainbow while it runs, struck off the moment it lands — in lockstep with the canvas node that the same
// `runningNodeId` lights. No fabricated progress: a row only advances on a real streamed event. The
// binding itself lives in lib/rosterState.ts (pure + unit-tested); this file just renders it.

// One checklist row: leading status tick, the step's face, its plain-English name, and a state word.
function RosterRow({ node, state }: { node: GTMNode; state: RosterState }) {
  const isGate = node.category === "gate";
  // Any node with a ref is a rented mind (agent / skill / connector) — give it a face. Deterministic
  // steps (code, tool, workbench) and the founder gate carry no ref and wear their own mark instead.
  const persona = !isGate && node.ref ? agentPersona(node.ref, node.label ?? node.agentPrompt) : null;
  const meta = buildCardMeta(node);
  const { Icon } = meta;
  const eyebrow = isGate ? "Your gate" : persona ? persona.role : meta.eyebrow;
  const stateWord =
    state === "ghost" ? "Proposed"
    : state === "working" ? "Working"
    : state === "gate" ? "Your call"
    : state === "stuck" ? "Needs a look"
    : state === "done" ? "Done"
    : isGate ? "Your call"          // an upcoming gate names the founder's step ahead of time
    : "Waiting";
  return (
    <div className={`roster-row ${state}${isGate ? " is-gate" : ""}`}>
      <span className="roster-tick" aria-hidden="true">
        {state === "done" ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      <span className="roster-face" aria-hidden="true">
        {isGate ? <ShieldCheck size={16} />
          : persona ? <CrewAvatar agentRef={node.ref!} family={persona.family} size={30} state={state === "working" ? "working" : "idle"} />
          : <Icon size={15} />}
      </span>
      <span className="roster-body">
        <span className="roster-eyebrow">{eyebrow}</span>
        <span className="roster-name">{node.label}</span>
      </span>
      <span className="roster-state">{stateWord}</span>
    </div>
  );
}

function BuildRail({ graph, runningNodeId, proposedNodeIds, result }: {
  graph: GTMGraph;
  runningNodeId: string | null;
  // Steps Claude has proposed but the founder hasn't accepted yet — rendered as ghost (dashed) rows,
  // the same "not yet real" language as the main canvas, plus counted out in the summary below.
  proposedNodeIds?: Set<string> | null;
  // The run so far, streamed in step by step, so each row reflects a real event — never a guess.
  result?: GTMRunResult | null;
}) {
  // Plan order: top-down by canvas position, the same reading order the overview canvas uses.
  const nodes = [...graph.nodes]
    .filter((n) => n.category !== "context" && n.category !== "resource")
    .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
  const proposedCount = proposedNodeIds ? nodes.filter((n) => proposedNodeIds.has(n.id)).length : 0;
  const doneCount = result ? nodes.filter((n) => result.nodes[n.id] && result.nodes[n.id]!.ok).length : 0;
  const running = doneCount > 0 || nodes.some((n) => n.id === runningNodeId);
  return (
    <div className="dock-build" aria-label="The plan, striking off live as it runs">
      <div className="dock-build-head">
        <span className="dock-build-head-dot" aria-hidden="true" />
        <span className="dock-build-head-label">Plan</span>
        <span className="dock-build-head-count">
          {proposedCount > 0 ? `${proposedCount} proposed`
            : running ? `${doneCount} of ${nodes.length} done`
            : `${nodes.length} step${nodes.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="dock-roster">
        {nodes.map((n) => (
          <RosterRow
            key={n.id}
            node={n}
            state={rosterState(n, runningNodeId, result, proposedNodeIds?.has(n.id) ?? false)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Candidate pipeline sketches (an ambiguous goal returns a few shapes, not a stall) ──────────
// When the goal is too vague to compose one graph, the operator hands back a small set of concrete
// pipeline SHAPES. The founder picks one; that pick is what starts the build. These are NOT gate
// items: no amber, no ✓/✕ approve gesture — picking a shape is choosing a direction, not approving a
// send. One sketch = its name, a one-line why, and its steps as the same ghost cards the build room
// uses, so the shape reads in the product's own card language.
function CandidateSketch({ candidate, picked, dimmed, onPick }: {
  candidate: Candidate;
  picked: boolean;
  dimmed: boolean;
  onPick: () => void;
}) {
  const nodes = [...candidate.nodes]
    .filter((n) => n.category !== "context" && n.category !== "resource")
    .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
  return (
    <div className={`cnv-cand ${picked ? "picked" : ""} ${dimmed ? "dimmed" : ""}`}>
      <div className="cnv-cand-head">
        <span className="cnv-cand-label">{candidate.label}</span>
        <button className="cnv-cand-pick" type="button" onClick={onPick} disabled={dimmed || picked}>
          {picked ? "Building…" : "Build this"}
        </button>
      </div>
      {candidate.rationale ? <p className="cnv-cand-why">{candidate.rationale}</p> : null}
      {nodes.length ? (
        <div className="cnv-cand-flow">
          {nodes.map((n, i) => (
            <div className="cnv-cand-step" key={n.id}>
              <BuildCard node={n} live={false} ghost />
              {i < nodes.length - 1 ? <span className="dock-build-edge" aria-hidden="true" /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CandidateChoices({ candidates, pickedId, onPick }: {
  candidates: Candidate[];
  pickedId: string | null;
  onPick: (candidate: Candidate) => void;
}) {
  return (
    <div className="cnv-cands" role="group" aria-label="Pipeline shapes to choose from">
      <div className="cnv-cands-head">
        <Boxes size={13} aria-hidden="true" />
        <div className="cnv-cands-head-text">
          <strong>A few ways to shape this</strong>
          <span>Pick one and Claude builds it. Nothing runs or sends until your gate.</span>
        </div>
      </div>
      <div className="cnv-cands-list">
        {candidates.map((c) => (
          <CandidateSketch
            key={c.id}
            candidate={c}
            picked={pickedId === c.id}
            dimmed={!!pickedId && pickedId !== c.id}
            onPick={() => onPick(c)}
          />
        ))}
      </div>
    </div>
  );
}

// A canvas object's type, in founder words — "value_prop"/"valueProposition" → "Value proposition",
// so the attached header reads "Claude · editing Value proposition", never an internal token. Routes
// through the shared field-label map so every surface names an object kind the same plain way.
function humanizeKind(kind: string): string {
  return humanizeFieldLabel(kind) || "Block";
}

// ─── Per-card ideation (the on-card "+" seam) ───────────────────────────────────────────────────
// When the founder clicks a card's "+", the host runs the real grounded ideate and hands the returning
// candidate cards down here. This renders them as a decidable list — nothing is added until the founder
// clicks "add to canvas" on a specific one, at which point the host writes a real draft card joined to
// the source. Distinct from the pipeline candidates above: these are OBJECTS (a message, a trigger),
// not pipeline shapes, and adding one lands a gray DRAFT card, never a send.
type ObjectIdeationState = {
  sourceId: string;
  sourceLabel: string;
  target: string;
  status: "loading" | "done" | "error";
  candidates: ObjectCandidate[];
  // Claude's plain-language reasoning, streamed live as it ideates (empty until the first delta lands).
  reasoning: string;
  error?: string | null;
};

// Strip a trailing partial JSON fence (backticks the stream cut mid-write) so no code marker flickers in.
function cleanReasoning(text: string) {
  return text.replace(/`+\s*$/, "").trim();
}
function ObjectIdeationChoices({ ideation, onAdd, onDismiss }: {
  ideation: ObjectIdeationState;
  onAdd: (candidate: ObjectCandidate) => void;
  onDismiss: () => void;
}) {
  const { target, sourceLabel, status, candidates } = ideation;
  const reasoning = cleanReasoning(ideation.reasoning || "");
  return (
    <div className="cnv-cands obj-ideate" role="group" aria-label={`Ideas for ${target}`}>
      <div className="cnv-cands-head">
        <Lightbulb size={13} aria-hidden="true" />
        <div className="cnv-cands-head-text">
          <strong>Claude <span aria-hidden="true">·</span> ideating {target}</strong>
          <span>for “{sourceLabel}”. Add the ones you like — each lands a draft card. Nothing sends.</span>
        </div>
        <button className="obj-ideate-x" type="button" aria-label="Dismiss these ideas" title="Dismiss" onClick={onDismiss}>
          <X size={13} />
        </button>
      </div>
      {/* Live reasoning: the founder watches Claude think, in plain words, as it ideates. Rendered as a
          Claude say-beat with the blue-violet "working" accent while streaming. Once the first delta
          lands this replaces the pulsing orb; when done it stays visible above the candidates. */}
      {reasoning ? (
        <div className="obj-ideate-reasoning" role="status">
          <span className="obj-ideate-reasoning-eyebrow">
            {status === "loading" ? <span className="obj-ideate-orb" aria-hidden="true" /> : null}
            Claude{status === "loading" ? " · thinking" : ""}
          </span>
          <div className="cnv-say-body"><MarkdownLite text={reasoning} /></div>
        </div>
      ) : status === "loading" ? (
        <div className="obj-ideate-working" role="status">
          <span className="obj-ideate-orb" aria-hidden="true" />
          <span>Claude is thinking through {target}…</span>
        </div>
      ) : null}
      {status === "error" || ideation.error ? (
        <p className="obj-ideate-error">{ideation.error || "Couldn't ideate right now — try again."}</p>
      ) : null}
      {status === "done" && candidates.length === 0 ? (
        <p className="cnv-cand-why">No ideas came back for this card. Try a different card or ask in the composer.</p>
      ) : null}
      {candidates.length ? (
        <div className="cnv-cands-list">
          {candidates.map((c) => (
            <div className="cnv-cand obj-ideate-cand" key={c.id}>
              <div className="obj-ideate-cand-body">
                <span className="cnv-cand-label">{c.statement}</span>
                {c.type ? <span className="obj-ideate-cand-type">{humanizeKind(c.type)}</span> : null}
              </div>
              {c.rationale ? <p className="cnv-cand-why">{c.rationale}</p> : null}
              <button className="obj-ideate-add" type="button" onClick={() => onAdd(c)}>
                <ArrowRight size={13} aria-hidden="true" /> add to canvas
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── The card face (a selected object graph card, folded into the top of the composer) ──────────
// When the founder selects a card on the object graph, the composer BECOMES that card: this face sits
// pinned at the top of the panel and the conversation/ideation/input scope to it below. It's the retired
// right-dock inspector, moved here whole — the state-colored type chip + maturity, the statement, the
// evidence receipts (a guess reads softer than a grounded fact), a clickable Related list that re-targets
// the composer to that card, a weakness line when present, and the Claude action chips (each drops its
// phrasing into the input, editable — never a bare fire). Everything is clamped so it stays scannable.
// The kind glyph for a card face. A plain helper (not a component) so the icon lookup stays out of
// render — the same shape as ObjectGraphCanvas's cardIcon.
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

// The persistent co-pilot. Always docked, never summoned: your channels at the head, the
// operator's live narration in the middle, one input at the foot. Talking to Claude here
// either starts a new session (when idle) or continues the current one — one conversation.
// A founder decision that arrives as a numbered list in the ask text ("1. **The win event** — …")
// is a multiple-choice question wearing prose. Pull the choices out so they can be tapped instead of
// re-typed. Each option is a bold/leading label plus an optional detail clause; anything that isn't a
// list item is left for the stem. Returns no options when the ask is genuinely open-ended — the card
// then falls back to a plain reply, never a broken picker.
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

// Strip the option lines (and the "if it's more than one…" meta) out of the ask, leaving just the
// question being asked — the stem the founder reads first.
function stripOptions(text: string): string {
  return String(text ?? "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:\d+[.)]|[-*•])\s+/.test(line))
    .filter((line) => !/^\s*if\s+(it'?s\s+)?more than one/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── The verb-scoped send control (a canvas object is selected) ─────────────────────────────────
// When the founder has a node or card selected, the plain send arrow becomes a VERB chip: it names the
// action pressing send performs on that object — Draft, Connect, Split, Stage, Ask … — derived
// deterministically from the selection kind and whatever's typed (see composerVerb.ts). The caret opens
// a menu to change it. Monochrome throughout; only the gate verb (Stage) wears amber, because staging is
// the one move that reaches the founder gate. The change never touches the free-chat send (no subject).
function VerbSend({ verb, disabled, submitting, onSend, onPick }: {
  verb: ComposerVerb;
  disabled: boolean;
  submitting: boolean;
  onSend: () => void;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onEsc); };
  }, [open]);
  return (
    <div className={`composer-verb ${verb.gate ? "gate" : ""} ${open ? "open" : ""}`} ref={wrapRef}>
      <button
        className="composer-verb-go"
        type="button"
        disabled={disabled}
        onClick={onSend}
        aria-label={`${verb.label} — send to Claude`}
        title={`${verb.label} — ${verb.hint}`}
      >
        {submitting ? <LoaderCircle className="spin" /> : (
          <>
            <span className="composer-verb-label">{verb.label}</span>
            <ArrowUp size={15} aria-hidden="true" />
          </>
        )}
      </button>
      <button
        className="composer-verb-caret"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change the action"
        title="Change the action"
        disabled={submitting}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open ? (
        <div className="composer-verb-menu" role="menu">
          {COMPOSER_VERBS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="menuitemradio"
              aria-checked={v.id === verb.id}
              className={`composer-verb-item ${v.id === verb.id ? "active" : ""} ${v.gate ? "gate" : ""}`}
              onClick={() => { onPick(v.id); setOpen(false); }}
            >
              <span className="composer-verb-item-label">{v.label}</span>
              <span className="composer-verb-item-hint">{v.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Chat tabs (one per pipeline the founder is running in parallel) ────────────────────────────
// The backend already drives multiple operator sessions at once; this strip is where they get a home.
// Each tab wears a status dot — working (pulsing), needs-you (amber), or done (a quiet ring) — so the
// founder's actual job, "which pipeline is waiting on me," reads at a glance. The active pill springs
// between tabs via Motion's shared layoutId, the same felt motion as the rest of the app.
type ChatTabState = "working" | "needs" | "done";
function chatTabState(status: OperatorStatus): ChatTabState {
  if (status === "waiting_for_gate" || status === "waiting_for_proposal" || status === "waiting_for_ideas" || status === "waiting_for_input") return "needs";
  if (status === "running" || status === "ready") return "working";
  return "done"; // completed · cancelled · blocked · failed · interrupted
}
// A tab's name: the session's short summary if it has one, else its goal, else a fallback. The CSS
// clamps the width and ellipsizes, so a long goal never blows out the strip.
function chatTabName(s: OperatorSessionSummary): string {
  return (s.summary || s.goal || "Untitled pipeline").trim();
}

function ChatTabs({ roster, activeId, onSwitch, onNew }: {
  roster: OperatorSessionSummary[];
  activeId: string | null;
  onSwitch: (id: string) => void;
  onNew?: () => void;
}) {
  // Stable order — oldest first — so a tab never jumps position when its status changes; the dot
  // carries the state, the slot stays put. (Sorting by status would reshuffle tabs under the cursor.)
  const tabs = [...roster].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <div className="chat-tabs" role="tablist" aria-label="Your pipelines">
      {tabs.map((s) => {
        const active = s.id === activeId;
        const state = chatTabState(s.status);
        return (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={active}
            className={`chat-tab ${active ? "active" : ""}`}
            title={chatTabName(s)}
            onClick={() => onSwitch(s.id)}
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

export function ComposerDock({
  session, running, boundChannelName, onSend, onCancel, onReviewGate,
  roster = [], activeSessionId = null, onSwitchSession, onNewChat,
  floating = false, focusSignal = 0, recede = false,
  contextManifest = null, onOpenGrounding, onOpenPicture, onIdeate,
  posture, onExitPosture, onPin,
  graph = null, runningNodeId = null, proposedNodeIds = null, result = null,
  subject = null, onClearSubject, onRetargetSubject, isNavCommand,
  onProposeCandidates, onBuildCandidate,
  objectIdeation = null, onAddObjectCandidate, onDismissObjectIdeation,
  seed = null, startOpen = false,
}: {
  session: OperatorSession | null;
  running: boolean;
  // The founder's live pipelines — one operator session each, all running server-side in parallel. The
  // tab strip renders them; `activeSessionId` is the one on screen; switching swaps the conversation (the
  // host also follows the tab to that pipeline's graph). `onNewChat` starts another. All optional so a
  // caller that never passes a roster keeps the plain single-conversation dock.
  roster?: OperatorSessionSummary[];
  activeSessionId?: string | null;
  onSwitchSession?: (id: string) => void;
  onNewChat?: () => void;
  // The canvas↔chat tie: the object the founder handed to Claude from the canvas. A node-graph step
  // shows the lightweight header; an object-graph card carries `detail`, and the composer BECOMES that
  // card — its face pinned at the top. The host frames the next message with its context and clears it.
  subject?: CanvasSubject | null;
  onClearSubject?: () => void;
  // A Related row on the card face re-targets the composer to that card. The host points the subject at
  // it, which flips the canvas selection and emits the new card's full detail back — the panel never
  // closes. Absent → the Related rows still render but don't re-target.
  onRetargetSubject?: (rel: { id: string; name: string }) => void;
  // True when the text is a canvas navigation command ("go to the gate") — steering, not a question.
  // These are allowed EVEN while Claude is working: they move the camera and never reach the operator.
  isNavCommand?: (text: string) => boolean;
  // The channel the operator session is editing, shown as a quiet sub-label in the dock head. The
  // composer is locked to the project, so there is no longer a "you're viewing a different channel"
  // mismatch to warn about — this is informational only.
  boundChannelName?: string | null;
  onSend: (text: string) => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  onReviewGate: (nodeId: string) => void;
  // On the channel workbench the dock floats over a four-zone IDE rather than holding its own
  // column, so it opens collapsed (a pill) to keep the inspector visible until summoned.
  floating?: boolean;
  // Bumped by the host to summon the chat — e.g. "New channel" opens and focuses it, since a
  // channel is created by telling Claude the goal, not by filling a form.
  focusSignal?: number;
  // The cold landing of an empty product (no pipelines, no run yet): the composer opens instead of
  // resting as a slim edge rail, so "State a go-to-market goal" points at a visible input the founder
  // can read and type into. Only forces open on the rising edge, so a manual collapse still sticks.
  startOpen?: boolean;
  // A message the founder started from the canvas — asking why a GTM path ranks, requesting variants,
  // challenging a bet, editing a belief, or advancing a path to the gate. The host pre-fills the input
  // with it (and opens the dock) but NEVER sends it: the founder reads, edits, and presses send. The
  // token makes an identical re-ask re-seed. Pure steering language; nothing runs until the founder acts.
  seed?: { text: string; token: number } | null;
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
  // Ideate posture — the composer in a "thinking, not building" register. When "ideate", the input
  // invites discussion (who's the buyer, where's the wedge, why now) instead of eagerly composing
  // channels, and a quiet chip in the head marks the posture (× exits it via onExitPosture). The
  // insights from the conversation are pinned as durable clarity cards through onPin. Undefined is
  // treated as "build" — every existing caller keeps its current behavior.
  posture?: "build" | "ideate";
  onExitPosture?: () => void;
  onPin?: (kind: ClarityKind, text: string) => void;
  // The live graph + the node executing right now. When the dock is EXPANDED these power the build
  // room: the right zone renders the real graph as canvas-style cards, the running node lit by the
  // rainbow "now" signal. Optional, so callers without a graph keep the plain conversation.
  graph?: GTMGraph | null;
  runningNodeId?: string | null;
  // Steps Claude has proposed but the founder hasn't accepted yet, and the run's results so far —
  // the build room's "what would change" diff: ghost cards for proposed steps, a summary count.
  proposedNodeIds?: Set<string> | null;
  result?: GTMRunResult | null;
  // Ambiguous-goal candidates. When the operator returns a set of pipeline SHAPES instead of one
  // graph, the dock renders them as selectable sketches. `onProposeCandidates` fires once per new set
  // so the host can also ghost them on the canvas — the in-dock picker stands alone without it.
  // `onBuildCandidate` is the founder's pick reaching the host's compose_and_run build path; when it's
  // absent the dock falls back to a concrete `onSend`, so picking works even before that wiring exists.
  onProposeCandidates?: (candidates: Candidate[]) => void;
  onBuildCandidate?: (candidate: Candidate) => void | Promise<void>;
  // Per-card ideation, driven by the on-card "+". The host runs the real ideate and passes the state
  // (target, source card, the returning candidates) here; `onAddObjectCandidate` is the founder's pick
  // reaching the host's real add_node + provenance add_edge write; `onDismissObjectIdeation` clears it.
  objectIdeation?: ObjectIdeationState | null;
  onAddObjectCandidate?: (candidate: ObjectCandidate) => void | Promise<void>;
  onDismissObjectIdeation?: () => void;
}) {
  // Rest as a pill on first paint when the dock floats over the channel workbench, OR when a FINISHED
  // session would otherwise open its full transcript over the read-only overview canvas. Either way the
  // founder lands on the work, not a panel covering it; the conversation is one click away on the peek.
  // Rest as the slim edge rail whenever there's no live work to watch — floating always opens collapsed,
  // and docked opens collapsed unless an ACTIVE (non-terminal) session is running, so an idle or finished
  // session hands the width back to the canvas instead of holding an open lane over it.
  const [collapsed, setCollapsed] = useState(
    startOpen ? false : (floating || !session || TERMINAL.has(session.status)),
  );
  const [expanded, setExpanded] = useState(false);
  // The docked dock's default is a SLIM INPUT RAIL, not a full conversation column: a single
  // talk-to-Claude input plus a minimal status/peek, so the canvas keeps its width. `panelOpen`
  // false = the slim rail; true = the full conversation panel (thread/focus/candidates/gate + the
  // build room). The founder opens the panel with the ⤢ handle, and any attention moment (a gate, a
  // pending decision, candidates, a selected card, sending a message) opens it for them. Floating is
  // unaffected — it keeps its own resting/pill model — so this only governs the docked lane.
  const [panelOpen, setPanelOpen] = useState(false);
  // One view: the THREAD — the whole conversation in one scroll (your messages, Claude's work folded
  // into a step receipt, the answer, the gate, and the "your call" ask inline). The old Focus/Thread
  // toggle is gone; each pipeline's latest state now reads off its tab, not a per-conversation switch.
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Voice mode — the composer's signature. Two ways in, because hold-only can't carry a long thought:
  //   • TAP the mic → hands-free listening locks on; tap again to stop and send.
  //   • HOLD the mic → push-to-talk; release to send.
  // Either way the rainbow erupts and the waveform is lit from your real microphone amplitude (Web
  // Audio), so the bars track your actual voice instead of a canned loop. What's heard shows as a
  // tentative line while it settles; when you stop, the settled transcript sends (or lands in the input
  // if Claude is mid-turn, so nothing spoken is ever lost). A blocked or unsupported mic says so.
  const [voiceOn, setVoiceOn] = useState(false); // true whenever the mic is capturing (held or locked)
  const [locked, setLocked] = useState(false); // hands-free: capturing with no finger down
  const [heardText, setHeardText] = useState(""); // live tentative transcript, shown while listening
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const engagedRef = useRef(false); // mic is capturing (survives async gaps); mirrors voiceOn
  const lockedRef = useRef(false); // hands-free lock (survives async gaps); mirrors locked
  const pressStartRef = useRef(0); // when the press began, to tell a tap from a hold
  const heardRef = useRef(""); // newest full transcript, read on stop (state lags a frame)
  const sendOnEndRef = useRef(false); // stop requested a send once recognition flushes
  const barsRef = useRef<HTMLElement[]>([]); // the 28 waveform bars, driven imperatively per frame
  const audioRef = useRef<{ ctx: AudioContext; stream: MediaStream; raf: number } | null>(null);
  const TAP_MS = 350; // press shorter than this = a tap (locks hands-free); longer = push-to-talk
  // Which engine + model drives the operator — Claude (Opus/Sonnet/Haiku) or Codex (OpenAI). A
  // persisted founder preference; the composer bar reads the model and its engine from it.
  const [model, setModel] = useState<string>(() =>
    (typeof localStorage !== "undefined" && localStorage.getItem("gtm.model")) || DEFAULT_MODEL);
  const pickModel = (id: string) => { setModel(id); try { localStorage.setItem("gtm.model", id); } catch { /* private mode */ } };
  const engineName = modelById(model).agent === "codex" ? "Codex" : "Claude";
  const timelineRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Tear down the live audio graph and animation frame; the mic tracks are released so the OS
  // indicator goes dark. Idempotent — safe to call from release, error, and unmount.
  const teardownAudio = () => {
    const a = audioRef.current;
    if (!a) return;
    audioRef.current = null;
    cancelAnimationFrame(a.raf);
    a.stream.getTracks().forEach((t) => t.stop());
    void a.ctx.close().catch(() => {});
    // Settle the bars back to rest so the next hold starts from flat, not a frozen shape.
    barsRef.current.forEach((bar) => { if (bar) bar.style.height = ""; });
  };

  // Begin listening: real mic amplitude drives the waveform, Web Speech dictates. Shared by tap and
  // hold — the press/release handlers below decide whether releasing locks (tap) or sends (hold).
  const startVoice = async () => {
    if (engagedRef.current) return;
    engagedRef.current = true;
    setVoiceError(null);
    setHeardText("");
    heardRef.current = "";
    setVoiceOn(true);
    // 1) Live amplitude — the honest waveform. Independent of recognition, so the bars move even in a
    //    browser with no dictation. A blocked mic throws here and we surface it plainly.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!engagedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; } // stopped mid-grant
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64; // 32 bins → enough spread across the 28 bars
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const bars = barsRef.current;
        for (let i = 0; i < bars.length; i++) {
          const v = data[i + 2] / 255; // skip the DC/low bins that swamp the low end
          const h = Math.max(10, Math.min(100, v * 140)); // floor so a bar never fully collapses
          if (bars[i]) bars[i].style.height = `${h.toFixed(1)}%`;
        }
        if (audioRef.current) audioRef.current.raf = requestAnimationFrame(tick);
      };
      audioRef.current = { ctx, stream, raf: requestAnimationFrame(tick) };
    } catch {
      setVoiceError("Microphone is blocked. Allow mic access to talk to Claude.");
      setVoiceOn(false);
      engagedRef.current = false;
      lockedRef.current = false;
      setLocked(false);
      return;
    }
    // 2) Dictation — separate from amplitude so the waveform still works where this is missing.
    const SR = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = SR.SpeechRecognition ?? SR.webkitSpeechRecognition;
    if (!Ctor) { setVoiceError("Voice typing isn't supported in this browser — the level meter still works."); return; }
    const r = new Ctor();
    r.continuous = true; r.interimResults = true; r.lang = "en-US";
    r.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      txt = txt.trim();
      heardRef.current = txt;
      setHeardText(txt);
    };
    r.onerror = () => {}; // a no-speech error is common and harmless; release still flushes what we have
    r.onend = () => {
      recognitionRef.current = null;
      if (sendOnEndRef.current) { sendOnEndRef.current = false; flushHeard(); }
    };
    recognitionRef.current = r;
    try { r.start(); } catch { /* a double-start throws; ignore */ }
  };

  // Stop listening and send. Recognition flushes a final result on stop, so we send from onend; with no
  // recognition at all we flush immediately with whatever the amplitude-only pass gathered.
  const stopVoice = () => {
    if (!engagedRef.current) return;
    engagedRef.current = false;
    lockedRef.current = false;
    setLocked(false);
    setVoiceOn(false);
    teardownAudio();
    const r = recognitionRef.current;
    if (r) { sendOnEndRef.current = true; try { r.stop(); } catch { flushHeard(); } }
    else { flushHeard(); }
  };

  // Finger (or key) goes down. A tap while already locked stops and sends; otherwise start listening
  // and remember when (the event's own timestamp), so release can tell a tap (→ lock hands-free) from a
  // hold (→ send). Using event time keeps this off the impure clock the render-purity lint forbids.
  const pressVoice = (ts: number) => {
    if (lockedRef.current) { stopVoice(); return; }
    if (engagedRef.current) return;
    pressStartRef.current = ts;
    void startVoice();
  };

  // Finger (or key) lifts. A quick press locks hands-free (keep listening); a real hold sends.
  const releaseVoice = (ts: number) => {
    if (!engagedRef.current || lockedRef.current) return;
    if (ts - pressStartRef.current < TAP_MS) { lockedRef.current = true; setLocked(true); }
    else stopVoice();
  };

  // Send the settled transcript — or, if Claude is mid-turn, drop it into the input so it's editable
  // and nothing spoken is lost.
  const flushHeard = () => {
    const text = heardRef.current.trim();
    heardRef.current = "";
    setHeardText("");
    if (!text) return;
    const nav = isNavCommand?.(text) ?? false;
    if (sendDisabled && !nav) { setInput((prev) => (prev ? prev + " " : "") + text); inputRef.current?.focus(); }
    else void sendText(text);
  };

  // Tear down recognition and audio if the dock unmounts mid-listen.
  useEffect(() => () => { recognitionRef.current?.stop(); teardownAudio(); }, []);

  // Follow the layout context across navigation: collapse to a pill when the dock starts floating
  // over the channel workbench, restore it when it owns its own lane again. Adjusting state during
  // render from a changed prop is React's sanctioned pattern — no effect, no cascading render.
  const [trackedFloating, setTrackedFloating] = useState(floating);
  if (trackedFloating !== floating) {
    setTrackedFloating(floating);
    setCollapsed(floating);
  }

  // Cold landing of an empty product: open the composer so its goal input is visible. Rising edge only
  // (React's sanctioned setState-during-render), so a founder who collapses it back keeps it collapsed.
  const [trackedStartOpen, setTrackedStartOpen] = useState(startOpen);
  if (startOpen !== trackedStartOpen) {
    setTrackedStartOpen(startOpen);
    if (startOpen) setCollapsed(false);
  }

  // A FINISHED session on the read-only overview (the dock is not floating over a channel there) rests
  // as a pill, so a completed transcript never covers the engine the founder came to see. The thread is
  // one click away on the peek bar. An ACTIVE session, or any session in the focused channel view,
  // behaves as before. Adjusting state during render from a changed prop is React's sanctioned pattern.
  const terminalOverview = !floating && !!session && TERMINAL.has(session.status);
  const [trackedTerminalOverview, setTrackedTerminalOverview] = useState(terminalOverview);
  if (terminalOverview !== trackedTerminalOverview) {
    setTrackedTerminalOverview(terminalOverview);
    if (terminalOverview) setCollapsed(true);
  }

  // When the host bumps focusSignal the founder has EXPLICITLY asked for the composer — stated a goal
  // from the empty canvas, handed Claude a node, started another pipeline. Every bump is a deliberate
  // user act (never an automatic on-completion signal), so always open the dock in the same render (so
  // the input is mounted) and focus it in an effect. This must override the rest-as-a-pill state a
  // finished session leaves behind: a terminal session auto-collapses on its own (above), but if an
  // explicit "state a goal" click were swallowed here the empty-canvas button would read as dead.
  const [trackedFocus, setTrackedFocus] = useState(focusSignal);
  if (focusSignal !== trackedFocus) {
    setTrackedFocus(focusSignal);
    setCollapsed(false);
  }
  useEffect(() => {
    if (focusSignal) inputRef.current?.focus();
  }, [focusSignal]);

  // A canvas-started message pre-fills the input, opens the dock, and focuses it — but is never sent for
  // the founder. Tracked by token so re-asking the same question re-seeds. setState-during-render is the
  // sanctioned pattern for a changed prop; the focus is a DOM call in an effect, not more state.
  const [trackedSeed, setTrackedSeed] = useState(seed?.token ?? 0);
  if (seed && seed.token !== trackedSeed) {
    setTrackedSeed(seed.token);
    setInput(seed.text);
    setCollapsed(false); // a seed is an explicit user act too — open over a finished session
  }
  useEffect(() => {
    if (seed?.token) inputRef.current?.focus();
  }, [seed?.token]);

  // Recede while a proposal stages onto the canvas; rise again once it's resolved. Adjusting state
  // during render from a changed prop is React's sanctioned pattern — no effect, no extra render.
  const [trackedRecede, setTrackedRecede] = useState(recede);
  if (recede !== trackedRecede) {
    setTrackedRecede(recede);
    setCollapsed(recede);
  }

  // A new per-card ideation ("+") is an explicit user act — open the dock so its candidate list is
  // visible, not buried on the edge rail. Keyed by source+target so a fresh ideation re-opens; the same
  // sanctioned setState-during-render pattern. Dismissing (key → "") never re-collapses on its own.
  const objectIdeationKey = objectIdeation ? `${objectIdeation.sourceId}|${objectIdeation.target}` : "";
  const [trackedObjectIdeation, setTrackedObjectIdeation] = useState(objectIdeationKey);
  if (objectIdeationKey !== trackedObjectIdeation) {
    setTrackedObjectIdeation(objectIdeationKey);
    if (objectIdeationKey) { setCollapsed(false); setPanelOpen(true); }
  }

  // Selecting a card on the object graph is the founder pointing at it — open the dock so the composer
  // BECOMES that card (its face pinned at the top) instead of staying a slim edge rail. Keyed by the
  // card's id so re-targeting to another card keeps it open; the same setState-during-render pattern.
  const subjectCardKey = subject?.detail ? subject.id : "";
  const [trackedSubjectCard, setTrackedSubjectCard] = useState(subjectCardKey);
  if (subjectCardKey !== trackedSubjectCard) {
    setTrackedSubjectCard(subjectCardKey);
    if (subjectCardKey) { setCollapsed(false); setPanelOpen(true); }
  }

  // The verb the send control performs on the selected object — an explicit founder override, kept only
  // while the SAME object stays selected. Changing (or clearing) the selection drops the override so the
  // verb re-derives from the new object's kind. setState-during-render on a changed prop, the sanctioned
  // pattern used throughout this dock.
  const [verbOverride, setVerbOverride] = useState<string | null>(null);
  const [trackedVerbSubject, setTrackedVerbSubject] = useState(subject?.id ?? "");
  if ((subject?.id ?? "") !== trackedVerbSubject) {
    setTrackedVerbSubject(subject?.id ?? "");
    setVerbOverride(null);
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

  // Ideate posture is a calm overlay on the same composer, never a separate mode. Undefined === build.
  const ideating = posture === "ideate";
  const sessionActive = !!session && !TERMINAL.has(session.status);
  const waitingGate = session?.status === "waiting_for_gate";
  const pendingGateId = session?.pendingGate?.nodeIds[0];
  // The agent is mid-thought — the input parks until it pauses for you.
  const sendDisabled = running || session?.status === "running" || session?.status === "ready" || waitingGate;
  const working = running || session?.status === "running";

  // A gate or a pending question is the founder's judgment moment — the one thing the slim rail must
  // not swallow. On its rising edge open the full panel so the decision is in front of them (the slim
  // rail still flags it in amber if they shrink back). Rising edge only, so a manual shrink sticks.
  const needsDecision = waitingGate || !!session?.pendingQuestion;
  const [trackedNeedsDecision, setTrackedNeedsDecision] = useState(needsDecision);
  if (needsDecision !== trackedNeedsDecision) {
    setTrackedNeedsDecision(needsDecision);
    if (needsDecision) { setCollapsed(false); setPanelOpen(true); }
  }

  // The run is the plan made live: the instant a build/run starts (rising edge), surface the roster —
  // open the full panel and the build room so the checklist is in front of the founder, striking off
  // step by step in lockstep with the canvas. Rising edge only, so a manual shrink mid-run sticks.
  const runLive = running && !!graph && graph.nodes.length > 0;
  const [trackedRunLive, setTrackedRunLive] = useState(runLive);
  if (runLive !== trackedRunLive) {
    setTrackedRunLive(runLive);
    if (runLive) { setCollapsed(false); setPanelOpen(true); setExpanded(true); }
  }

  // Ambiguous-goal sketches, read off the session through the one isolated seam. Held as local pick
  // state so choosing one fades the rest; a fresh set of candidates clears the pick.
  const candidates = sessionCandidates(session);
  const candidateSig = candidates.map((c) => c.id).join("|");
  const [pickedCandidateId, setPickedCandidateId] = useState<string | null>(null);
  const [trackedCandidateSig, setTrackedCandidateSig] = useState(candidateSig);
  if (candidateSig !== trackedCandidateSig) {
    setTrackedCandidateSig(candidateSig);
    setPickedCandidateId(null);
    // A fresh set of pipeline shapes is a decision to surface — open the full panel so they're
    // pickable, not buried behind the slim rail.
    if (candidateSig) { setCollapsed(false); setPanelOpen(true); }
  }
  // Announce a new set of candidates to the host exactly once (so it can ghost them on the canvas).
  // Guarded on the id signature so it fires per-set, not per-render.
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
    setCollapsed(false); setPanelOpen(true);
    // The founder's pick IS the act: build THIS shape via compose_and_run (it still stops at the
    // gate downstream). Prefer the host's dedicated builder; fall back to a concrete send so the
    // picker works standalone. This is the ONE place the build path is reached — a one-line swap if
    // main names the endpoint differently.
    if (onBuildCandidate) { void onBuildCandidate(candidate); return; }
    void onSend(`Build this pipeline — ${candidate.label}. ${candidate.rationale} Compose it and run it to my gate.`);
  };

  const sendText = async (raw: string) => {
    if (submitting) return;
    const value = raw.trim();
    if (!value) return;
    // A navigation command ("go to the gate") steers the canvas and never reaches Claude, so it's
    // allowed even while Claude is working. Any real turn still waits until Claude is free.
    const nav = isNavCommand?.(value) ?? false;
    if (sendDisabled && !nav) return;
    setSubmitting(true);
    setCollapsed(false); setPanelOpen(true); // sending opens the full conversation above the composer
    try { await onSend(value); setInput(""); }
    finally { setSubmitting(false); }
  };
  // The verb the send performs on the selected object (null in free chat). Derived deterministically
  // from the selection's kind + what's typed, unless the founder picked one from the change menu.
  const verbKind = subject ? (subject.detail?.type ?? subject.kind) : "";
  const activeVerb = subject ? deriveVerb(verbKind, input, verbOverride) : null;
  // Send. A canvas navigation command ("go to the gate") must reach the host verbatim so it can steer
  // the camera, so it's never verb-framed — only a real turn about the selected object gets the verb.
  const send = () => {
    const nav = isNavCommand?.(input.trim()) ?? false;
    const value = activeVerb && !nav ? frameVerbMessage(activeVerb, input) : input;
    void sendText(value);
  };
  // Tapping an inline "your call" option drops its label into the reply (appending, so several can
  // stack), editable — the founder still presses send. The decision lives in the composer's one input,
  // never a second box on the ask.
  const askPick = (text: string) => {
    setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
    inputRef.current?.focus();
  };

  // The command composer — the product's primary input, built to rival a real chat composer: a calm
  // textarea over a control row (context on the left, the live model/state, a dark send on the right).
  // Enter sends, Shift+Enter newlines. Shared by the resting state and the active conversation so the
  // input never changes shape as you move between them.
  const composer = (
    <div className={`composer-box ${voiceOn ? "voice" : ""}`}>
      {/* The aurora — a faint monochrome graphite drift at rest; on voice it swells into the rainbow.
          aria-hidden: pure ambience, no semantics. */}
      <div className="composer-aurora" aria-hidden="true" />
      {/* Ideate posture — a quiet chip that names the register ("thinking, not building"). It rides
          above the input in both the resting and open dock so the founder always sees they're in the
          thinking posture; the × hands control back to the host to exit it. Calm, not a mode banner. */}
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
      {/* The attached composer — when the founder selects a block or edge on the canvas, the dock docks
          to it: it says what it's editing, shows the object's own words, and offers plain-English moves.
          Clicking a move drops its phrasing into the input (editable — it never sends on its own). The
          host frames the next message with this object's context, so "make it shorter" resolves to the
          real thing. The × lets go and returns to free chat. When a per-card ideation is running, the
          ideation block below carries the framing instead, so the two never stack on the same card.
          Object-graph cards (subject.detail set) render the full card face at the top of the dock
          instead — this lightweight header stays for node-graph steps, which carry no detail. */}
      {subject && !subject.detail && !objectIdeation ? (
        <div className="composer-attached">
          <div className="composer-attached-head">
            <span className="composer-attached-title">
              Claude <span aria-hidden="true">·</span> editing {humanizeKind(subject.kind)}
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
          <div className="composer-attached-actions">
            {subjectActions(subject.kind).map((action) => (
              <button
                key={action}
                type="button"
                className="composer-attached-action"
                onClick={() => { setInput(action); inputRef.current?.focus(); }}
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <textarea
        ref={inputRef}
        className="composer-box-input"
        aria-label="Message Claude"
        placeholder={subject ? `Ask Claude about “${subject.label}” — make it shorter, why it's empty, run it…` : sendDisabled ? "Claude is working — you can still say “go to …” to move the canvas" : ideating ? "Think through your GTM — who's the real buyer, where's the wedge, why now" : session ? "Reply, redirect, or ask Claude to continue…" : "Ask Claude to build, run, or change anything…"}
        value={input}
        disabled={submitting}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        rows={1}
      />
      {/* The waveform rises only while the mic is held. Each bar's height is driven imperatively from
          real microphone amplitude (see startVoice) — this is feedback, not decoration. */}
      <div className="composer-wave" aria-hidden="true">
        {Array.from({ length: 28 }).map((_, i) => (
          <i key={i} ref={(el) => { if (el) barsRef.current[i] = el; }} />
        ))}
      </div>
      {/* What Claude is hearing, tentative until it settles — clears on release. Sits under the wave so
          you can watch your words land before they send. */}
      {voiceOn && heardText ? (
        <div className="composer-heard" aria-live="polite">
          {heardText}<span className="composer-heard-caret" aria-hidden="true" />
        </div>
      ) : null}
      {voiceError ? <p className="composer-voice-error" role="status">{voiceError}</p> : null}
      <div className="composer-box-bar">
        <div className="composer-box-tools">
          <AgentPicker value={model} onChange={pickModel} />
          <span className="composer-box-model" title={sessionActive ? `${engineName} is on this outcome` : "The engine and model working this outcome"}>
            <span className={`composer-box-dot ${voiceOn ? "live" : sessionActive ? "live" : ""}`} />
            {voiceOn ? "Listening…" : working ? "Working…" : session ? statusLabel(session.status) : "Ready"}
          </span>
        </div>
        <div className="composer-box-actions">
          {/* Voice — TAP for hands-free (tap again to stop and send) or HOLD for push-to-talk (release
              to send). The rainbow erupts and the waveform tracks your real mic either way. Pointer
              capture guarantees release fires even if you drift off the button; Space/Enter mirror it. */}
          <button
            className={`composer-box-mic ${voiceOn ? "active" : ""} ${locked ? "locked" : ""}`}
            type="button"
            aria-label={locked ? "Listening hands-free — tap to stop and send" : "Tap or hold to talk to Claude"}
            aria-pressed={voiceOn}
            title={locked ? "Listening hands-free — tap to stop" : voiceOn ? "Listening… release to send" : "Tap for hands-free, or hold to talk"}
            onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pressVoice(e.timeStamp); }}
            onPointerUp={(e) => releaseVoice(e.timeStamp)}
            onPointerCancel={(e) => releaseVoice(e.timeStamp)}
            onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); pressVoice(e.timeStamp); } }}
            onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); releaseVoice(e.timeStamp); } }}
            onBlur={() => { if (!lockedRef.current) stopVoice(); }}
          >
            <Mic size={16} />
          </button>
          {activeVerb ? (
            /* A canvas object is selected: the send names the action it performs on it, and it's
               changeable. A non-"ask" verb can send with an empty input (the verb IS the instruction);
               "ask" and free chat still need typed text. */
            <VerbSend
              verb={activeVerb}
              submitting={submitting}
              disabled={
                submitting
                || (sendDisabled && !(isNavCommand?.(input.trim()) ?? false))
                || (!input.trim() && activeVerb.id === "ask")
              }
              onSend={() => void send()}
              onPick={setVerbOverride}
            />
          ) : (
            <button
              className="composer-box-send"
              disabled={submitting || !input.trim() || (sendDisabled && !(isNavCommand?.(input.trim()) ?? false))}
              onClick={() => void send()}
              type="button"
              aria-label="Send to Claude"
            >
              {submitting ? <LoaderCircle className="spin" /> : <ArrowUp size={18} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Collapsed. When the dock owns a lane (docked, the canvas usage), it shrinks to a SLIM EDGE RAIL with
  // a launcher — out of the content area, never a panel over the board. The canvas reclaims the width.
  if (collapsed) {
    if (!floating) {
      return (
        <aside className="composer-dock docked collapsed" aria-label="Claude co-pilot">
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
    // Floating resting = the composer alone, centered on the canvas (the command line). The conversation
    // only rises above it once you send or open a live session — minimizing (the header X) returns here.
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

  // ── The slim input rail — the DOCKED default ──────────────────────────────────────────────────
  // A single talk-to-Claude input, a minimal status line, and a one-line peek at what Claude is doing
  // (or an amber "your call" flag when it's waiting on you). Far less width than the full column, so
  // the canvas breathes. The ⤢ handle — or any attention moment above — opens the full panel. Floating
  // keeps its own model (handled below), so this rail is docked-only.
  if (!floating && !panelOpen) {
    const latestBeat = session?.events.at(-1)?.title;
    const slimLine = working ? "Claude is working…" : session ? (latestBeat ?? `Claude · ${statusLabel(session.status)}`) : null;
    return (
      <aside className="composer-dock docked slim" aria-label="Claude co-pilot">
        <div className="dock-slim-head">
          <span className={`dock-slim-orb ${working ? "live" : ""}`} aria-hidden="true">
            {working ? <LoaderCircle className="spin" /> : <Bot size={15} />}
          </span>
          <div className="dock-slim-id">
            <strong>Claude</strong>
            <span className="dock-slim-sub">{session ? statusLabel(session.status) : "co-pilot"}</span>
          </div>
          {sessionActive ? (
            <button className="composer-dock-stop" onClick={() => void onCancel()} type="button" title="Stop" aria-label="Stop Claude">
              <Square />
            </button>
          ) : null}
          <button className="composer-dock-icon" onClick={() => setPanelOpen(true)} type="button" title="Open the conversation" aria-label="Open the full conversation">
            <Maximize2 size={15} />
          </button>
          <button className="composer-dock-icon" onClick={() => setCollapsed(true)} type="button" title="Minimize" aria-label="Minimize the panel">
            <X size={16} />
          </button>
        </div>
        {/* The one amber moment in the rail — your judgment is required. Everything else stays monochrome. */}
        {needsDecision ? (
          <button className="dock-slim-gate" type="button" onClick={() => setPanelOpen(true)}>
            <ShieldCheck size={14} aria-hidden="true" />
            <span>{waitingGate ? "Your review is required" : "Your call — Claude is waiting"}</span>
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        ) : slimLine ? (
          <button className="dock-slim-peek" type="button" onClick={() => setPanelOpen(true)} title="Open the conversation">
            <span className={`dock-slim-peek-dot ${working ? "live" : ""}`} aria-hidden="true" />
            <span className="dock-slim-peek-text">{slimLine}</span>
            <Maximize2 size={12} aria-hidden="true" />
          </button>
        ) : null}
        {composer}
      </aside>
    );
  }

  // The build room: when the dock is expanded and a real graph exists, the right zone shows it
  // assembling in canvas-card language while the conversation stays on the left.
  const buildRoom = expanded && !!graph && graph.nodes.length > 0;

  return (
    <aside className={`composer-dock ${floating ? "floating" : "docked"} ${expanded ? "expanded" : ""} ${buildRoom ? "buildroom" : ""}`} aria-label="Claude co-pilot">
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
        {/* A second pipeline is always one click away. When the founder already has two or more, the
            full tab strip below the header carries the "+"; here it's the discovery affordance for the
            first-and-second, so multi-pipeline never stays hidden behind having to already have two. */}
        {onNewChat && roster.length < 2 ? (
          <button className="composer-dock-icon" onClick={onNewChat} type="button" title="Start another pipeline" aria-label="Start another pipeline">
            <Plus size={15} />
          </button>
        ) : null}
        {sessionActive && (
          <button className="composer-dock-stop" onClick={() => void onCancel()} type="button" title="Stop" aria-label="Stop Claude">
            <Square />
          </button>
        )}
        <button className="composer-dock-icon" onClick={() => setExpanded((v) => !v)} type="button" title={expanded ? "Shrink" : "Expand"} aria-label={expanded ? "Shrink the panel" : "Expand the panel"} aria-pressed={expanded}>
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button
          className="composer-dock-icon"
          onClick={() => { if (floating) setCollapsed(true); else setPanelOpen(false); }}
          type="button"
          title={floating ? "Minimize" : "Collapse to the input rail"}
          aria-label={floating ? "Minimize the panel" : "Collapse to the input rail"}
        >
          <X size={16} />
        </button>
      </header>

      {/* ── The pipelines you're running, as tabs. Only once there are two or more — a single pipeline
          needs no strip (its name is already in the header), and the "+" lives up there until then. */}
      {roster.length >= 2 && onSwitchSession ? (
        <ChatTabs roster={roster} activeId={activeSessionId} onSwitch={onSwitchSession} onNew={onNewChat} />
      ) : null}

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

      {/* ── The card face — a selected object-graph card, pinned at the top: the composer BECOMES that
          card. Its conversation / ideation / input scope to it below. Node-graph steps carry no detail
          and keep the lightweight header above the input instead. */}
      {subject?.detail ? (
        <SubjectCardFace
          detail={subject.detail}
          onClose={onClearSubject}
          onAction={(action) => { setInput(action); inputRef.current?.focus(); }}
          onRelated={(rel) => onRetargetSubject?.(rel)}
        />
      ) : null}

      {/* ── Conversation / narration (left) + build room (right when expanded) ── */}
      <div className={`composer-dock-body ${buildRoom ? "split" : ""}`}>
      <div
        key={session ? "thread" : "idle"}
        className="composer-dock-timeline view-enter"
        ref={timelineRef}
        role="log"
        aria-label="Conversation with Claude"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {!session ? (
          <div className="composer-dock-idle">
            <p className="composer-idle-lead">Tell Claude the outcome you want. It composes the agents that chase it, runs them, and stops at your gate.</p>
            <div className="composer-idle-starters">
              {STARTERS.map((s) => (
                <button key={s} className="composer-idle-starter" onClick={() => setInput(s)} type="button">{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <Stagger className="cnv-thread">
            {/* The whole conversation in one stream — including the "your call" ask, folded in as just
                another message (its tap options land inline), never lifted out into a separate box. */}
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
                    {onPin ? <PinControl text={(seg.event.detail ?? seg.event.title).trim()} onPin={onPin} /> : null}
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
                      <span className="cnv-ask-eyebrow">Your call</span>
                      <strong>{stripOptions(seg.event.title) || seg.event.title}</strong>
                      {seg.event.detail ? <div className="cnv-ask-detail"><MarkdownLite text={seg.event.detail} /></div> : null}
                      {/* The choices, tappable — each drops into the reply below, editable, never a bare
                          fire. Parsed from the ask's own text; open-ended asks show none and you just type. */}
                      {(() => {
                        const opts = parseAskOptions(seg.event.title).length ? parseAskOptions(seg.event.title) : parseAskOptions(seg.event.detail ?? "");
                        return opts.length ? (
                          <div className="dock-decide-opts">
                            {opts.map((o, i) => (
                              <button type="button" key={i} className="dock-decide-opt" onClick={() => askPick(o.label)}>
                                <span className="dock-decide-opt-t">{o.label}</span>
                                <Plus className="dock-decide-add" size={13} aria-hidden="true" />
                              </button>
                            ))}
                          </div>
                        ) : null;
                      })()}
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
        {buildRoom && graph ? (
          <BuildRail graph={graph} runningNodeId={runningNodeId} proposedNodeIds={proposedNodeIds} result={result} />
        ) : null}
      </div>

      {/* ── Per-card ideation — the on-card "+" hands back candidate OBJECTS (a message, a trigger) to
          add as draft cards. Decidable, never auto-applied; adding one lands a gray draft joined to its
          source. Hidden while a gate is waiting so the two decisions never collide. */}
      {objectIdeation && !waitingGate && onAddObjectCandidate ? (
        <ObjectIdeationChoices
          ideation={objectIdeation}
          onAdd={onAddObjectCandidate}
          onDismiss={() => onDismissObjectIdeation?.()}
        />
      ) : null}

      {/* ── Candidate sketches — an ambiguous goal returns a few shapes to pick from, not a stall.
          Distinct from the gate below: no amber, no approve gesture — choosing a shape is a direction,
          not an approval to send. Hidden while a gate is waiting so the two decisions never collide. */}
      {candidates.length > 0 && !waitingGate ? (
        <CandidateChoices candidates={candidates} pickedId={pickedCandidateId} onPick={buildCandidate} />
      ) : null}

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

      {/* The founder's call is no longer a separate hero card — it rides in the thread as an inline
          "Your call" ask with tap options (see the ask segment above), same as any other message. */}
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
