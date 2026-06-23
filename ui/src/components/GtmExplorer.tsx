import { useState } from "react";
import {
  AlertTriangle, ArrowRight, ChevronDown, ChevronRight, ChevronLeft,
  Workflow, Bot, Sparkles, Layers, ListChecks, Plus, History, GitBranch,
  RefreshCcw, ShieldCheck,
} from "lucide-react";
import type {
  AgentCreationPolicy, AgentInstance, ChannelMeta, ContextManifest, EngineState,
  DomainEvent, FeedbackSignal, GTMGraph, GTMRunResult, GtmLibrary, OutcomeProgram,
} from "@/types";
import type { ProgramCanvasMode, DebugTab } from "@/components/ProgramCanvas";
import { statusLabel, statusTone } from "@/lib/status";

// The explorer dot color follows the shared status tone, so a program's state reads the same here as
// on its canvas pill.
const TONE_DOT: Record<string, string> = {
  good: "var(--proven)",
  active: "var(--proven)",
  waiting: "var(--gap)",
  bad: "var(--danger)",
  idle: "var(--ghost)",
};

// The Explorer — the left pane of the IDE shell. It makes the parts of GTM engineering legible
// and answers "where do I start": your channels are the files (primary, top), with the agents,
// skills, and assembled context beneath, and the engine's problems folded in at the bottom.
// Reuses the rail visual idiom (loop-problems-rail) so it sits where the old Problems rail did.

const CONTEXT_ORDER = ["product", "taste", "state", "signal"] as const;

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

// A non-interactive cluster divider. The explorer had 11 equal top-level sections — too many nouns
// for a founder to hold. Grouping them under a few labels (Build / Run & learn / Library / System)
// gives the eye ~4 anchors instead of 11, without removing any section or its deep-links.
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="explorer-group-label">{children}</div>;
}

type ExplorerView = "projects" | "understand" | "opportunities" | "channels" | "canvas";

export function GtmExplorer({
  channels, activeChannelId, activeProgramId, currentView, onOpenChannel, onOpenProgram, onFocusProgram, onNewProgram,
  onOpenArtifact, onNewArtifact, onOpenView, library, programs, agentPolicies, agentInstances,
  feedbackSignals, domainEvents, runs, contextManifest, engine, graph, onJumpToNode,
}: {
  channels: ChannelMeta[];
  activeChannelId: string | null;
  activeProgramId: string | null;
  currentView: ExplorerView;
  onOpenChannel: (id: string) => void;
  onOpenProgram: (id: string) => void;
  // Deep-link a program-scoped explorer row (policy/run/learning/event) into the canvas, landing
  // on the right mode/run/debug-tab instead of dead-ending.
  onFocusProgram: (programId: string, focus: { mode?: ProgramCanvasMode; run?: GTMRunResult; debugTab?: DebugTab }) => void;
  onNewProgram: () => void;
  onOpenArtifact: (type: "agent" | "skill", ref: string) => void;
  onNewArtifact: (type: "agent" | "skill") => void;
  onOpenView: (view: ExplorerView) => void;
  library: GtmLibrary | null;
  programs: OutcomeProgram[];
  agentPolicies: AgentCreationPolicy[];
  agentInstances: AgentInstance[];
  feedbackSignals: FeedbackSignal[];
  domainEvents: DomainEvent[];
  runs: GTMRunResult[];
  contextManifest: ContextManifest | null;
  engine: EngineState | null;
  graph: GTMGraph | null;
  onJumpToNode: (nodeId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
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
  const ctxByName = new Map((contextManifest?.providers ?? []).map((p) => [p.name, p] as const));
  const activeProgram = programs.find((program) => program.id === activeProgramId) ?? null;
  const visiblePolicies = activeProgram
    ? agentPolicies.filter((policy) => policy.programId === activeProgram.id)
    : agentPolicies;
  const visibleCapabilities = activeProgram
    ? agentInstances.filter((instance) => instance.programId === activeProgram.id)
    : agentInstances;
  const visibleFeedback = activeProgram
    ? feedbackSignals.filter((signal) =>
      signal.graphId === activeProgram.graphId
      || visiblePolicies.some((policy) => signal.policyIds?.includes(policy.id))
    )
    : feedbackSignals;
  const visibleEvents = activeProgram
    ? domainEvents.filter((event) =>
      event.aggregateId === activeProgram.id
      || visiblePolicies.some((policy) => policy.id === event.aggregateId)
      || visibleCapabilities.some((instance) => instance.id === event.aggregateId)
    )
    : domainEvents;

  if (collapsed) {
    return (
      <aside className="loop-problems-rail collapsed">
        <button className="rail-reopen" onClick={() => setCollapsed(false)} type="button" title="Show explorer">
          <ChevronRight />
        </button>
      </aside>
    );
  }

  return (
    <aside className="loop-problems-rail">
      <div className="rail-header">
        <div className="rail-title"><Workflow size={15} /><span>Explorer</span></div>
        <button className="rail-collapse" onClick={() => setCollapsed(true)} type="button" title="Collapse">
          <ChevronLeft />
        </button>
      </div>

      {/* Programs — one outcome you're going for, plus the system that chases it. */}
      <Section icon={<Workflow size={13} />} title="Programs" count={programs.length} defaultOpen>
        {programs.length === 0 ? (
          <p className="explorer-empty">Nothing here yet. Start a program to name an outcome and build the agents that chase it.</p>
        ) : programs.map((program) => (
          <button key={program.id} className={`explorer-row ${program.id === activeProgramId ? "active" : ""}`} onClick={() => onOpenProgram(program.id)} type="button">
            <span className="explorer-dot" style={{ background: TONE_DOT[statusTone(program.status)] }} />
            <span className="explorer-row-name">{program.name}</span>
            <span className="explorer-row-meta">{statusLabel(program.status)}</span>
          </button>
        ))}
        {/* One front door to a program: name the outcome yourself (chat), or let Claude propose
            programs from your product. Both live here under Programs, not as competing peers. */}
        <button className="explorer-row explorer-new" onClick={onNewProgram} type="button">
          <Plus size={13} /><span className="explorer-row-name">{programs.length === 0 ? "Start your first program" : "New program"}</span>
        </button>
        <button
          className={`explorer-row explorer-new ${currentView === "opportunities" ? "active" : ""}`}
          onClick={() => onOpenView("opportunities")}
          type="button"
        >
          <Sparkles size={13} /><span className="explorer-row-name">Ideate programs for me</span>
        </button>
      </Section>

      <GroupLabel>Build</GroupLabel>

      {/* Workflows — the execution plan UNDER a program. Composed by the operator, not created by
          hand; this is a read-only list you open to inspect or debug the steps. */}
      <Section icon={<Workflow size={13} />} title="Workflows" count={channels.length}>
        {channels.length === 0 ? (
          <p className="explorer-empty">Workflows appear when a program composes one. Start a program above.</p>
        ) : channels.map((ch) => (
          <button
            key={ch.id}
            className={`explorer-row ${ch.id === activeChannelId ? "active" : ""}`}
            onClick={() => onOpenChannel(ch.id)}
            type="button"
          >
            <span
              className="explorer-dot"
              style={{ background: ch.pendingGates > 0 ? "var(--gap)" : ch.lastRunOk === false ? "var(--danger)" : ch.runCount > 0 ? "var(--proven)" : "var(--ghost)" }}
            />
            <span className="explorer-row-name">{ch.name}</span>
            <span className="explorer-row-meta">
              {ch.pendingGates > 0 ? `${ch.pendingGates} gate` : ch.runCount > 0 ? `${ch.runCount} run${ch.runCount !== 1 ? "s" : ""}` : "—"}
            </span>
          </button>
        ))}
      </Section>

      {/* Capabilities — personalized agents born from policies and profiles. */}
      <Section icon={<Bot size={13} />} title="Capabilities" count={visibleCapabilities.length} defaultOpen={visibleCapabilities.length > 0}>
        {visibleCapabilities.length === 0 ? (
          <p className="explorer-empty">No personalized agents yet.</p>
        ) : visibleCapabilities.map((instance) => (
          <button
            key={instance.id}
            className="explorer-row"
            onClick={() => onOpenArtifact("agent", instance.ref)}
            type="button"
            title={`${instance.job} · policy ${instance.creationPolicyId}`}
          >
            <span className="explorer-row-name">{instance.ref}</span>
            <span className="explorer-row-meta">v{instance.version}</span>
          </button>
        ))}
        {visiblePolicies.length || visibleFeedback.length ? (
          <div className="explorer-foundry-stats">
            <span>{visiblePolicies.length} policies</span>
            <span>{visibleFeedback.length} feedback signals</span>
          </div>
        ) : null}
      </Section>

      <Section icon={<ShieldCheck size={13} />} title="Policies" count={visiblePolicies.length}>
        {visiblePolicies.length === 0 ? (
          <p className="explorer-empty">No creation policies yet.</p>
        ) : visiblePolicies.map((policy) => {
          const pid = policy.programId ?? activeProgramId;
          return (
            <button
              key={policy.id} className="explorer-row" title={policy.purpose} type="button"
              onClick={() => pid && onFocusProgram(pid, { mode: "design" })}
            >
              <span className="explorer-row-name">{policy.purpose}</span>
              <span className="explorer-row-meta">v{policy.version}</span>
            </button>
          );
        })}
      </Section>

      <GroupLabel>Run &amp; learn</GroupLabel>

      <Section icon={<History size={13} />} title="Runs" count={runs.length}>
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

      <Section icon={<RefreshCcw size={13} />} title="Learning" count={visibleFeedback.length}>
        {visibleFeedback.length === 0 ? (
          <p className="explorer-empty">Founder decisions have not changed this program yet.</p>
        ) : visibleFeedback.slice(-6).reverse().map((signal) => {
          const pid = activeProgramId ?? programs.find((p) => p.graphId === signal.graphId)?.id ?? null;
          return (
            <button
              key={signal.id} className="explorer-row" title={signal.summary} type="button"
              onClick={() => pid && onFocusProgram(pid, { mode: "learning" })}
            >
              <span className="explorer-row-name">{signal.type}</span>
              <span className="explorer-row-meta">{new Date(signal.observedAt).toLocaleDateString()}</span>
            </button>
          );
        })}
      </Section>

      <Section icon={<GitBranch size={13} />} title="Debugger" count={visibleEvents.length}>
        {visibleEvents.length === 0 ? (
          <p className="explorer-empty">No domain events for this program yet.</p>
        ) : visibleEvents.slice(-6).reverse().map((event) => {
          const pid = activeProgramId ?? programs.find((p) => p.id === event.aggregateId)?.id ?? null;
          return (
            <button
              key={event.id} className="explorer-row" title={event.aggregateId ?? undefined} type="button"
              onClick={() => pid && onFocusProgram(pid, { debugTab: "events" })}
            >
              <span className="explorer-row-name">{event.type}</span>
              <span className="explorer-row-meta">{new Date(event.createdAt).toLocaleDateString()}</span>
            </button>
          );
        })}
      </Section>

      <GroupLabel>Library</GroupLabel>

      {/* Agents — real subagents on disk. Click opens the definition to read/edit; New agent
          authors a fresh one (the editor's save creates the file). */}
      <Section icon={<Bot size={13} />} title="Agents" count={library?.agents.length ?? 0}>
        {(library?.agents ?? []).map((a) => (
          <button key={a.ref} className="explorer-row" onClick={() => onOpenArtifact("agent", a.ref)} type="button" title={a.description}>
            <span className="explorer-row-name">{a.ref}</span>
          </button>
        ))}
        <button className="explorer-row explorer-new" onClick={() => onNewArtifact("agent")} type="button">
          <Plus size={13} /><span className="explorer-row-name">New agent</span>
        </button>
      </Section>

      {/* Skills — real skills on disk. Click opens the definition to read/edit; New skill authors one. */}
      <Section icon={<Sparkles size={13} />} title="Skills" count={library?.skills.length ?? 0}>
        {(library?.skills ?? []).map((s) => (
          <button key={s.name} className="explorer-row" onClick={() => onOpenArtifact("skill", s.name)} type="button" title={s.description}>
            <span className="explorer-row-name">{s.name}</span>
          </button>
        ))}
        <button className="explorer-row explorer-new" onClick={() => onNewArtifact("skill")} type="button">
          <Plus size={13} /><span className="explorer-row-name">New skill</span>
        </button>
      </Section>

      <GroupLabel>System</GroupLabel>

      {/* Context — the assembled substrate, the multiplier. Opens the grounding deep-dive. */}
      <Section
        icon={<Layers size={13} />}
        title="Context"
        count={`${contextManifest?.contributingProviders ?? 0}/4`}
        defaultOpen
      >
        {CONTEXT_ORDER.map((name) => {
          const p = ctxByName.get(name);
          const chars = p?.chars ?? 0;
          // The product layer opens the grounding view; the rest are informational signals.
          const opensGrounding = name === "product";
          const className = `explorer-row ${opensGrounding ? "" : "static"} ${opensGrounding && currentView === "understand" ? "active" : ""}`;
          const content = (
            <>
              <span className="explorer-row-name">{name}</span>
              <span className="explorer-row-meta">{chars > 0 ? `${chars} ch` : "—"}</span>
            </>
          );
          return opensGrounding ? (
            <button key={name} className={className} onClick={() => onOpenView("understand")} type="button" title="Open product grounding">
              {content}
            </button>
          ) : (
            <div key={name} className={className} style={{ opacity: chars > 0 ? 1 : 0.5 }}>{content}</div>
          );
        })}
      </Section>

      {/* Problems — the engine, folded in. */}
      <Section icon={<ListChecks size={13} />} title="Problems" count={problems.length} defaultOpen={problems.length > 0}>
        {problems.length === 0 ? (
          <p className="explorer-empty">No problems detected.</p>
        ) : problems.map((p) => {
          const node = nodeForSubsystem(p.subsystem);
          return (
            <div className="rail-item" key={p.id}>
              <div className="rail-item-head">
                <AlertTriangle />
                <span className="rail-item-sub">{p.subsystem}</span>
                <span
                  className="rail-item-health"
                  style={{ color: healthHex(p.health), borderColor: healthHex(p.health) }}
                  title={`Health ${p.health}`}
                >
                  {p.health}
                </span>
              </div>
              <p className="rail-item-problem">{p.problem}</p>
              {node ? (
                <button className="rail-item-fix" onClick={() => onJumpToNode(node.id)} type="button">
                  Fix in {node.label}<ArrowRight />
                </button>
              ) : null}
            </div>
          );
        })}
      </Section>
    </aside>
  );
}
