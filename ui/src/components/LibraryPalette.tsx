import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Bot, Check, FileCode2, Layers, Lock, Plus, Plug, Search, ShieldCheck, X, Zap,
} from "lucide-react";
import type {
  CapabilityServer, CapabilityTool,
  GtmLibrary, GTMGraph,
} from "@/types";
import { agentPersona, FAMILY_TINT } from "@/lib/agentPersona";
import { Button } from "@/components/ui/button";
import "@/styles/library-palette.css";

// LibraryPalette — the "+ Add step" picker, summoned from the command dock's "+". It is no longer a
// flat list of names: the moment you build a step, the decision is "which teammate is right HERE,"
// so the evidence that decides it lives IN the picker, not one click away in the profile.
//
// Two panes. Left: the compact roster (personalized agents born for THIS outcome first, then on-disk
// agents, then skills) — each row carries a fit dot you can scan. Right: a live dossier that tracks
// the highlighted row — what it accepts and delivers, whether it fits THIS spot in the open graph,
// how proven it is, whether it learns from your taste, its guardrail. You evaluate a teammate fully
// without leaving the picker or committing. Every field is REAL; nothing is invented (the honest
// asymmetry — a born teammate carries contracts/evals, a stock agent is lighter — is the point: it
// shows WHY you'd reach for a personalized one).
//
// Presentational: it owns only its own UI state (the filter, which row is highlighted). All data and
// callbacks arrive via props. Still a floating glass surface — the host positions it.

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

// Fit-at-this-slot — the killer microfeature. Compares what a teammate ACCEPTS against the fields the
// open graph already produces, so picking is wiring-aware instead of blind. Four honest states:
//   start   — accepts nothing; it self-sources and can be the first node in the flow.
//   fits    — everything it needs is already produced upstream.
//   needs   — some input isn't produced anywhere yet; names what's missing.
//   unknown — a stock agent whose contract we can't read until it's opened. Never faked as "fits".
type Fit =
  | { state: "start" }                                          // self-sources — can begin the flow
  | { state: "fits" }                                           // every input is produced upstream
  | { state: "partial"; ready: number; total: number; missing: string[] }  // some, not all
  | { state: "needs"; missing: string[] }                       // nothing it needs exists yet
  | { state: "unknown" };                                       // stock agent — contract unread

type Row = {
  key: string;
  kind: "agent" | "skill";
  ref: string;
  label: string;                 // the role name (agent) or skill name — the headline everywhere
  monogram?: string;             // the two-letter mark — derived with the SAME persona call as the role
  sub?: string;                  // the raw kebab ref, demoted under an agent's role name
  family?: import("@/lib/agentPersona").AgentFamily;
  job: string;                   // one-line: what it does
  // The dossier fields. Present only when we genuinely have them (a born instance); a stock agent or
  // skill carries the thin honest version and the panel degrades to match.
  personalized: boolean;
  version?: number;
  hasContract: boolean;          // do we know its I/O contract (a born instance) or not (stock)?
  accepts: string[];
  delivers: string[];
  proven: number;                // evaluations run for THIS teammate (real)
  guardrails: number;            // nevers + musts on its creation policy (real)
};

function fitOf(row: Row, available: Set<string>): Fit {
  if (row.kind === "skill") return { state: "unknown" };
  if (!row.hasContract) return { state: "unknown" };
  if (row.accepts.length === 0) return { state: "start" };
  const missing = row.accepts.filter((f) => !available.has(f));
  if (missing.length === 0) return { state: "fits" };
  if (missing.length < row.accepts.length) {
    return { state: "partial", ready: row.accepts.length - missing.length, total: row.accepts.length, missing };
  }
  return { state: "needs", missing };
}

function FitDot({ fit }: { fit: Fit }) {
  const title =
    fit.state === "fits" ? "Fits this slot"
      : fit.state === "start" ? "Self-sourcing — can start the flow"
        : fit.state === "partial" ? `${fit.ready} of ${fit.total} inputs ready here`
          : fit.state === "needs" ? `Needs ${fit.missing.join(", ")}`
            : "Contract unknown until opened";
  return <span className={`libp-fitdot ${fit.state}`} title={title} aria-label={title} />;
}

function Mark({ row, size = 22 }: { row: Row; size?: number }) {
  if (row.kind === "skill") {
    return <span className="libp-mark skill" style={{ width: size, height: size }}><Layers size={14} /></span>;
  }
  if (!row.family) {
    return <span className="libp-mark" style={{ width: size, height: size }}><Bot size={14} /></span>;
  }
  const tint = FAMILY_TINT[row.family];
  return (
    <span
      className="libp-mark mono"
      style={{ width: size, height: size, background: tint.bg, color: tint.fg }}
    >
      {row.monogram ?? agentPersona(row.ref).monogram}
    </span>
  );
}

function RosterRow({
  row, fit, active, onSelect, onAdd,
}: {
  row: Row;
  fit: Fit;
  active: boolean;
  onSelect: () => void;
  onAdd: () => void;
}) {
  return (
    <div
      className={`libp-row${active ? " libp-row-active" : ""}`}
      draggable
      onDragStart={(event) => {
        // Match the canvas drop handler's payload exactly (GraphCanvas handleDrop).
        event.dataTransfer.setData(
          "application/gtm-capability",
          JSON.stringify({ kind: row.kind, ref: row.ref, label: row.label }),
        );
        event.dataTransfer.effectAllowed = "copy";
      }}
      onMouseEnter={onSelect}
      onClick={onSelect}
    >
      <button className="libp-row-open" onClick={onSelect} type="button">
        <Mark row={row} />
        <span className="libp-row-text">
          <span className="libp-row-name">{row.label}</span>
          {row.sub ? <span className="libp-row-ref">{row.sub}</span> : null}
        </span>
        <FitDot fit={fit} />
      </button>
      <button
        className="libp-row-add"
        onClick={(e) => { e.stopPropagation(); onAdd(); }}
        type="button"
        aria-label={`Add ${row.label} to the canvas`}
        title="Add to the canvas"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

// A connected MCP tool as an addable step. No persona — its pick-time value IS its lane: a read
// tool runs free, a write tool drops behind a founder gate. One semantic button, the whole row.
function ToolRow({ serverId, tool, onAdd }: {
  serverId: string; tool: CapabilityTool; onAdd: (serverId: string, tool: CapabilityTool) => void;
}) {
  const gated = tool.effectiveClass === "write";
  return (
    <button
      className={`libp-toolrow ${gated ? "gated" : "free"}`}
      onClick={() => onAdd(serverId, tool)}
      type="button"
      title={tool.reason || (gated ? "Acts on the world — drops behind your gate" : "Read only — runs free")}
    >
      <span className="libp-tool-mark">{gated ? <Lock size={13} /> : <Check size={13} />}</span>
      <span className="libp-tool-name">{tool.name}</span>
      <span className="libp-tool-tag">{gated ? "gated" : "runs free"}</span>
      <span className="libp-tool-add"><Plus size={14} /></span>
    </button>
  );
}

// The peek — the value of the pick, made visible without committing. Tracks the highlighted row.
function PeekPanel({
  row, fit, onAdd, onOpen,
}: {
  row: Row | null;
  fit: Fit;
  onAdd: () => void;
  onOpen: () => void;
}) {
  if (!row) {
    return (
      <div className="libp-peek libp-peek-empty">
        <p>Highlight a teammate to see what it accepts, what it delivers, and whether it fits this spot.</p>
      </div>
    );
  }

  const eyebrow = row.kind === "skill"
    ? "Skill · runs on your subscription"
    : row.personalized
      ? `${row.family ?? "general"} · v${row.version ?? 1} · tuned to your taste`
      : "Library capability";

  return (
    <div className="libp-peek">
      <div className="libp-peek-head">
        <Mark row={row} size={34} />
        <div className="libp-peek-id">
          <div className="libp-peek-role">{row.label}</div>
          <div className="libp-peek-eyebrow">{eyebrow}</div>
        </div>
      </div>

      <p className="libp-peek-job">{row.job}</p>

      {/* Fit-at-this-slot — the hero line. Wiring-aware, computed from the open graph. */}
      <div className={`libp-fit ${fit.state}`}>
        {fit.state === "fits" ? <Check size={14} /> : fit.state === "start" ? <Zap size={14} /> : (fit.state === "needs" || fit.state === "partial") ? <ArrowRight size={14} /> : null}
        <span>
          {fit.state === "fits" && "Fits this slot — its inputs are already produced upstream."}
          {fit.state === "start" && "Self-sourcing — it can start the flow with no input."}
          {fit.state === "partial" && <><b>{fit.ready} of {fit.total}</b> inputs ready here — still needs <b>{fit.missing.join(", ")}</b>.</>}
          {fit.state === "needs" && <>Needs <b>{fit.missing.join(", ")}</b> — nothing upstream produces {fit.missing.length > 1 ? "them" : "it"} yet.</>}
          {fit.state === "unknown" && "Open it to read its input contract."}
        </span>
      </div>

      {row.hasContract ? (
        <div className="libp-contract">
          <div className="libp-contract-col">
            <div className="libp-contract-label">Accepts</div>
            {row.accepts.length
              ? row.accepts.map((c) => <span className="libp-chip" key={c}>{c}</span>)
              : <span className="libp-chip faint">nothing — self-sourcing</span>}
          </div>
          <div className="libp-contract-col">
            <div className="libp-contract-label">Delivers</div>
            {row.delivers.length
              ? row.delivers.map((c) => <span className="libp-chip" key={c}>{c}</span>)
              : <span className="libp-chip faint">not yet declared</span>}
          </div>
        </div>
      ) : null}

      <div className="libp-peek-foot">
        {row.kind === "agent" ? (
          <div className="libp-peek-sig">
            <span className="libp-peek-stat" title="Evaluations run for this teammate">
              {row.proven > 0 ? <><b>{row.proven}</b> run{row.proven === 1 ? "" : "s"}</> : "fresh — no runs yet"}
            </span>
            {row.personalized ? <span className="libp-peek-stat">learns at your gate</span> : null}
          </div>
        ) : null}
        <div className="libp-peek-rail"><ShieldCheck size={13} /> Never sends. Stops at your gate.</div>
      </div>

      <div className="libp-peek-actions">
        <Button onClick={onAdd} type="button">Put on the canvas</Button>
        <Button variant="outline" onClick={onOpen} type="button">
          <FileCode2 size={13} /> {row.kind === "agent" ? "Meet the teammate" : "Open source"}
        </Button>
      </div>
    </div>
  );
}

export function LibraryPalette({
  open, onClose, library, graph,
  capabilities, onAddCapability, onAddTool, onManageTools, onOpenArtifact, onNewArtifact,
}: {
  open: boolean;
  onClose: () => void;
  library: GtmLibrary | null;
  // The active graph these capabilities drop into — read to compute fit-at-this-slot.
  graph: GTMGraph | null;
  // The founder's connected MCP servers — their tools are capability too, listed here so the one
  // place you reach for capability holds tools alongside agents and skills.
  capabilities: CapabilityServer[];
  onAddCapability: (type: "agent" | "skill", ref: string, label: string) => void;
  onAddTool: (serverId: string, tool: CapabilityTool) => void;
  onManageTools: () => void;
  onOpenArtifact: (type: "agent" | "skill", ref: string) => void;
  onNewArtifact: (type: "agent" | "skill") => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // The fields the open graph already produces — the right side of every fit check.
  const available = useMemo(
    () => new Set((graph?.nodes ?? []).flatMap((n) => n.contract?.emits ?? [])),
    [graph],
  );

  const agentRows: Row[] = useMemo(
    () => (library?.agents ?? [])
      .filter((a) => isGtmCapability(a.ref))
      .map((a) => {
        const p = agentPersona(a.ref, a.description);
        return {
          key: `agent:${a.ref}`, kind: "agent" as const, ref: a.ref, label: p.role, monogram: p.monogram,
          family: p.family, sub: a.ref, job: a.description, personalized: false, hasContract: false,
          accepts: [], delivers: [], proven: 0, guardrails: 0,
        };
      }),
    [library],
  );

  const skillRows: Row[] = useMemo(
    () => (library?.skills ?? [])
      .filter((s) => isGtmCapability(s.name))
      .map((s) => ({
        key: `skill:${s.name}`, kind: "skill" as const, ref: s.name, label: s.name,
        job: s.description, personalized: false, hasContract: false,
        accepts: [], delivers: [], proven: 0, guardrails: 0,
      })),
    [library],
  );

  const matches = (row: Row) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return row.label.toLowerCase().includes(q)
      || row.job.toLowerCase().includes(q)
      || (row.sub ?? "").toLowerCase().includes(q);
  };
  const filteredAgents = agentRows.filter(matches);
  const filteredSkills = skillRows.filter(matches);

  // Connected MCP tools, grouped by server, filtered by the same query. Untrusted servers are
  // quarantined upstream (all-gated, no read lane) — they still list so the founder can act on them.
  const toolGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (capabilities ?? [])
      .map((server) => ({
        server,
        tools: [...server.read, ...server.write].filter(
          (t) => !q || t.name.toLowerCase().includes(q) || server.name.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.tools.length > 0);
  }, [capabilities, query]);

  // One flat ordered list across the three groups, so arrow keys + Enter drive the whole picker and
  // the peek can resolve the highlighted row regardless of which group it sits in.
  const flat = useMemo(
    () => [...filteredAgents, ...filteredSkills],
    [filteredAgents, filteredSkills],
  );

  // Reset the filter and selection the moment the picker is summoned — always opens clean, first row
  // selected, so the peek shows real value the instant it opens. React's adjust-during-render idiom.
  const [trackedOpen, setTrackedOpen] = useState(open);
  if (trackedOpen !== open) {
    setTrackedOpen(open);
    if (open) { setQuery(""); setActiveIndex(0); }
  }
  // Keep the highlight in range as the filter narrows — clamps to the last row (or 0 when empty).
  if (activeIndex > 0 && activeIndex > flat.length - 1) {
    setActiveIndex(flat.length === 0 ? 0 : flat.length - 1);
  }

  const activeRow = flat[activeIndex] ?? null;
  const activeFit = activeRow ? fitOf(activeRow, available) : { state: "unknown" as const };

  // Focusing the search input on open is a DOM call (not setState), so it stays in an effect.
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  // Escape closes; outside-click closes — the founder's expected ways out of a summoned popover.
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
  const openRow = (row: Row) => onOpenArtifact(row.kind, row.ref);

  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeRow) addRow(activeRow);
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
          <RosterRow
            key={row.key}
            row={row}
            fit={fitOf(row, available)}
            active={indexOf(row) === activeIndex}
            onSelect={() => setActiveIndex(indexOf(row))}
            onAdd={() => addRow(row)}
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

      <div className="libp-split">
        <div className="libp-list">
          {/* Your connected tools — capability you reach for, same as agents and skills. */}
          <div className="libp-group">
            <div className="libp-group-head">
              <span className="libp-group-label">Your tools</span>
              <button className="libp-group-new" onClick={onManageTools} type="button">
                <Plug size={12} /> Connect
              </button>
            </div>
            {toolGroups.length === 0 ? (
              <button className="libp-tool-empty" onClick={onManageTools} type="button">
                {query.trim() ? "No matching tools." : "Connect Clay, Drive, Gmail… to use their tools here."}
              </button>
            ) : (
              toolGroups.map(({ server, tools }) => (
                <div className="libp-tool-server" key={server.id}>
                  <div className="libp-tool-server-name">{server.name}</div>
                  {tools.map((tool) => (
                    <ToolRow key={`${server.id}/${tool.name}`} serverId={server.id} tool={tool} onAdd={onAddTool} />
                  ))}
                </div>
              ))
            )}
          </div>
          {renderGroup("Agents", filteredAgents, () => onNewArtifact("agent"), "New agent")}
          {renderGroup("Skills", filteredSkills, () => onNewArtifact("skill"), "New skill")}
          <button className="libp-manage-tools" onClick={onManageTools} type="button">
            <Plug size={12} /> Manage connected tools <ArrowRight size={12} />
          </button>
        </div>
        <PeekPanel
          row={activeRow}
          fit={activeFit}
          onAdd={() => activeRow && addRow(activeRow)}
          onOpen={() => activeRow && openRow(activeRow)}
        />
      </div>

      <div className="libp-foot">
        {graph
          ? <>Drag onto the canvas, or press <kbd className="libp-kbd">Enter</kbd> to add the highlighted teammate.</>
          : <>Open a workflow to drop a capability onto its canvas.</>}
      </div>
    </div>
  );
}
