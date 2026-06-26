import { useState } from "react";
import {
  AlertTriangle, ArrowRight, ChevronDown, ChevronRight, ChevronLeft,
  Bot, Sparkles, ListChecks, Plus, History, Layers, ShieldCheck, Boxes,
} from "lucide-react";
import type {
  AgentInstance, ChannelMeta, ContextManifest, EngineState,
  GTMGraph, GTMRunResult, GtmLibrary, OutcomeProgram,
} from "@/types";
import type { ProgramCanvasMode, DebugTab } from "@/components/ProgramCanvas";
import { statusLabel, statusTone } from "@/lib/status";
import { healthHex } from "@/lib/health";

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

type ExplorerView = "projects" | "understand" | "product" | "opportunities" | "channels" | "canvas";

// A run is identified internally as `run-<epoch-ms>`. That id is for the machine; a person needs to
// know WHEN it ran and WHAT happened. Recover the time from the id and say it plainly — the same
// "speak human, not machine" standard the Problems rail already sets.
function runWhen(runId: string): string {
  const epoch = Number(String(runId).replace(/^run-/, ""));
  if (!Number.isFinite(epoch)) return "earlier";
  const secondsAgo = Math.max(0, Math.round((Date.now() - epoch) / 1000));
  if (secondsAgo < 45) return "just now";
  if (secondsAgo < 3600) return `${Math.round(secondsAgo / 60)} min ago`;
  if (secondsAgo < 86400) return `${Math.round(secondsAgo / 3600)} h ago`;
  return `${Math.round(secondsAgo / 86400)} d ago`;
}

// What the run actually did, in the founder's words — gate waiting, completed clean, or stopped.
function runOutcome(run: GTMRunResult): string {
  if (run.pendingGates?.length) return `${run.pendingGates.length} at your gate`;
  if (run.ok) return "completed";
  return "blocked";
}

// The on-disk library is the founder's WHOLE ~/.claude toolbox — including personal design and
// meta skills (design-critic, stochasticBUILD, crucible, prompt-translate, status…) that have
// nothing to do with go-to-market. A GTM IDE user seeing those next to their outreach agents is
// pure noise. Scope the product Library to GTM-relevant capabilities by hiding that personal/meta
// toolbox. The boundary is intentionally explicit and easy to adjust; it never hides a gtm-* ref or
// a personalized outcome agent.
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

// A Library capability (agent or skill) as a FEED into the canvas: click the name to edit its file,
// drag it onto the canvas to add it as a node, or hit +Add to drop it wired to the selection. The
// founder chose both gestures; this carries them on one row.
function CapabilityRow({ kind, capRef, label, meta, title, canAdd, onOpen, onAdd }: {
  kind: "agent" | "skill";
  capRef: string;
  label: string;
  meta?: string;
  title?: string;
  // Adding to the canvas (drag or +Add) needs a live graph to drop into. With none, the gestures are
  // disabled rather than silently no-op'ing — the row still opens the file for editing.
  canAdd: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  return (
    <div
      className="explorer-cap-row"
      draggable={canAdd}
      onDragStart={canAdd ? (event) => {
        event.dataTransfer.setData("application/gtm-capability", JSON.stringify({ kind, ref: capRef, label }));
        event.dataTransfer.effectAllowed = "copy";
      } : undefined}
      title={title}
    >
      <button className="explorer-row explorer-row-child explorer-cap-open" onClick={onOpen} type="button">
        {kind === "agent" ? <Bot size={12} /> : <Layers size={12} />}
        <span className="explorer-row-name">{label}</span>
        {meta ? <span className="explorer-row-meta">{meta}</span> : null}
      </button>
      <button
        className="explorer-cap-add"
        onClick={onAdd}
        type="button"
        disabled={!canAdd}
        aria-label={`Add ${label} to the canvas`}
        title={canAdd ? "Add to the canvas" : "Open a workflow first to add this"}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

export function GtmExplorer({
  channels, activeChannelId, activeProgramId, currentView, onOpenChannel, onOpenProgram, onFocusProgram, onNewProgram,
  onOpenArtifact, onNewArtifact, onAddCapability, onOpenView, library, programs, agentInstances,
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
  // Add a Library capability onto the canvas as a node (the click-to-add counterpart to drag-drop).
  onAddCapability: (type: "agent" | "skill", ref: string, label: string) => void;
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

  // The active outcome's per-agent set, so the Library highlights the agents this outcome actually
  // uses (the personalized capabilities born for it) above the product-wide on-disk library.
  const activeProgram = programs.find((program) => program.id === activeProgramId) ?? null;
  const outcomeAgents = activeProgram
    ? agentInstances.filter((instance) => instance.programId === activeProgram.id)
    : [];

  // Pending founder approvals across the whole product — the safety spine, surfaced as a count on
  // the Runs section the way a code editor badges source control.
  const pendingApprovals = channels.reduce((sum, ch) => sum + (ch.pendingGates ?? 0), 0);

  // The product Library shows GTM capabilities only — the personal/meta toolbox is filtered out.
  const gtmAgents = (library?.agents ?? []).filter((a) => isGtmCapability(a.ref));
  const gtmSkills = (library?.skills ?? []).filter((s) => isGtmCapability(s.name));

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
    <nav className="loop-problems-rail" aria-label="Feeds">
      <div className="lzone-head">
        <div className="lzone-id">
          <span className="lzone-name">Feeds</span>
          <span className="lzone-flow">flows into the canvas →</span>
        </div>
        <button className="rail-collapse" onClick={() => setCollapsed(true)} type="button" title="Collapse feeds" aria-label="Collapse feeds">
          <ChevronLeft />
        </button>
      </div>

      {/* ── Library — the capabilities you drag onto the canvas: the outcome's own personalized
          agents first, then the product-wide on-disk agents and skills. This is the most active
          feed (you literally drag from here into the graph), so it leads the rail. */}
      <Section icon={<Bot size={13} />} title="Library" count={(gtmAgents.length + gtmSkills.length) || undefined} defaultOpen>
        {outcomeAgents.length ? (
          <div className="explorer-subgroup">
            <span className="explorer-subgroup-label">For this outcome</span>
            {outcomeAgents.map((instance) => (
              <CapabilityRow
                key={instance.id}
                kind="agent"
                capRef={instance.ref}
                label={instance.ref}
                meta={`v${instance.version}`}
                title={`${instance.job} · click to edit, drag or +Add to the canvas`}
                canAdd={!!graph}
                onOpen={() => onOpenArtifact("agent", instance.ref)}
                onAdd={() => onAddCapability("agent", instance.ref, instance.ref)}
              />
            ))}
          </div>
        ) : null}

        <div className="explorer-subgroup">
          <span className="explorer-subgroup-label">Agents</span>
          {gtmAgents.length === 0 ? (
            <p className="explorer-empty">No agents on disk yet.</p>
          ) : gtmAgents.map((a) => (
            <CapabilityRow
              key={a.ref}
              kind="agent"
              capRef={a.ref}
              label={a.ref}
              title={a.description ? `${a.description} · click to edit, drag or +Add to the canvas` : "Click to edit, drag or +Add to the canvas"}
              canAdd={!!graph}
              onOpen={() => onOpenArtifact("agent", a.ref)}
              onAdd={() => onAddCapability("agent", a.ref, a.ref)}
            />
          ))}
          <button className="explorer-row explorer-new" onClick={() => onNewArtifact("agent")} type="button">
            <Plus size={13} /><span className="explorer-row-name">New agent</span>
          </button>
        </div>

        <div className="explorer-subgroup">
          <span className="explorer-subgroup-label">Skills</span>
          {gtmSkills.length === 0 ? (
            <p className="explorer-empty">No skills on disk yet.</p>
          ) : gtmSkills.map((s) => (
            <CapabilityRow
              key={s.name}
              kind="skill"
              capRef={s.name}
              label={s.name}
              title={s.description ? `${s.description} · click to edit, drag or +Add to the canvas` : "Click to edit, drag or +Add to the canvas"}
              canAdd={!!graph}
              onOpen={() => onOpenArtifact("skill", s.name)}
              onAdd={() => onAddCapability("skill", s.name, s.name)}
            />
          ))}
          <button className="explorer-row explorer-new" onClick={() => onNewArtifact("skill")} type="button">
            <Plus size={13} /><span className="explorer-row-name">New skill</span>
          </button>
        </div>
      </Section>

      {/* Ambient feeds — the product grounding Claude reads, the editable product picture, and the
          ideated opportunities you compose into systems. Inputs to the canvas, lighter than the
          Library, so they sit just under it as glances rather than destinations. */}
      <div className="feeds-context">
        <div className="explorer-foot-grounding">
          <button
            className={`explorer-rail-foot ${currentView === "understand" ? "active" : ""}`}
            onClick={() => onOpenView("understand")}
            type="button"
            title="Open product grounding — what Claude reads about your product"
          >
            <Layers size={13} />
            <span>Product grounding</span>
            <span className="explorer-rail-foot-meta">{contextManifest?.contributingProviders ?? 0}/{contextManifest?.providers?.length ?? 4}</span>
          </button>
          <div className="explorer-foot-peek" role="tooltip">
            <span className="explorer-foot-peek-eyebrow">What Claude reads about your product</span>
            {contextManifest?.providers?.length ? (
              <ul className="explorer-foot-peek-list">
                {contextManifest.providers.map((p) => (
                  <li key={p.name} className={p.contributed ? "on" : "off"}>
                    <span className="explorer-foot-peek-dot" />
                    <span className="explorer-foot-peek-name">{p.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="explorer-foot-peek-empty">No context assembled yet — connect a repository to ground the model.</p>
            )}
            <span className="explorer-foot-peek-cue">Click to inspect the grounding →</span>
          </div>
        </div>

        <button
          className={`explorer-rail-foot ${currentView === "product" ? "active" : ""}`}
          onClick={() => onOpenView("product")}
          type="button"
          title="Open the living product picture — the editable model of your product's objects, relationships, goals, and states"
        >
          <Boxes size={13} />
          <span>Product picture</span>
        </button>

        <button
          className={`explorer-rail-foot ${currentView === "opportunities" ? "active" : ""}`}
          onClick={() => onOpenView("opportunities")}
          type="button"
          title="Ideated channels Claude proposes — compose them into systems on the canvas"
        >
          <Sparkles size={13} />
          <span>Opportunities</span>
        </button>
      </div>

      {/* ── Workspace — navigation + diagnostics, below the feeds. Your outcomes (the files), the
          ranked Problems across the system, and the Runs ledger: what you're building and how it's
          going, distinct from what flows in. */}
      <div className="lzone-divider">
        <span>Workspace</span>
        <span className="lzone-divider-hint">what you're building &amp; how it's going</span>
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
            title={run.runId}
            onClick={() => activeProgramId && onFocusProgram(activeProgramId, { mode: "run", run, debugTab: "runLogs" })}
          >
            <span
              className="explorer-dot"
              style={{ background: run.pendingGates.length ? "var(--gap)" : run.ok ? "var(--proven)" : "var(--danger)" }}
            />
            <span className="explorer-row-name">{runWhen(run.runId)}</span>
            <span className="explorer-row-meta">{runOutcome(run)}</span>
          </button>
        ))}
      </Section>

    </nav>
  );
}
