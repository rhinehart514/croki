import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Layers, Plus, Search, X } from "lucide-react";
import type { AgentInstance, GtmLibrary, GTMGraph } from "@/types";
import "@/styles/library-palette.css";

// LibraryPalette — the summoned "+ Add step" popover that replaces the left-rail Library. The founder
// opens it from the canvas, picks a capability, and it lands on the graph. Three groups, in the order
// the founder reaches for them: the personalized agents born FOR this outcome first, then the on-disk
// Agents, then Skills. Every row is draggable (the same payload the canvas drop handler reads) and
// carries a +Add button for the click-to-add path; a row's name opens its file for editing.
//
// This is a floating glass surface, so it follows the glass recipe. It is presentational: it owns only
// its open/close-adjacent UI state (the search filter and which row has keyboard focus). All data and
// callbacks arrive via props.

// The same scoping the rail used — hide the founder's personal/meta toolbox so a GTM user never sees
// design-critic or status next to their outreach agents. Kept local and explicit so it stays easy to
// adjust; it never hides a gtm-* ref or a personalized outcome agent.
const PERSONAL_TOOLBOX = new Set([
  "assets", "build-flow", "crucible", "prompt-translate", "status", "improve-prompt",
  "deep-research", "claude-api", "update-config", "keybindings-help", "fewer-permission-prompts",
  "verify", "code-review", "simplify", "loop", "schedule", "init", "review", "security-review",
]);
function isGtmCapability(ref: string): boolean {
  const r = String(ref).toLowerCase();
  if (r.startsWith("design") || r.startsWith("stochastic")) return false;
  return !PERSONAL_TOOLBOX.has(r);
}

type Row = {
  key: string;
  kind: "agent" | "skill";
  ref: string;
  label: string;
  meta?: string;
  description?: string;
};

function CapabilityRow({
  row, active, onAdd, onOpen, onHover,
}: {
  row: Row;
  active: boolean;
  onAdd: () => void;
  onOpen: () => void;
  onHover: () => void;
}) {
  return (
    <div
      className={`libp-row${active ? " libp-row-active" : ""}`}
      draggable
      onDragStart={(event) => {
        // Match the canvas drop handler's payload exactly (GraphCanvas handleDrop): the dataTransfer
        // type and the { kind, ref, label } shape, so a drag from here lands identically to a drag
        // from the old rail.
        event.dataTransfer.setData(
          "application/gtm-capability",
          JSON.stringify({ kind: row.kind, ref: row.ref, label: row.label }),
        );
        event.dataTransfer.effectAllowed = "copy";
      }}
      onMouseEnter={onHover}
      title={row.description}
    >
      <button className="libp-row-open" onClick={onOpen} type="button">
        <span className="libp-row-icon">
          {row.kind === "agent" ? <Bot size={14} /> : <Layers size={14} />}
        </span>
        <span className="libp-row-text">
          <span className="libp-row-name">{row.label}</span>
          {row.description ? <span className="libp-row-desc">{row.description}</span> : null}
        </span>
        {row.meta ? <span className="libp-row-meta">{row.meta}</span> : null}
      </button>
      <button
        className="libp-row-add"
        onClick={onAdd}
        type="button"
        aria-label={`Add ${row.label} to the canvas`}
        title="Add to the canvas"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export function LibraryPalette({
  open, onClose, library, agentInstances, graph,
  onAddCapability, onOpenArtifact, onNewArtifact,
}: {
  open: boolean;
  onClose: () => void;
  library: GtmLibrary | null;
  agentInstances: AgentInstance[];
  // The active graph these capabilities drop into. Present here means the palette is summoned from a
  // real canvas; it is part of the contract even though the rows themselves only need it to exist.
  graph: GTMGraph | null;
  onAddCapability: (type: "agent" | "skill", ref: string, label: string) => void;
  onOpenArtifact: (type: "agent" | "skill", ref: string) => void;
  onNewArtifact: (type: "agent" | "skill") => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // The personalized agents born for the outcome whose graph is open — they lead, since the founder
  // built them for exactly this job. AgentInstance has no channel/graph link we can read off GTMGraph
  // here, so the caller passes the outcome's instances already; we only de-noise retired ones.
  const outcomeRows: Row[] = useMemo(
    () => agentInstances
      .filter((instance) => instance.status !== "retired")
      .map((instance) => ({
        key: `outcome:${instance.id}`,
        kind: "agent" as const,
        ref: instance.ref,
        label: instance.ref,
        meta: `v${instance.version}`,
        description: instance.job,
      })),
    [agentInstances],
  );

  const agentRows: Row[] = useMemo(
    () => (library?.agents ?? [])
      .filter((a) => isGtmCapability(a.ref))
      .map((a) => ({ key: `agent:${a.ref}`, kind: "agent" as const, ref: a.ref, label: a.ref, description: a.description })),
    [library],
  );

  const skillRows: Row[] = useMemo(
    () => (library?.skills ?? [])
      .filter((s) => isGtmCapability(s.name))
      .map((s) => ({ key: `skill:${s.name}`, kind: "skill" as const, ref: s.name, label: s.name, description: s.description })),
    [library],
  );

  const matches = (row: Row) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return row.label.toLowerCase().includes(q) || (row.description ?? "").toLowerCase().includes(q);
  };
  const filteredOutcome = outcomeRows.filter(matches);
  const filteredAgents = agentRows.filter(matches);
  const filteredSkills = skillRows.filter(matches);

  // One flat ordered list across the three groups, so arrow keys + Enter can drive the whole palette
  // regardless of which group a row sits in.
  const flat = useMemo(
    () => [...filteredOutcome, ...filteredAgents, ...filteredSkills],
    [filteredOutcome, filteredAgents, filteredSkills],
  );

  // Reset the filter and selection the moment the palette is summoned, so it always opens clean.
  // React's sanctioned adjust-state-during-render pattern (the same trackedX idiom this codebase uses
  // in ProgramCanvas/ComposerDock) — no effect, no cascading render, no setState-in-effect lint error.
  const [trackedOpen, setTrackedOpen] = useState(open);
  if (trackedOpen !== open) {
    setTrackedOpen(open);
    if (open) { setQuery(""); setActiveIndex(0); }
  }
  // Keep the active row in range as the filter narrows the list — again adjusted during render, not in
  // an effect. Clamps to the last row (or 0 when empty) without a synchronous setState side effect.
  if (activeIndex > 0 && activeIndex > flat.length - 1) {
    setActiveIndex(flat.length === 0 ? 0 : flat.length - 1);
  }

  // Focusing the search input on open is a DOM call (not setState), so it stays in an effect.
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  // Escape closes; outside-click closes. Both are the founder's expected ways out of a summoned popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    };
    const onPointer = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, onClose]);

  if (!open) return null;

  const addRow = (row: Row) => onAddCapability(row.kind, row.ref, row.label);

  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = flat[activeIndex];
      if (row) addRow(row);
    }
  };

  const indexOf = (row: Row) => flat.findIndex((r) => r.key === row.key);

  const renderGroup = (label: string, rows: Row[], onNew?: () => void, newLabel?: string) => (
    <div className="libp-group">
      <div className="libp-group-head">
        <span className="libp-group-label">{label}</span>
        {onNew ? (
          <button className="libp-group-new" onClick={onNew} type="button">
            <Plus size={12} /> {newLabel}
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="libp-empty">{query.trim() ? "No matches." : "Nothing here yet."}</p>
      ) : (
        rows.map((row) => (
          <CapabilityRow
            key={row.key}
            row={row}
            active={indexOf(row) === activeIndex}
            onAdd={() => addRow(row)}
            onOpen={() => onOpenArtifact(row.kind, row.ref)}
            onHover={() => setActiveIndex(indexOf(row))}
          />
        ))
      )}
    </div>
  );

  return (
    <div
      className="libp-panel"
      ref={panelRef}
      role="dialog"
      aria-label="Add a capability to the canvas"
    >
      <div className="libp-head">
        <div className="libp-search">
          <Search size={14} className="libp-search-icon" />
          <input
            ref={searchRef}
            className="libp-search-input"
            type="text"
            value={query}
            placeholder="Add an agent or skill…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKey}
            aria-label="Filter capabilities"
          />
        </div>
        <button className="libp-close" onClick={onClose} type="button" aria-label="Close">
          <X size={15} />
        </button>
      </div>

      <div className="libp-body">
        {filteredOutcome.length > 0 ? renderGroup("For this outcome", filteredOutcome) : null}
        {renderGroup("Agents", filteredAgents, () => onNewArtifact("agent"), "New agent")}
        {renderGroup("Skills", filteredSkills, () => onNewArtifact("skill"), "New skill")}
      </div>

      <div className="libp-foot">
        {graph
          ? <>Drag onto the canvas, or press <kbd className="libp-kbd">Enter</kbd> to add the highlighted step.</>
          : <>Open a workflow to drop a capability onto its canvas.</>}
      </div>
    </div>
  );
}
