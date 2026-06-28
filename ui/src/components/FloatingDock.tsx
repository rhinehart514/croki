import { useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle, ArrowRight, LoaderCircle, Lightbulb, LayoutGrid, PanelRight, Plus, ShieldCheck,
} from "lucide-react";
import { SPRING } from "@/lib/springs";
import { Reveal, Stagger, StaggerItem, Pop } from "@/lib/motion";
import { healthHex } from "@/lib/health";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { OutcomeSwitcher } from "@/components/OutcomeSwitcher";
import { SlidingTabs } from "@/components/SlidingTabs";
import type { ConnectionStatus } from "@/api";
import "@/styles/floating-dock.css";
import type {
  ChannelMeta, GTMContractAudit, GTMGraph, GTMNode, Investigation, OperatorSession,
  OutcomeProgram, ProjectSummary,
} from "@/types";

// The single floating control dock that sits top-center over the full-bleed canvas. It carries every
// control the dissolved top toolbar and program sub-header used to hold, composed left → right
// (breadcrumb · actions). The Design/Simulation/Run lenses were cut: one project is one canvas, not
// three modes of it. Run is its own action; the run trace lives in the workbench debugger, not a lens.
export function FloatingDock({
  // Left — product · outcome breadcrumb
  projects, activeProjectId, projectBusy, onSwitchProject, onManageProjects, onNewProduct, onDeleteProject,
  programs, channels, activeProgramId, activeChannelId,
  onOpenProgram, onOpenChannel, onNewProgram, onIdeate,
  onShowOverview, overviewActive,
  // The focused workflow's emergent motion identity ("Outbound loop", "Content loop") — what KIND of
  // go-to-market this is, derived from its real stages. Null on the all-workflows overview.
  motionName,
  // GTM ↔ Product
  showGtmToggle, productMode, onModeToggle,
  // Summon — the agentic replacement for lens tabs. Instead of navigating between frozen views, you
  // summon one onto the canvas as a draggable card. The caller passes the summonable views for the
  // current mode (the dock adapts), and onSummon pops the chosen view up on the canvas.
  summonItems, onSummon,
  // Right — actions
  problems, problemsOpen, onToggleProblems, nodeForSubsystem, onJumpToNode,
  pendingApprovals, approvalsOpen, onToggleApprovals,
  graph, audits, running, onRun,
  inspecting, onToggleInspect,
  onOpenWorkspace,
}: {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  projectBusy: boolean;
  onSwitchProject: (id: string) => void | Promise<void>;
  onManageProjects: () => void;
  onNewProduct: () => void;
  // Remove a duplicate product (one project per repo). Optional → no delete affordance in the switcher.
  onDeleteProject?: (id: string) => void | Promise<void>;
  programs: OutcomeProgram[];
  channels: ChannelMeta[];
  activeProgramId: string | null;
  activeChannelId: string | null;
  onOpenProgram: (id: string) => void;
  onOpenChannel: (id: string) => void;
  onNewProgram: () => void;
  onIdeate: () => void;
  onShowOverview?: () => void;
  overviewActive?: boolean;
  motionName?: string | null;
  showGtmToggle: boolean;
  productMode: boolean;
  onModeToggle: (v: "gtm" | "product") => void;
  summonItems?: { id: string; label: string; desc?: string }[];
  onSummon?: (id: string) => void;
  problems: Investigation[];
  problemsOpen: boolean;
  onToggleProblems: () => void;
  nodeForSubsystem: (subsystem: string) => GTMNode | null;
  onJumpToNode: (nodeId: string) => void;
  pendingApprovals: number;
  approvalsOpen: boolean;
  onToggleApprovals: () => void;
  graph: GTMGraph | null;
  audits: Record<string, GTMContractAudit>;
  running: boolean;
  runningNodeId: string | null;
  onRun: () => void;
  inspecting: boolean;
  onToggleInspect: () => void;
  // Open the three-lane workspace (workflows / skills / agents). Optional → no affordance when absent.
  onOpenWorkspace?: () => void;
  session: OperatorSession | null;
  connection: ConnectionStatus | null;
}) {
  const [summonOpen, setSummonOpen] = useState(false);
  const noGraph = !graph || graph.nodes.length === 0;
  // Problems (engine investigations) + the pipeline audit (contract issues) are ONE "Issues" surface.
  const auditIssues = (graph?.nodes ?? [])
    .map((n) => ({ node: n, audit: audits[n.id] }))
    .filter((x): x is { node: GTMNode; audit: GTMContractAudit } =>
      !!x.audit && ["waiting", "blocked", "blind"].includes(x.audit.state));
  const issueCount = problems.length + auditIssues.length;

  return (
    <motion.div
      className="fdock"
      role="toolbar"
      aria-label="Program controls"
      // x holds the horizontal centering (left: 50% + x: -50%) so motion's animated transform never
      // clobbers it — only y/scale/opacity animate on mount.
      style={{ x: "-50%" }}
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING}
    >
      {/* Left — product · outcome breadcrumb */}
      <div className="fdock-left">
        <ProjectSwitcher
          projects={projects}
          activeProjectId={activeProjectId}
          busy={projectBusy}
          onSwitch={onSwitchProject}
          onManage={onManageProjects}
          onNewProduct={onNewProduct}
          onDelete={onDeleteProject}
        />
        <span className="fdock-sep">/</span>
        <OutcomeSwitcher
          programs={programs}
          channels={channels}
          activeProgramId={activeProgramId}
          activeChannelId={activeChannelId}
          onOpenProgram={onOpenProgram}
          onOpenChannel={onOpenChannel}
          onNewProgram={onNewProgram}
          onShowOverview={onShowOverview}
          overviewActive={overviewActive}
        />
        {/* Motion identity — names WHAT KIND of go-to-market the focused workflow is, derived from its
            real stages (no fixed motion list). Hidden on the all-workflows overview and on an empty
            canvas, where there's no single motion to name. */}
        {motionName && !overviewActive && !noGraph && !productMode ? (
          <span className="fdock-motion" title="The kind of go-to-market this workflow is — derived from its stages">
            {motionName}
          </span>
        ) : null}
        {/* Ideate — pulled out of the flows dropdown into its own top-bar action. It streams the
            ideation board (workflows composed from grounded reality). Also reachable from the command
            dock, so it's never buried in a menu. */}
        <button
          className={`fdock-ideate ${overviewActive ? "active" : ""}`}
          onClick={onIdeate}
          type="button"
          title="Ideate workflows from your grounded product"
        >
          <Lightbulb size={14} />
          <span>Ideate</span>
        </button>
        {showGtmToggle ? (
          <SlidingTabs
            items={[{ value: "gtm", label: "GTM" }, { value: "product", label: "Product" }]}
            value={productMode ? "product" : "gtm"}
            onChange={onModeToggle}
            layoutId="fdock-gtm-mode"
            size="sm"
          />
        ) : null}
        {/* Summon — the agentic replacement for lens tabs. One + opens a short menu of views you can
            pop onto the canvas as draggable cards. You ask for what you want to see instead of
            navigating a fixed taxonomy; Claude can summon the same cards. */}
        {summonItems && summonItems.length && onSummon ? (
          <div className="fdock-pop-wrap">
            <button
              className={`fdock-summon ${summonOpen ? "open" : ""}`}
              onClick={() => setSummonOpen((v) => !v)}
              type="button"
              aria-haspopup="menu"
              aria-expanded={summonOpen}
              title="Summon a view onto the canvas"
            >
              <Plus size={14} />
              <span>Summon</span>
            </button>
            <Reveal open={summonOpen} className="fdock-summon-pop" role="menu" origin="top-left">
              <div className="fdock-summon-head">Pop a view onto the canvas</div>
              {summonItems.map((item) => (
                <button
                  key={item.id}
                  className="fdock-summon-item"
                  role="menuitem"
                  type="button"
                  onClick={() => { onSummon(item.id); setSummonOpen(false); }}
                >
                  <strong>{item.label}</strong>
                  {item.desc ? <span>{item.desc}</span> : null}
                </button>
              ))}
            </Reveal>
          </div>
        ) : null}
      </div>

      {/* Right — actions. Compact icon buttons for the secondaries; only Run is the one dark fill.
          Claude's live status lives in the command dock at the bottom, so it isn't duplicated here. */}
      <div className="fdock-right">
        {/* Issues — engine investigations (Problems) and contract issues (Pipeline audit) merged into
            ONE control. Both answer "what's broken across the system"; ranked together in one popover. */}
        <div className="fdock-pop-wrap">
          <button
            className={`fdock-icon-btn ${issueCount ? "has-count" : ""} ${problemsOpen ? "open" : ""}`}
            onClick={onToggleProblems}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={problemsOpen}
            title={issueCount ? `${issueCount} issue${issueCount === 1 ? "" : "s"} across your system` : "No issues — your system is healthy"}
          >
            <AlertTriangle size={15} />
            {issueCount ? <Pop k={issueCount} className="fdock-count">{issueCount}</Pop> : null}
          </button>
          <Reveal open={problemsOpen} className="fdock-problems-pop" role="dialog" origin="top-right">
            <div className="fdock-pop-title">
              <strong>Issues</strong>
              <span className={issueCount ? "issues" : ""}>{issueCount === 0 ? "Clear" : `${issueCount} issue${issueCount === 1 ? "" : "s"}`}</span>
            </div>
            {issueCount === 0 ? (
              <p className="fdock-problems-empty">No issues — your system is healthy.</p>
            ) : (
              <Stagger>
                {problems.map((p) => {
                  const node = nodeForSubsystem(p.subsystem);
                  return (
                    <StaggerItem className="fdock-problems-item" key={`p-${p.id}`}>
                      <div className="fdock-problems-head">
                        <AlertTriangle size={13} />
                        <p>{p.problem}</p>
                      </div>
                      <div className="fdock-problems-meta">
                        <span className="fdock-problems-sub">{p.subsystem}</span>
                        <span
                          className="fdock-problems-health"
                          style={{ color: healthHex(p.health), borderColor: healthHex(p.health) }}
                          title={`Health ${p.health}`}
                        >
                          {p.health}
                        </span>
                      </div>
                      {node ? (
                        <button className="fdock-problems-fix" onClick={() => onJumpToNode(node.id)} type="button">
                          Fix in {node.label}<ArrowRight size={12} />
                        </button>
                      ) : null}
                    </StaggerItem>
                  );
                })}
                {auditIssues.map(({ node, audit }) => (
                  <StaggerItem className="fdock-problems-item" key={`a-${node.id}`}>
                    <div className="fdock-problems-head"><AlertTriangle size={13} /><p>{node.label}</p></div>
                    <p className="fdock-audit-msg">{audit.message}</p>
                    <button className="fdock-problems-fix" onClick={() => onJumpToNode(node.id)} type="button">
                      Fix in {node.label}<ArrowRight size={12} />
                    </button>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </Reveal>
        </div>

        {/* Approvals — the founder gate's first-class home. Carries the real pending-draft count.
            GTM-only: the gate is a go-to-market concept, so it's hidden in Product mode. */}
        {!productMode ? (
          <button
            className={`fdock-icon-btn ${pendingApprovals > 0 ? "has-pending" : ""} ${approvalsOpen ? "open" : ""}`}
            onClick={onToggleApprovals}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={approvalsOpen}
            title={pendingApprovals > 0
              ? `${pendingApprovals} draft${pendingApprovals === 1 ? "" : "s"} waiting for your approval`
              : "No drafts waiting — nothing has reached the gate"}
          >
            <ShieldCheck size={15} />
            {pendingApprovals > 0 ? <Pop k={pendingApprovals} className="fdock-count gate">{pendingApprovals}</Pop> : null}
          </button>
        ) : null}

        {/* Workspace — the three-lane index of workflows, skills, and agents. */}
        {onOpenWorkspace ? (
          <button
            className="fdock-icon-btn"
            onClick={onOpenWorkspace}
            type="button"
            title="Open the workspace — every workflow, skill, and agent"
          >
            <LayoutGrid size={15} />
          </button>
        ) : null}

        {/* Program details — opens the inspector sheet (agents, measurement, learning). */}
        <button
          className={`fdock-icon-btn ${inspecting ? "open" : ""}`}
          onClick={onToggleInspect}
          type="button"
          aria-pressed={inspecting}
          title={inspecting ? "Hide program details" : "Show program details (agents, measurement, learning)"}
        >
          <PanelRight size={15} />
        </button>

        {/* Run program — the one dark primary, GTM-only (Product mode has nothing to run). */}
        {!productMode ? (
          <>
            <span className="fdock-divider" />
            <button
              className="fdock-run-btn"
              disabled={running || noGraph}
              onClick={onRun}
              type="button"
            >
              {running ? <LoaderCircle className="spin" size={13} /> : null}
              Run program
            </button>
          </>
        ) : null}
      </div>
    </motion.div>
  );
}
