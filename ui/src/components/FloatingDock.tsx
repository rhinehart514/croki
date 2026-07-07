import { motion } from "motion/react";
import { LoaderCircle, Settings2 } from "lucide-react";
import { SPRING } from "@/lib/springs";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { ChannelSwitcher } from "@/components/ChannelSwitcher";
import { SlidingTabs } from "@/components/SlidingTabs";
import "@/styles/floating-dock.css";
import type { ChannelMeta, GTMGraph, ProjectSummary } from "@/types";

// The single floating control dock that sits top-center over the full-bleed canvas. It has been
// slimmed to two jobs only: "where am I" (the product · pipeline breadcrumb and the GTM↔Product
// toggle) and "go" (Run). The competing badges that used to crowd it — the amber Decisions count, the
// Issues count, and the Summon button — have moved onto the canvas itself, so their props are still
// accepted for compatibility but no longer rendered here. Settings is kept as one quiet, monochrome
// gear in the corner rather than a prominent control.
export function FloatingDock({
  // Left — product · pipeline breadcrumb
  projects, activeProjectId, projectBusy, onSwitchProject, onManageProjects, onNewProduct, onDeleteProject,
  channels, activeChannelId,
  onOpenChannel, onNewChannel,
  onShowOverview, overviewActive,
  // The focused channel's emergent motion identity ("Outbound loop", "Content loop") — what KIND of
  // go-to-market this is, derived from its real stages. Null on the all-channels overview.
  motionName,
  // GTM ↔ Product
  showGtmToggle, productMode, onModeToggle,
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
  motionName?: string | null;
  showGtmToggle: boolean;
  productMode: boolean;
  onModeToggle: (v: "gtm" | "product") => void;
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
        {/* Motion identity — names WHAT KIND of go-to-market the focused workflow is, derived from its
            real stages (no fixed motion list). Hidden on the all-workflows overview and on an empty
            canvas, where there's no single motion to name. */}
        {motionName && !overviewActive && !noGraph && !productMode ? (
          <span className="fdock-motion" title="The kind of go-to-market this pipeline is — derived from its stages">
            {motionName}
          </span>
        ) : null}
        {/* GTM ↔ Product — the one lens toggle that stays on the bar, because it changes what the whole
            canvas is showing you. Everything else you used to reach for here now lives on the canvas. */}
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

      {/* Right — just "go", plus one quiet gear. The Decisions inbox, the Issues count, and Summon have
          all moved onto the canvas, so the bar stays calm: where you are on the left, the run on the
          right. */}
      <div className="fdock-right">
        {/* Settings — a quiet, low-emphasis monochrome gear tucked in the corner. The admin door
            (workspace, team, self-built tools); always reachable in GTM and Product mode alike. */}
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

        {/* Run — the one dark primary, GTM-only (Product mode has nothing to run). */}
        {!productMode ? (
          <button
            className="fdock-run-btn"
            disabled={running || noGraph}
            onClick={onRun}
            type="button"
          >
            {running ? <LoaderCircle className="spin" size={13} /> : null}
            Run
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}
