import { useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, LoaderCircle, Plus, Settings2, Users } from "lucide-react";
import { SPRING } from "@/lib/springs";
import { Reveal, Pop } from "@/lib/motion";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { ChannelSwitcher } from "@/components/ChannelSwitcher";
import { SlidingTabs } from "@/components/SlidingTabs";
import "@/styles/floating-dock.css";
import type { ChannelMeta, GTMGraph, ProjectSummary } from "@/types";

// The single floating control dock that sits top-center over the full-bleed canvas. It carries the
// breadcrumb (product · channel), Ideate, the GTM↔Product toggle, Summon, and the first-class actions:
// Issues (the always-present problem count) and Run. Workspace and Team
// are no longer permanent buttons here; you summon those onto the canvas instead, so the bar holds only
// what you reach for constantly. The Design/Simulation/Run lenses were cut: one project is one canvas.
export function FloatingDock({
  // Left — product · channel breadcrumb
  projects, activeProjectId, projectBusy, onSwitchProject, onManageProjects, onNewProduct, onDeleteProject,
  channels, activeChannelId,
  onOpenChannel, onNewChannel,
  onShowOverview, overviewActive,
  // The focused channel's emergent motion identity ("Outbound loop", "Content loop") — what KIND of
  // go-to-market this is, derived from its real stages. Null on the all-channels overview.
  motionName,
  // GTM ↔ Product
  showGtmToggle, productMode, onModeToggle,
  // Summon — the agentic replacement for lens tabs AND for the old toolbar sections. Instead of
  // navigating between frozen views or hunting a dedicated button, you summon one onto the canvas as a
  // draggable card. The caller passes the summonable views; onSummon pops the chosen one up.
  summonItems, onSummon,
  // The admin door — opens the Settings overlay (workspace index, team + release roles, self-built
  // tools). These moved out of the Summon menu so the bar's gear is their single home.
  onOpenSettings,
  // The bench door — opens the agent roster (every specialist and its gate track record).
  onOpenBench,
  // Right — the first-class actions
  problems, issuesOpen, onToggleIssues,
  onCloseMenus,
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
  motionName?: string | null;
  showGtmToggle: boolean;
  productMode: boolean;
  onModeToggle: (v: "gtm" | "product") => void;
  summonItems?: { id: string; label: string; desc?: string }[];
  onSummon?: (id: string) => void;
  onOpenSettings?: () => void;
  onOpenBench?: () => void;
  // Issues — the count of open problems across the system, and the always-present panel it toggles.
  problems: number;
  issuesOpen: boolean;
  onToggleIssues: () => void;
  // Close the App-owned toolbar popovers (Issues now). Used so opening the local Summon
  // menu dismisses them — at most one toolbar popover is open at a time.
  onCloseMenus: () => void;
  graph: GTMGraph | null;
  running: boolean;
  runningNodeId: string | null;
  onRun: () => void;
}) {
  const [summonOpen, setSummonOpen] = useState(false);
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
        {/* Ideate lives in the composer — the one "say things to Claude" home — not here. This bar is
            the canvas's own controls (navigate, summon, run); asking Claude to think is a conversational
            action, so it belongs with the conversation, not duplicated in the top chrome. */}
        {showGtmToggle ? (
          <SlidingTabs
            items={[{ value: "gtm", label: "GTM" }, { value: "product", label: "Product" }]}
            value={productMode ? "product" : "gtm"}
            onChange={onModeToggle}
            layoutId="fdock-gtm-mode"
            size="sm"
          />
        ) : null}
        {/* Summon — the agentic replacement for lens tabs and the old toolbar sections. One + opens a
            short menu of views you can pop onto the canvas as draggable cards (the experiment matrix,
            a terminal, a query, …). You ask for what you want to see instead of navigating a fixed
            taxonomy; Claude can summon the same cards. */}
        {summonItems && summonItems.length && onSummon ? (
          <div className="fdock-pop-wrap">
            <button
              className={`fdock-summon ${summonOpen ? "open" : ""}`}
              onClick={() => { if (!summonOpen) onCloseMenus(); setSummonOpen((v) => !v); }}
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

      {/* Right — the first-class actions. Issues and Run; the founder gate now blooms on the canvas.
          Everything else is summoned now. Claude's live status lives in the command dock below. */}
      <div className="fdock-right">
        {/* Settings — the admin door (workspace, team, self-built tools), evicted from the Summon
            junk drawer into one overlay. Always reachable, in GTM and Product mode alike. */}
        {/* Bench — the agent roster and each specialist's gate track record. GTM-only; a first-class
            surface alongside the canvas and the pipelines, not a summoned card. */}
        {onOpenBench && !productMode ? (
          <button
            className="fdock-icon-btn"
            onClick={() => { setSummonOpen(false); onOpenBench(); }}
            type="button"
            title="Bench — your agents and what they've earned at the gate"
            aria-label="Agent bench"
          >
            <Users size={15} />
          </button>
        ) : null}

        {onOpenSettings ? (
          <>
            <button
              className="fdock-icon-btn"
              onClick={() => { setSummonOpen(false); onOpenSettings(); }}
              type="button"
              title="Settings — workspace, team, and tools"
              aria-label="Settings"
            >
              <Settings2 size={15} />
            </button>
            {!productMode ? <span className="fdock-divider" /> : null}
          </>
        ) : null}

        {/* Issues — the always-present problem indicator, promoted off the Summon menu. Carries the live
            problem count (monochrome — amber stays the gate's alone) and toggles the inline Issues panel.
            GTM-only: problems are derived from the GTM graph and engine. */}
        {!productMode ? (
          <button
            className={`fdock-icon-btn ${problems > 0 ? "has-count" : ""} ${issuesOpen ? "open" : ""}`}
            onClick={() => { setSummonOpen(false); onToggleIssues(); }}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={issuesOpen}
            title={problems > 0
              ? `${problems} problem${problems === 1 ? "" : "s"} across your system`
              : "No issues — your system is healthy"}
          >
            <AlertTriangle size={15} />
            {problems > 0 ? <Pop k={problems} className="fdock-count">{problems}</Pop> : null}
          </button>
        ) : null}

        {/* Run — the one dark primary, GTM-only (Product mode has nothing to run). */}
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
              Run
            </button>
          </>
        ) : null}
      </div>
    </motion.div>
  );
}
