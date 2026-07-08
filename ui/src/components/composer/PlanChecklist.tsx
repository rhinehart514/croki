// The plan before it runs — the shape the founder picked, stamped with the crew that will run it. Each
// step is a row: the teammate's face (or the capability's mark), its role as an eyebrow, the step in
// plain words, and a state word that binds to the live run — waiting until the step starts, working
// while it runs, done the moment it lands. It ends at the amber gate row: the one step that's the
// founder's. "Run to my gate" builds and runs up to that line; "Change it" reopens the shape. Editing a
// single step is one hover away.
//
// It wears the shared .composer-card2 frame, the same frame the embodied idea flow wears, so an idea set
// and a plan read as siblings in the stream. Row state derives purely from the streamed run via the same
// rosterState binding the canvas uses — never fabricated progress.

import { Check, ListChecks, Pencil, Play, Shield } from "lucide-react";
import { RosterTile } from "./RosterTile";
import { agentPersona } from "@/lib/agentPersona";
import { CAPABILITIES } from "@/lib/capabilities";
import { rosterState, type RosterState } from "@/lib/rosterState";
import type { GTMGraph, GTMNode, GTMRunResult } from "@/types";
import "@/styles/composer-embodied.css";

// The plan's steps in reading order: context/resource reference nodes drop out; the gate stays (it's the
// founder's row). Top-down by canvas position — the same order the overview canvas uses.
function planNodes(nodes: GTMNode[]): GTMNode[] {
  return [...nodes]
    .filter((n) => n.category !== "context" && n.category !== "resource")
    .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
}

// A step's identity in founder words: a teammate reads as its role, a capability as its brand name.
function eyebrowOf(node: GTMNode): string {
  if (node.ref) return agentPersona(node.ref, node.label ?? node.agentPrompt).role;
  if (node.connector) {
    const cap = CAPABILITIES.find((c) => c.id === node.connector);
    if (cap) return cap.name;
  }
  return "Step";
}

// The state word, from the row's live binding. A pre-run plan (nothing running, no results yet) reads
// its next step as "ready" and the rest as "waiting"; once the run streams, rows advance on real events.
function stateWord(state: RosterState, readyNext: boolean): string {
  switch (state) {
    case "working": return "working";
    case "done": return "done";
    case "stuck": return "needs a look";
    case "gate": return "your call";
    case "ghost": return "proposed";
    default: return readyNext ? "ready" : "waiting";
  }
}

function PlanRow({ node, state, readyNext, onEdit }: {
  node: GTMNode;
  state: RosterState;
  readyNext: boolean;
  onEdit?: (node: GTMNode) => void;
}) {
  const isGate = node.category === "gate";
  if (isGate) {
    return (
      <div className="pc-row gate">
        <span className="pc-gate-ico" aria-hidden="true"><Shield size={14} /></span>
        <span className="pc-body">
          <span className="pc-eye">{eyebrowOfGate(node)}</span>
          <span className="pc-nm">{node.label}</span>
        </span>
      </div>
    );
  }
  const done = state === "done";
  return (
    <div className={`pc-row ${done ? "ok" : ""} ${state === "working" ? "live" : ""}`}>
      <span className="pc-tick" aria-hidden="true">
        {done ? <Check size={9} strokeWidth={3.5} /> : null}
      </span>
      <RosterTile node={node} size="xs" state={state === "working" ? "working" : "idle"} />
      <span className="pc-body">
        <span className="pc-eye">{eyebrowOf(node)}</span>
        <span className="pc-nm">{node.label}</span>
      </span>
      {onEdit ? (
        <button
          className="pc-edit"
          type="button"
          title={`Edit "${node.label}"`}
          aria-label={`Edit ${node.label}`}
          onClick={() => onEdit(node)}
        >
          <Pencil size={12} aria-hidden="true" />
        </button>
      ) : null}
      <span className="pc-st">{stateWord(state, readyNext)}</span>
    </div>
  );
}

// The gate row's eyebrow names the outbound it guards ("Your gate · Gmail") when the graph declares one.
function eyebrowOfGate(node: GTMNode): string {
  const via = typeof node.config?.via === "string" ? node.config.via
    : node.connector ? node.connector : null;
  const cap = via ? CAPABILITIES.find((c) => c.id === via) : null;
  return cap ? `Your gate · ${cap.name}` : "Your gate";
}

export function PlanChecklist({
  nodes,
  title = "Here's the plan",
  subtitle = "Edit any step before it runs — or tell me to change it. Nothing sends until your gate.",
  runningNodeId = null,
  result = null,
  proposedNodeIds = null,
  onRun,
  onChange,
  onEditStep,
  runLabel = "Run to my gate",
  note = "or keep typing below",
}: {
  // The composed plan. A whole GTMGraph is accepted too — its nodes are read off.
  nodes: GTMNode[] | GTMGraph;
  title?: string;
  subtitle?: string;
  runningNodeId?: string | null;
  result?: GTMRunResult | null;
  proposedNodeIds?: Set<string> | null;
  onRun?: () => void;
  onChange?: () => void;
  onEditStep?: (node: GTMNode) => void;
  runLabel?: string;
  note?: string;
}) {
  const raw = Array.isArray(nodes) ? nodes : nodes.nodes;
  const steps = planNodes(raw);
  // "Ready" belongs to the next-up step, and only before anything is running: once the run streams, the
  // row states carry the truth. The first non-gate, non-done step gets it.
  const notStarted = !runningNodeId && !result;
  const readyId = notStarted
    ? steps.find((n) => n.category !== "gate")?.id ?? null
    : null;

  return (
    <div className="composer-card2">
      <div className="composer-card2-h">
        <span className="composer-card2-hi" aria-hidden="true"><ListChecks size={15} /></span>
        <span className="composer-card2-ht">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </span>
      </div>

      <div className="pc-rows">
        {steps.map((n) => (
          <PlanRow
            key={n.id}
            node={n}
            state={rosterState(n, runningNodeId, result, proposedNodeIds?.has(n.id) ?? false)}
            readyNext={n.id === readyId}
            onEdit={n.category === "gate" ? undefined : onEditStep}
          />
        ))}
      </div>

      <div className="pc-foot">
        {onRun ? (
          <button className="pc-run" type="button" onClick={onRun}>
            <Play size={14} aria-hidden="true" fill="currentColor" stroke="none" /> {runLabel}
          </button>
        ) : null}
        {onChange ? (
          <button className="pc-ghost" type="button" onClick={onChange}>Change it</button>
        ) : null}
        {note ? <span className="pc-note">{note}</span> : null}
      </div>
    </div>
  );
}
