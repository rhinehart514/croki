import { useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle, ArrowRight, GitBranch, ListChecks, LoaderCircle, PanelRight, Play, ShieldCheck,
} from "lucide-react";
import { SPRING } from "@/lib/springs";
import { Reveal, Stagger, StaggerItem, Pop } from "@/lib/motion";
import { healthHex } from "@/lib/health";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { OutcomeSwitcher } from "@/components/OutcomeSwitcher";
import { SlidingTabs } from "@/components/SlidingTabs";
import type { ProgramCanvasMode } from "@/components/ProgramCanvas";
import type { ConnectionStatus } from "@/api";
import "@/styles/floating-dock.css";
import type {
  ChannelMeta, GTMContractAudit, GTMGraph, GTMNode, Investigation, OperatorSession,
  OutcomeProgram, ProjectSummary,
} from "@/types";

// The mode lenses are the program's lenses — identical to ProgramCanvasMode, reused so the dock and
// the workbench can never drift on what a mode is.
type DockMode = ProgramCanvasMode;

const MODE_ITEMS: { value: DockMode; label: string }[] = [
  { value: "design", label: "Design" },
  { value: "simulation", label: "Simulation" },
  { value: "run", label: "Run" },
  { value: "review", label: "Review" },
  { value: "learning", label: "Learning" },
];

// The single floating control dock that sits top-center over the full-bleed canvas. It carries every
// control the dissolved top toolbar and program sub-header used to hold, composed left → center →
// right (breadcrumb · lenses · actions), the grounded pattern. It owns no logic — App passes the
// same handlers and state the bars passed before, so this is purely where they live now.
export function FloatingDock({
  // Left — product · outcome breadcrumb
  projects, activeProjectId, projectBusy, onSwitchProject, onManageProjects, onNewProduct,
  programs, channels, activeProgramId, activeChannelId,
  onOpenProgram, onOpenChannel, onNewProgram, onIdeate,
  // GTM ↔ Product
  showGtmToggle, productMode, onModeToggle,
  // Center — the mode lenses
  mode, onModeChange,
  // Right — actions
  problems, problemsOpen, onToggleProblems, nodeForSubsystem, onJumpToNode,
  pendingApprovals, approvalsOpen, onToggleApprovals,
  graph, audits, running, runningNodeId, onSimulate, onRun,
  inspecting, onToggleInspect,
}: {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  projectBusy: boolean;
  onSwitchProject: (id: string) => void | Promise<void>;
  onManageProjects: () => void;
  onNewProduct: () => void;
  programs: OutcomeProgram[];
  channels: ChannelMeta[];
  activeProgramId: string | null;
  activeChannelId: string | null;
  onOpenProgram: (id: string) => void;
  onOpenChannel: (id: string) => void;
  onNewProgram: () => void;
  onIdeate: () => void;
  showGtmToggle: boolean;
  productMode: boolean;
  onModeToggle: (v: "gtm" | "product") => void;
  mode: DockMode;
  onModeChange: (m: DockMode) => void;
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
  onSimulate: () => void;
  onRun: () => void;
  inspecting: boolean;
  onToggleInspect: () => void;
  session: OperatorSession | null;
  connection: ConnectionStatus | null;
}) {
  const noGraph = !graph || graph.nodes.length === 0;
  // Pipeline audit — the contract issues that used to be a canvas chip, now a dock control.
  const auditIssues = (graph?.nodes ?? [])
    .map((n) => ({ node: n, audit: audits[n.id] }))
    .filter((x): x is { node: GTMNode; audit: GTMContractAudit } =>
      !!x.audit && ["waiting", "blocked", "blind"].includes(x.audit.state));
  const [auditOpen, setAuditOpen] = useState(false);

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
          onIdeate={onIdeate}
        />
        {showGtmToggle ? (
          <SlidingTabs
            items={[{ value: "gtm", label: "GTM" }, { value: "product", label: "Product" }]}
            value={productMode ? "product" : "gtm"}
            onChange={onModeToggle}
            layoutId="fdock-gtm-mode"
            size="sm"
          />
        ) : null}
      </div>

      {/* Center — the mode lenses */}
      <div className="fdock-center">
        <SlidingTabs
          items={MODE_ITEMS}
          value={mode}
          onChange={onModeChange}
          layoutId="fdock-mode"
          size="sm"
        />
      </div>

      {/* Right — actions. Compact icon buttons for the secondaries; only Run is the one dark fill.
          Claude's live status lives in the command dock at the bottom, so it isn't duplicated here. */}
      <div className="fdock-right">
        {/* Problems — ranked engine investigations, opens a glass popover routing each to its node. */}
        <div className="fdock-pop-wrap">
          <button
            className={`fdock-icon-btn ${problems.length > 0 ? "has-count" : ""} ${problemsOpen ? "open" : ""}`}
            onClick={onToggleProblems}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={problemsOpen}
            title={problems.length > 0
              ? `${problems.length} problem${problems.length === 1 ? "" : "s"} across your system`
              : "No problems detected"}
          >
            <ListChecks size={15} />
            {problems.length > 0 ? <Pop k={problems.length} className="fdock-count">{problems.length}</Pop> : null}
          </button>
          <Reveal open={problemsOpen} className="fdock-problems-pop" role="dialog" origin="top-right">
            {problems.length === 0 ? (
              <p className="fdock-problems-empty">No problems detected. Your system is healthy.</p>
            ) : (
              <Stagger>
                {problems.map((p) => {
                  const node = nodeForSubsystem(p.subsystem);
                  return (
                    <StaggerItem className="fdock-problems-item" key={p.id}>
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
              </Stagger>
            )}
          </Reveal>
        </div>

        {/* Pipeline audit — contract issues across the graph, moved off the canvas into the dock. */}
        <div className="fdock-pop-wrap">
          <button
            className={`fdock-icon-btn ${auditIssues.length ? "has-count" : ""} ${auditOpen ? "open" : ""}`}
            onClick={() => setAuditOpen((v) => !v)}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={auditOpen}
            title={auditIssues.length
              ? `${auditIssues.length} pipeline issue${auditIssues.length === 1 ? "" : "s"}`
              : "Pipeline audit — contracts clear"}
          >
            <GitBranch size={15} />
            {auditIssues.length ? <Pop k={auditIssues.length} className="fdock-count">{auditIssues.length}</Pop> : null}
          </button>
          <Reveal open={auditOpen} className="fdock-problems-pop" role="dialog" origin="top-right">
            <div className="fdock-pop-title">
              <strong>Pipeline audit</strong>
              <span className={auditIssues.length ? "issues" : ""}>
                {auditIssues.length === 0 ? "Clear" : `${auditIssues.length} issue${auditIssues.length === 1 ? "" : "s"}`}
              </span>
            </div>
            {auditIssues.length === 0 ? (
              <p className="fdock-problems-empty">No pipeline issues — every step's contract is satisfied.</p>
            ) : (
              <Stagger>
                {auditIssues.slice(0, 8).map(({ node, audit }) => (
                  <StaggerItem className="fdock-problems-item" key={node.id}>
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

        {/* Approvals — the founder gate's first-class home. Carries the real pending-draft count. */}
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

        <span className="fdock-divider" />

        {/* Simulate — ghost. A preview, never a send. */}
        <button
          className="fdock-ghost-btn"
          disabled={running || noGraph}
          onClick={onSimulate}
          type="button"
        >
          {running && !runningNodeId ? <LoaderCircle className="spin" size={13} /> : <Play size={13} />}
          Simulate
        </button>

        {/* Run program — the one dark primary. */}
        <button
          className="fdock-run-btn"
          disabled={running || noGraph}
          onClick={onRun}
          type="button"
        >
          {running ? <LoaderCircle className="spin" size={13} /> : null}
          Run program
        </button>
      </div>
    </motion.div>
  );
}
