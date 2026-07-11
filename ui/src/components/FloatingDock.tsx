import { motion } from "motion/react";
import { AlertTriangle, Inbox, LoaderCircle, Lock, Settings2 } from "lucide-react";
import { SPRING } from "@/lib/springs";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { ChannelSwitcher } from "@/components/ChannelSwitcher";
import "@/styles/floating-dock.css";
import type { ChannelMeta, GTMGraph, ProjectSummary } from "@/types";

// The single floating control dock that sits top-center over the full-bleed canvas. It has been
// slimmed to two jobs only: "where am I" (the product · pipeline breadcrumb) and "go" (Run). The
// attention controls appear only when real issues or decisions exist. Settings remains a quiet,
// monochrome gear rather than a prominent control.
export function FloatingDock({
  // Left — product · pipeline breadcrumb
  projects, activeProjectId, projectBusy, onSwitchProject, onManageProjects, onNewProduct, onDeleteProject,
  channels, activeChannelId,
  onOpenChannel, onNewChannel,
  onShowOverview, overviewActive,
  // Home — zoom back out to the whole operation and clear any open layer. The product identity mark IS
  // the home button, so the canvas needs no separate floating "back" chip.
  onGoHome,
  // A quiet, one-line plain-language operation status (docs/production-direction/16) — "3 pipelines ·
  // 1 waiting on you · 2 back". Orients the founder without a dashboard; a polite status region, never a
  // command. Absent → omitted (no empty chrome).
  operationStatus,
  // The admin door — opens the Settings overlay (workspace index, team + release roles, self-built
  // tools). Rendered as a quiet, low-emphasis gear in the dock's corner.
  onOpenSettings,
  problems, issuesOpen, onToggleIssues,
  pendingDecisions, decisionsOpen, onToggleDecisions,
  // Founder-action lock — approving/publishing/local changes are locked until the founder unlocks.
  // Shown as a quiet lock chip, not a parked card; clicking it summons the unlock prompt.
  locked, unlockOpen, onToggleUnlock,
  // Right — the one first-class action left on the bar.
  graph, running, onRun,
}: {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  projectBusy: boolean;
  onSwitchProject: (id: string) => void | Promise<void>;
  onManageProjects: () => void;
  onNewProduct: () => void;
  // Remove a duplicate product (one project per repo). Optional → no delete affordance in the switcher.
  onDeleteProject?: (id: string) => void | Promise<void>;
  channels: ChannelMeta[];
  activeChannelId: string | null;
  onOpenChannel: (id: string) => void;
  onNewChannel: () => void;
  onShowOverview?: () => void;
  overviewActive?: boolean;
  onGoHome?: () => void;
  // A quiet plain-language operation status line. Optional; omitted when absent.
  operationStatus?: string | null;
  onOpenSettings?: () => void;
  // Issues — the count of open problems across the system, and the always-present panel it toggles.
  problems: number;
  issuesOpen: boolean;
  onToggleIssues: () => void;
  // Decisions — how many things wait on the founder across ALL products, and the inbox panel toggle.
  pendingDecisions: number;
  decisionsOpen: boolean;
  onToggleDecisions: () => void;
  locked?: boolean;
  unlockOpen?: boolean;
  onToggleUnlock?: () => void;
  graph: GTMGraph | null;
  running: boolean;
  onRun: () => void;
}) {
  const noGraph = !graph || graph.nodes.length === 0;
  const runTitle = running ? "Running…" : noGraph ? "Open or build a pipeline first, then run it" : "Run this pipeline";

  return (
    <motion.div
      className="fdock"
      role="toolbar"
      aria-label="Pipeline controls"
      // x holds the horizontal centering (left: 50% + x: -50%) so motion's animated transform never
      // clobbers it — only y/scale/opacity animate on mount.
      style={{ x: "-50%" }}
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING}
    >
      {/* Left — home mark · product · channel breadcrumb */}
      <div className="fdock-left">
        {onGoHome ? (
          <button
            type="button"
            className="fdock-home"
            onClick={onGoHome}
            title="Back to the whole operation"
            aria-label="Back to the whole operation"
          >
            <span className="loop-brand-mark">G</span>
          </button>
        ) : null}
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
        <ChannelSwitcher
          channels={channels}
          activeChannelId={activeChannelId}
          onOpenChannel={onOpenChannel}
          onNewChannel={onNewChannel}
          onShowOverview={onShowOverview}
          overviewActive={overviewActive}
        />
        {/* A quiet one-line operation status — orients without a dashboard. Polite live region so a change
            ("1 waiting on you") is announced, never a command. */}
        {operationStatus ? (
          <span className="fdock-status" role="status" aria-live="polite">{operationStatus}</span>
        ) : null}
      </div>

      {/* Right — real attention only, one quiet gear, and the primary run action. */}
      <div className="fdock-right">
        {problems > 0 ? (
          <button className={`fdock-icon-btn has-count${issuesOpen ? " open" : ""}`} type="button" onClick={onToggleIssues} title={`${problems} ${problems === 1 ? "issue" : "issues"}`} aria-label={`Issues, ${problems}`} aria-pressed={issuesOpen}>
            <AlertTriangle size={14} />
            <span className="fdock-count">{problems}</span>
          </button>
        ) : null}
        {pendingDecisions > 0 ? (
          <button className={`fdock-icon-btn has-pending${decisionsOpen ? " open" : ""}`} type="button" onClick={onToggleDecisions} title={`${pendingDecisions} waiting on you`} aria-label={`Waiting on you, ${pendingDecisions}`} aria-pressed={decisionsOpen}>
            <Inbox size={14} />
            <span className="fdock-count gate">{pendingDecisions}</span>
          </button>
        ) : null}
        {/* Founder-action lock — a quiet chip that says approving/publishing is locked and summons the
            unlock prompt on click. Replaces the card that used to sit parked on the canvas full-time. */}
        {locked && onToggleUnlock ? (
          <button
            className={`fdock-icon-btn fdock-lock${unlockOpen ? " open" : ""}`}
            type="button"
            onClick={onToggleUnlock}
            title="Founder actions are locked — click to unlock approving, publishing, and local changes"
            aria-label="Unlock founder actions"
            aria-pressed={unlockOpen}
          >
            <Lock size={14} />
          </button>
        ) : null}
        {/* Settings — a quiet, low-emphasis monochrome gear tucked in the corner. The admin door
            (workspace, team, self-built tools). */}
        {onOpenSettings ? (
          <button
            className="fdock-icon-btn fdock-settings-gear"
            onClick={onOpenSettings}
            type="button"
            title="Settings — workspace, team, and tools"
            aria-label="Settings"
          >
            <Settings2 size={14} />
          </button>
        ) : null}

        {/* Run — the one dark primary. */}
        <button
          className="fdock-run-btn"
          data-testid="pipeline-run"
          data-terrain-primary="true"
          disabled={running || noGraph}
          title={runTitle}
          onClick={onRun}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            if (!running && !noGraph) onRun();
          }}
          type="button"
        >
          {running ? <LoaderCircle className="spin" size={13} /> : null}
          Run
        </button>
      </div>
    </motion.div>
  );
}
