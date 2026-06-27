import { motion } from "motion/react";
import {
  AlertTriangle, ArrowRight, LoaderCircle, PanelRight, ShieldCheck,
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

// Design · Simulation · Run only. Review was dropped (the Approvals count owns the gate view) and
// Learning moved into the Program-details sheet — both earned their cut in the value audit.
const MODE_ITEMS: { value: DockMode; label: string }[] = [
  { value: "design", label: "Design" },
  { value: "simulation", label: "Simulation" },
  { value: "run", label: "Run" },
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
  graph, audits, running, onRun,
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

      {/* Center — the mode lenses. GTM-program lenses only; in Product mode the product canvas has
          its own lens bar (Conceptual / Goals / IA / …), so the dock hides these to avoid two lens rows. */}
      {!productMode ? (
        <div className="fdock-center">
          <SlidingTabs
            items={MODE_ITEMS}
            value={mode}
            onChange={onModeChange}
            layoutId="fdock-mode"
            size="sm"
          />
        </div>
      ) : null}

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

        {/* Run program — the one dark primary. Simulate was cut — the Simulation lens is the preview. */}
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
