import { motion } from "motion/react";
import { LoaderCircle, Settings2 } from "lucide-react";
import { SPRING } from "@/lib/springs";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { ChannelSwitcher } from "@/components/ChannelSwitcher";
import "@/styles/floating-dock.css";
import type { ChannelMeta, GTMGraph, ProjectSummary } from "@/types";

// The single floating control dock that sits top-center over the full-bleed canvas. It has been
// slimmed to two jobs only: "where am I" (the product · pipeline breadcrumb) and "go" (Run). The
// competing badges that used to crowd it — the amber Decisions count, the Issues count, and the
// Summon button — have moved onto the canvas itself, so their props are still accepted for
// compatibility but no longer rendered here. Settings is kept as one quiet, monochrome gear in the
// corner rather than a prominent control.
export function FloatingDock({
  // Left — product · pipeline breadcrumb
  projects, activeProjectId, projectBusy, onSwitchProject, onManageProjects, onNewProduct, onDeleteProject,
  channels, activeChannelId,
  onOpenChannel, onNewChannel,
  onShowOverview, overviewActive,
  // The two discrete altitude controls (docs/production-direction/09): Operator (product / question
  // altitude) vs Engineer (action altitude). CanvasShell renders the canvas chromeless, so the switcher
  // lives here on the dock. `activeLens` is App's effective lens (automatic focus still wins — a focused
  // pipeline is Engineer, candidates are Operator); a click reports the founder's choice up via onLensChange.
  activeLens, onLensChange,
  // A quiet, one-line plain-language operation status (docs/production-direction/16) — "3 pipelines ·
  // 1 waiting on you · 2 back". Orients the founder without a dashboard; a polite status region, never a
  // command. Absent → omitted (no empty chrome).
  operationStatus,
  // motionName is still accepted in the props type but no longer destructured or rendered — the "…loop"
  // pill it drove was removed from the bar (see the render note below).
  // The admin door — opens the Settings overlay (workspace index, team + release roles, self-built
  // tools). Rendered as a quiet, low-emphasis gear in the dock's corner.
  onOpenSettings,
  // Right — the one first-class action left on the bar.
  graph, running, onRun,
  // NOTE: the following props are still accepted so App.tsx keeps compiling, but they are no longer
  // rendered — their surfaces (Decisions inbox, Issues, Summon) are moving onto the canvas. They are
  // intentionally left out of the destructure above to avoid unused-variable lint. See the integration
  // note: summonItems, onSummon, problems, issuesOpen, onToggleIssues, pendingDecisions, decisionsOpen,
  // onToggleDecisions, onCloseMenus, runningNodeId.
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
  // The active altitude lens and its change reporter. Optional so the dock still renders (and existing
  // tests still pass) when a caller hasn't wired the lens; the control is simply omitted then.
  activeLens?: "operator" | "engineer";
  onLensChange?: (id: "operator" | "engineer") => void;
  // A quiet plain-language operation status line. Optional; omitted when absent.
  operationStatus?: string | null;
  motionName?: string | null;
  summonItems?: { id: string; label: string; desc?: string }[];
  onSummon?: (id: string) => void;
  onOpenSettings?: () => void;
  // Issues — the count of open problems across the system, and the always-present panel it toggles.
  problems: number;
  issuesOpen: boolean;
  onToggleIssues: () => void;
  // Decisions — how many things wait on the founder across ALL products, and the inbox panel toggle.
  pendingDecisions: number;
  decisionsOpen: boolean;
  onToggleDecisions: () => void;
  // Close the App-owned toolbar popovers (Issues now). Used so opening the local Summon
  // menu dismisses them — at most one toolbar popover is open at a time.
  onCloseMenus: () => void;
  graph: GTMGraph | null;
  running: boolean;
  runningNodeId: string | null;
  onRun: () => void;
}) {
  const noGraph = !graph || graph.nodes.length === 0;

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
      {/* Left — product · channel breadcrumb */}
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
        <ChannelSwitcher
          channels={channels}
          activeChannelId={activeChannelId}
          onOpenChannel={onOpenChannel}
          onNewChannel={onNewChannel}
          onShowOverview={onShowOverview}
          overviewActive={overviewActive}
        />
        {/* The two altitude controls. Operator = the whole woven operation (product / question altitude);
            Engineer = the single-pipeline editor (action altitude). A segmented control, not a third mode
            or a second bar — the same two-way switch the chromeless CanvasShell would have carried. */}
        {onLensChange ? (
          <>
            <span className="fdock-sep">·</span>
            <div className="fdock-lens" role="group" aria-label="Canvas altitude">
              <button
                type="button"
                className={activeLens === "operator" ? "on" : ""}
                aria-pressed={activeLens === "operator"}
                onClick={() => onLensChange("operator")}
              >
                Operator
              </button>
              <button
                type="button"
                className={activeLens === "engineer" ? "on" : ""}
                aria-pressed={activeLens === "engineer"}
                onClick={() => onLensChange("engineer")}
              >
                Engineer
              </button>
            </div>
          </>
        ) : null}
        {/* A quiet one-line operation status — orients without a dashboard. Polite live region so a change
            ("1 waiting on you") is announced, never a command. */}
        {operationStatus ? (
          <span className="fdock-status" role="status" aria-live="polite">{operationStatus}</span>
        ) : null}
        {/* The "…loop" motion pill was removed from the bar: naming the pipeline "Outbound loop" is
            internal machinery vocabulary that reads as jargon here, and it sat right next to the Run
            control where it looked like a second, confusing thing to act on. The kind-of-motion signal,
            when we want it, belongs on the canvas near the stages it's derived from — not the top bar.
            The prop is still accepted (see the destructure) so callers keep compiling. */}
      </div>

      {/* Right — just "go", plus one quiet gear. The Decisions inbox, the Issues count, and Summon have
          all moved onto the canvas, so the bar stays calm: where you are on the left, the run on the
          right. */}
      <div className="fdock-right">
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
          disabled={running || noGraph}
          onClick={onRun}
          type="button"
        >
          {running ? <LoaderCircle className="spin" size={13} /> : null}
          Run
        </button>
      </div>
    </motion.div>
  );
}
