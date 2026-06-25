import { useState } from "react";
import {
  AlertTriangle, ArrowRight, ChevronDown, ChevronRight, ChevronLeft,
  Bot, Sparkles, ListChecks, Plus, History, Layers, ShieldCheck,
} from "lucide-react";
import type {
  AgentInstance, ChannelMeta, ContextManifest, EngineState,
  GTMGraph, GTMRunResult, GtmLibrary, OutcomeProgram,
} from "@/types";
import type { ProgramCanvasMode, DebugTab } from "@/components/ProgramCanvas";
import { statusLabel, statusTone } from "@/lib/status";

// The explorer dot color follows the shared status tone, so an outcome's state reads the same here as
// on its canvas pill.
const TONE_DOT: Record<string, string> = {
  good: "var(--proven)",
  active: "var(--proven)",
  waiting: "var(--gap)",
  bad: "var(--danger)",
  idle: "var(--ghost)",
};

// The Explorer — the left rail of the IDE shell, built like a code editor's file tree. ONE primary
// object lives in the tree: Outcomes (the "files" — each outcome is one thing you're going for, with
// its editable system underneath). Everything else is a summonable panel, not a peer in the tree:
// Library (the agents and skills you can reach for), Problems (what's wrong, with a count), and Runs
// (what has happened). Capabilities, policies, learning, context, and the debugger are NOT rail peers
// — they open from inside an outcome (an agent's rules show in its editor; learning and context show
// inside a run or outcome detail). When there are zero outcomes, the Outcomes section is the first-run
// call to action itself.

function Section({
  icon, title, count, defaultOpen = false, children,
}: {
  icon: React.ReactNode; title: string; count?: number | string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="explorer-section">
      <button className="explorer-section-head" onClick={() => setOpen((v) => !v)} type="button">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {icon}
        <span className="explorer-section-title">{title}</span>
        {count !== undefined ? <span className="rail-count">{count}</span> : null}
      </button>
      {open ? <div className="explorer-section-body">{children}</div> : null}
    </div>
  );
}

type ExplorerView = "projects" | "understand" | "opportunities" | "channels" | "canvas";

export function GtmExplorer({
  channels, activeChannelId, activeProgramId, currentView, onOpenChannel, onOpenProgram, onFocusProgram, onNewProgram,
  onOpenArtifact, onNewArtifact, onOpenView, library, programs, agentInstances,
  runs, contextManifest, engine, graph, onJumpToNode,
}: {
  channels: ChannelMeta[];
  activeChannelId: string | null;
  activeProgramId: string | null;
  currentView: ExplorerView;
  onOpenChannel: (id: string) => void;
  onOpenProgram: (id: string) => void;
  // Deep-link a program-scoped explorer row (run) into the canvas, landing on the right
  // mode/run/debug-tab instead of dead-ending.
  onFocusProgram: (programId: string, focus: { mode?: ProgramCanvasMode; run?: GTMRunResult; debugTab?: DebugTab }) => void;
  onNewProgram: () => void;
  onOpenArtifact: (type: "agent" | "skill", ref: string) => void;
  onNewArtifact: (type: "agent" | "skill") => void;
  onOpenView: (view: ExplorerView) => void;
  library: GtmLibrary | null;
  programs: OutcomeProgram[];
  agentInstances: AgentInstance[];
  runs: GTMRunResult[];
  contextManifest: ContextManifest | null;
  engine: EngineState | null;
  graph: GTMGraph | null;
  onJumpToNode: (nodeId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const problems = (graph?.nodes.length === 0) ? [] : engine?.investigations ?? [];
  // Some subsystems (learn) have no node of their own — route to the gate, where founder
  // decisions are recorded, so a problem never dead-ends without a place to act.
  const ROUTE_FALLBACK: Record<string, string> = { learn: "gate" };
  const nodeForSubsystem = (subsystem: string) =>
    graph?.nodes.find((n) => n.category === subsystem)
    ?? (ROUTE_FALLBACK[subsystem] ? graph?.nodes.find((n) => n.category === ROUTE_FALLBACK[subsystem]) : null)
    ?? null;
  // Same health bands as the canvas node badge, so the rail's figure reads identically.
  const healthHex = (health: number) =>
    health < 50 ? "#dc2626" : health < 70 ? "#d97706" : health < 85 ? "#ca8a04" : "#16a34a";

  // The active outcome's per-agent set, so the Library highlights the agents this outcome actually
  // uses (the personalized capabilities born for it) above the product-wide on-disk library.
  const activeProgram = programs.find((program) => program.id === activeProgramId) ?? null;
  const outcomeAgents = activeProgram
    ? agentInstances.filter((instance) => instance.programId === activeProgram.id)
    : [];

  // Pending founder approvals across the whole product — the safety spine, surfaced as a count on
  // the Runs section the way a code editor badges source control.
  const pendingApprovals = channels.reduce((sum, ch) => sum + (ch.pendingGates ?? 0), 0);

  // An outcome the founder is chasing is either a program (the rich, compiled form) or a standalone
  // system that exists before any program is compiled. Channels are what actually get built first —
  // the operator composes a channel graph well before a heavyweight OutcomeProgram ever persists —
  // so a channel is a first-class outcome here, never hidden under a program that may not exist yet.
  // This closes the seam where the rail showed an empty "start an outcome" pitch while real systems
  // sat on the canvas.
  const channelsForProgram = (programId: string) =>
    channels.filter((ch) => ch.outcomeProgramId === programId);
  const linkedChannelIds = new Set(
    channels
      .filter((ch) => ch.outcomeProgramId && programs.some((p) => p.id === ch.outcomeProgramId))
      .map((ch) => ch.id),
  );
  const standaloneChannels = channels.filter((ch) => !linkedChannelIds.has(ch.id));
  // Archived/dead systems shouldn't sit at equal weight in the active list. ChannelMeta has no
  // archived status (only idle/error/done/waiting), so a name heuristic is the only honest signal
  // available — prefer a real status field if one is ever added to the model.
  const isArchivedChannel = (ch: ChannelMeta) => /\b(archived|dupe|duplicate)\b/i.test(ch.name);
  const liveStandalone = standaloneChannels.filter((ch) => !isArchivedChannel(ch));
  const archivedStandalone = standaloneChannels.filter(isArchivedChannel);
  const outcomeCount = programs.length + liveStandalone.length;
  const channelDot = (ch: ChannelMeta) =>
    ch.pendingGates > 0 ? "var(--gap)" : ch.lastRunOk === false ? "var(--danger)" : ch.runCount > 0 ? "var(--proven)" : "var(--ghost)";
  const channelMeta = (ch: ChannelMeta) =>
    ch.pendingGates > 0 ? `${ch.pendingGates} gate${ch.pendingGates === 1 ? "" : "s"}`
      : ch.runCount > 0 ? `${ch.runCount} run${ch.runCount === 1 ? "" : "s"}` : "ready";

  if (collapsed) {
    return (
      <nav className="loop-problems-rail collapsed" aria-label="Explorer (collapsed)">
        <button className="rail-reopen" onClick={() => setCollapsed(false)} type="button" title="Show explorer">
          <ChevronRight />
        </button>
      </nav>
    );
  }

  return (
    <nav className="loop-problems-rail" aria-label="Explorer">
      <div className="rail-header">
        <div className="rail-title"><Layers size={15} /><span>Explorer</span></div>
        <button className="rail-collapse" onClick={() => setCollapsed(true)} type="button" title="Collapse explorer" aria-label="Collapse explorer">
          <ChevronLeft />
        </button>
      </div>

      {/* ── Outcomes — the primary tree, the "files" ─────────────────────────
          One outcome is one thing you're going for, plus the system that chases it. With zero
          outcomes, this section IS the first-run pitch and call to action — not a placeholder. */}
      <Section icon={<ShieldCheck size={13} />} title="Outcomes" count={outcomeCount || undefined} defaultOpen>
        {outcomeCount === 0 ? (
          <div className="explorer-firstrun">
            <strong>Start with an outcome</strong>
            <p>Name what you want to happen — a meeting booked, a user activated, a pilot signed. GTM IDE reads your product and builds the agents that chase it, stopping at your gate before anything leaves.</p>
            <button className="explorer-firstrun-cta" onClick={onNewProgram} type="button">
              <Plus size={14} /> Start your first outcome
            </button>
            <button className="explorer-firstrun-secondary" onClick={() => onOpenView("opportunities")} type="button">
              <Sparkles size={13} /> Or let Claude propose outcomes
            </button>
          </div>
        ) : (
          <>
            {/* Programs — the compiled, rich form of an outcome — list first, each with the systems
                (channels) composed under it nested as children. */}
            {programs.map((program) => (
              <div key={program.id}>
                <button className={`explorer-row ${program.id === activeProgramId ? "active" : ""}`} onClick={() => onOpenProgram(program.id)} type="button">
                  <span className="explorer-dot" style={{ background: TONE_DOT[statusTone(program.lastRunStatus ?? program.lifecycle)] }} />
                  <span className="explorer-row-name">{program.name}</span>
                  <span className="explorer-row-meta">{statusLabel(program.lastRunStatus ?? program.lifecycle)}</span>
                </button>
                {channelsForProgram(program.id).length > 0 ? (
                  <div className="explorer-subgroup">
                    <span className="explorer-subgroup-label">Systems</span>
                    {channelsForProgram(program.id).map((ch) => (
                      <button
                        key={ch.id}
                        className={`explorer-row explorer-row-child ${ch.id === activeChannelId ? "active" : ""}`}
                        onClick={() => onOpenChannel(ch.id)}
                        type="button"
                      >
                        <span className="explorer-dot" style={{ background: channelDot(ch) }} />
                        <span className="explorer-row-name">{ch.name}</span>
                        <span className="explorer-row-meta">{channelMeta(ch)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {/* Standalone systems — a channel the founder has built that no program wraps yet. It IS
                an outcome (it has a goal, a system, runs, and a gate), so it sits at the top level as
                its own outcome rather than hidden. This is the common case before a program compiles. */}
            {liveStandalone.map((ch) => (
              <button
                key={ch.id}
                className={`explorer-row ${ch.id === activeChannelId ? "active" : ""}`}
                onClick={() => onOpenChannel(ch.id)}
                type="button"
                title={ch.objective || ch.name}
              >
                <span className="explorer-dot" style={{ background: channelDot(ch) }} />
                <span className="explorer-row-name">{ch.name}</span>
                <span className="explorer-row-meta">{channelMeta(ch)}</span>
              </button>
            ))}

            {/* Archived systems — dead or duplicate outcomes, collapsed out of the way so they
                don't compete with live work, but still reachable. */}
            {archivedStandalone.length > 0 ? (
              <div className="explorer-subgroup">
                <button
                  className="explorer-subgroup-toggle"
                  onClick={() => setArchivedOpen((v) => !v)}
                  type="button"
                >
                  {archivedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="explorer-subgroup-label">Archived</span>
                  <span className="rail-count">{archivedStandalone.length}</span>
                </button>
                {archivedOpen ? archivedStandalone.map((ch) => (
                  <button
                    key={ch.id}
                    className={`explorer-row explorer-row-child explorer-row-archived ${ch.id === activeChannelId ? "active" : ""}`}
                    onClick={() => onOpenChannel(ch.id)}
                    type="button"
                    title={ch.objective || ch.name}
                  >
                    <span className="explorer-dot" style={{ background: "var(--ghost)" }} />
                    <span className="explorer-row-name">{ch.name}</span>
                  </button>
                )) : null}
              </div>
            ) : null}

            <button className="explorer-row explorer-new" onClick={onNewProgram} type="button">
              <Plus size={13} /><span className="explorer-row-name">New outcome</span>
            </button>
            <button
              className={`explorer-row explorer-new ${currentView === "opportunities" ? "active" : ""}`}
              onClick={() => onOpenView("opportunities")}
              type="button"
            >
              <Sparkles size={13} /><span className="explorer-row-name">Ideate outcomes for me</span>
            </button>
          </>
        )}
      </Section>

      {/* ── Library — agents + skills, one collapsed object ───────────────────
          Capabilities and Agents are the same thing, so they live together here. The outcome's own
          personalized agents surface first (the ones born for it); the product-wide on-disk agents and
          skills follow. New agent / new skill author a fresh file. */}
      <Section icon={<Bot size={13} />} title="Library" count={(library?.agents.length ?? 0) + (library?.skills.length ?? 0) || undefined}>
        {outcomeAgents.length ? (
          <div className="explorer-subgroup">
            <span className="explorer-subgroup-label">For this outcome</span>
            {outcomeAgents.map((instance) => (
              <button
                key={instance.id}
                className="explorer-row explorer-row-child"
                onClick={() => onOpenArtifact("agent", instance.ref)}
                type="button"
                title={`${instance.job} · the agent's rules open in its editor`}
              >
                <Bot size={12} />
                <span className="explorer-row-name">{instance.ref}</span>
                <span className="explorer-row-meta">v{instance.version}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="explorer-subgroup">
          <span className="explorer-subgroup-label">Agents</span>
          {(library?.agents ?? []).length === 0 ? (
            <p className="explorer-empty">No agents on disk yet.</p>
          ) : (library?.agents ?? []).map((a) => (
            <button key={a.ref} className="explorer-row explorer-row-child" onClick={() => onOpenArtifact("agent", a.ref)} type="button" title={a.description}>
              <span className="explorer-row-name">{a.ref}</span>
            </button>
          ))}
          <button className="explorer-row explorer-new" onClick={() => onNewArtifact("agent")} type="button">
            <Plus size={13} /><span className="explorer-row-name">New agent</span>
          </button>
        </div>

        <div className="explorer-subgroup">
          <span className="explorer-subgroup-label">Skills</span>
          {(library?.skills ?? []).length === 0 ? (
            <p className="explorer-empty">No skills on disk yet.</p>
          ) : (library?.skills ?? []).map((s) => (
            <button key={s.name} className="explorer-row explorer-row-child" onClick={() => onOpenArtifact("skill", s.name)} type="button" title={s.description}>
              <span className="explorer-row-name">{s.name}</span>
            </button>
          ))}
          <button className="explorer-row explorer-new" onClick={() => onNewArtifact("skill")} type="button">
            <Plus size={13} /><span className="explorer-row-name">New skill</span>
          </button>
        </div>
      </Section>

      {/* ── Problems — the engine, folded in, ranked across the system ──────── */}
      <Section icon={<ListChecks size={13} />} title="Problems" count={problems.length || undefined} defaultOpen={problems.length > 0}>
        {problems.length === 0 ? (
          <p className="explorer-empty">No problems detected.</p>
        ) : problems.map((p) => {
          const node = nodeForSubsystem(p.subsystem);
          return (
            <div className="rail-item" key={p.id}>
              <div className="rail-item-head">
                <AlertTriangle />
                <p className="rail-item-problem">{p.problem}</p>
              </div>
              <div className="rail-item-meta">
                <span className="rail-item-sub">{p.subsystem}</span>
                <span
                  className="rail-item-health"
                  style={{ color: healthHex(p.health), borderColor: healthHex(p.health) }}
                  title={`Health ${p.health}`}
                >
                  {p.health}
                </span>
              </div>
              {node ? (
                <button className="rail-item-fix" onClick={() => onJumpToNode(node.id)} type="button">
                  Fix in {node.label}<ArrowRight />
                </button>
              ) : null}
            </div>
          );
        })}
      </Section>

      {/* ── Runs — what has happened, plus the approvals waiting ────────────── */}
      <Section
        icon={<History size={13} />}
        title="Runs"
        count={pendingApprovals > 0 ? `${pendingApprovals} to approve` : runs.length || undefined}
        defaultOpen={pendingApprovals > 0}
      >
        {pendingApprovals > 0 ? (
          <button
            className="explorer-row explorer-row-approve"
            onClick={() => activeProgramId ? onFocusProgram(activeProgramId, { mode: "review" }) : undefined}
            type="button"
          >
            <ShieldCheck size={13} />
            <span className="explorer-row-name">{pendingApprovals} draft{pendingApprovals === 1 ? " needs" : "s need"} your review</span>
          </button>
        ) : null}
        {runs.length === 0 ? (
          <p className="explorer-empty">No runs recorded yet.</p>
        ) : runs.slice(-6).reverse().map((run) => (
          <button
            key={run.runId} className="explorer-row" type="button"
            onClick={() => activeProgramId && onFocusProgram(activeProgramId, { mode: "run", run, debugTab: "runLogs" })}
          >
            <span
              className="explorer-dot"
              style={{ background: run.pendingGates.length ? "var(--gap)" : run.ok ? "var(--proven)" : "var(--danger)" }}
            />
            <span className="explorer-row-name">{run.runId}</span>
            <span className="explorer-row-meta">{run.pendingGates.length ? "gate" : run.ok ? "ok" : "blocked"}</span>
          </button>
        ))}
      </Section>

      {/* Product grounding (context) and the learning loop are not rail peers — they open from
          inside an outcome. One quiet link keeps the grounding deep-dive reachable. */}
      <button
        className={`explorer-rail-foot ${currentView === "understand" ? "active" : ""}`}
        onClick={() => onOpenView("understand")}
        type="button"
        title="Open product grounding — what Claude reads about your product"
      >
        <Layers size={13} />
        <span>Product grounding</span>
        <span className="explorer-rail-foot-meta">{contextManifest?.contributingProviders ?? 0}/4</span>
      </button>
    </nav>
  );
}
