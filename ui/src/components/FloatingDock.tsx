import { motion } from "motion/react";
import { AlertTriangle, CircleSlash, Inbox, Lock, MoonStar, Settings2, Sun } from "lucide-react";
import { SPRING } from "@/lib/springs";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import "@/styles/floating-dock.css";
import type { ProjectSummary } from "@/types";

// The single floating control dock that sits top-center over the full-bleed canvas. It keeps product
// and work context close while surfacing only real issues or decisions. Settings remains a quiet,
// monochrome gear rather than a prominent control.
export function FloatingDock({
  // Left — product breadcrumb (the "work" switcher is retired; chats own navigation now)
  projects, activeProjectId, projectBusy, onSwitchProject, onManageProjects, onNewProduct, onDeleteProject,
  // Home — zoom back out to the whole operation and clear any open layer. The product identity mark IS
  // the home button, so the canvas needs no separate floating "back" chip.
  onGoHome,
  // The admin door — opens the Settings overlay (workspace index, team + release roles, self-built
  // tools). Rendered as a quiet, low-emphasis gear in the dock's corner.
  onOpenSettings,
  problems, issuesOpen, onToggleIssues,
  pendingDecisions, decisionsOpen, onToggleDecisions,
  failures = 0, failuresOpen = false, onToggleFailures,
  // Founder-action lock — approving/publishing/local changes are locked until the founder unlocks.
  // Shown as a quiet lock chip, not a parked card; clicking it summons the unlock prompt.
  locked, unlockOpen, onToggleUnlock,
  // Founder presence (the away / unattended state, EXPERIMENT-MACHINE-SPEC rail 1). A quiet state chip —
  // NEVER a KPI — that shows whether the machine thinks the founder is present or away, so it is never
  // guessing silently. When away, nothing outward runs unattended (the backend holds it). Detection is
  // automatic; absent → the chip is omitted.
  presence,
}: {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  projectBusy: boolean;
  onSwitchProject: (id: string) => void | Promise<void>;
  onManageProjects: () => void;
  onNewProduct: () => void;
  // Remove a duplicate product (one project per repo). Optional → no delete affordance in the switcher.
  onDeleteProject?: (id: string) => void | Promise<void>;
  onGoHome?: () => void;
  onOpenSettings?: () => void;
  // Issues — the count of open problems across the system, and the always-present panel it toggles.
  problems: number;
  issuesOpen: boolean;
  onToggleIssues: () => void;
  // Decisions — how many things wait on the founder across ALL products, and the inbox panel toggle.
  pendingDecisions: number;
  decisionsOpen: boolean;
  onToggleDecisions: () => void;
  failures?: number;
  failuresOpen?: boolean;
  onToggleFailures?: () => void;
  locked?: boolean;
  unlockOpen?: boolean;
  onToggleUnlock?: () => void;
  presence?: { state: "present" | "away"; present: boolean } | null;
}) {
  return (
    <motion.div
      className="fdock"
      role="toolbar"
      aria-label="Product canvas controls"
      // x holds the horizontal centering (left: 50% + x: -50%) so motion's animated transform never
      // clobbers it — only y/scale/opacity animate on mount.
      style={{ x: "-50%" }}
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING}
    >
      {/* Left — home mark · product. The "work" breadcrumb ("/ All work" + the "N pieces of work" status)
          is retired: chats own navigation now, so a product opens straight to its conversations in the rail
          rather than to a pipeline switcher. */}
      <div className="fdock-left">
        {onGoHome ? (
          <button
            type="button"
            className="fdock-home"
            onClick={onGoHome}
            title="Back to the product canvas"
            aria-label="Back to the product canvas"
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
      </div>

      {/* Right — the founder's one decision (accented), then a quieter cluster of system health and admin.
          A hairline divider sets "Needs you" apart so it always reads as the primary, not one alarm among
          equals. */}
      <div className="fdock-right">
        {pendingDecisions > 0 ? (
          <div className="fdock-attention-wrap">
            <button
              className={`fdock-icon-btn has-pending${decisionsOpen ? " open" : ""}`}
              type="button"
              onClick={onToggleDecisions}
              title={`${pendingDecisions} founder decision${pendingDecisions === 1 ? "" : "s"} waiting`}
              aria-label={`Needs you, ${pendingDecisions}`}
              aria-pressed={decisionsOpen}
            >
              <Inbox size={14} />
              <span className="fdock-count gate">{pendingDecisions}</span>
            </button>
          </div>
        ) : null}
        {pendingDecisions > 0 && (problems > 0 || (failures > 0 && onToggleFailures) || presence || (locked && onToggleUnlock) || onOpenSettings) ? (
          <span className="fdock-divider" aria-hidden="true" />
        ) : null}
        {problems > 0 ? (
          <button
            className={`fdock-icon-btn fdock-system-status${issuesOpen ? " open" : ""}`}
            type="button"
            onClick={onToggleIssues}
            title={`${problems} system issue${problems === 1 ? "" : "s"}`}
            aria-label={`System issues, ${problems}`}
            aria-pressed={issuesOpen}
          >
            <AlertTriangle size={14} />
            <span className="fdock-count">{problems}</span>
          </button>
        ) : null}
        {failures > 0 && onToggleFailures ? (
          <button
            className={`fdock-icon-btn fdock-system-status${failuresOpen ? " open" : ""}`}
            type="button"
            onClick={onToggleFailures}
            title={`${failures} run failure${failures === 1 ? "" : "s"}`}
            aria-label={`Run failures, ${failures}`}
            aria-pressed={failuresOpen}
          >
            <CircleSlash size={14} />
            <span className="fdock-count">{failures}</span>
          </button>
        ) : null}
        {/* Presence — a quiet state chip (never a KPI). It says which state the machine thinks it is in:
            "Present" (normal wall behavior) or "Away — outward held" (nothing outward runs unattended).
            Detection is automatic; the chip only reports it, it is not a control the founder must operate. */}
        {presence ? (
          <span
            className={`fdock-presence ${presence.present ? "is-present" : "is-away"}`}
            role="status"
            aria-live="polite"
            title={presence.present
              ? "You're here — the machine runs normally. Nothing outward leaves without your approval at the gate."
              : "You're away — nothing outward runs unattended. Outward work is held for when you're back."}
          >
            {presence.present ? <Sun size={13} aria-hidden /> : <MoonStar size={13} aria-hidden />}
            <span className="fdock-presence-label">{presence.present ? "Present" : "Away · outward held"}</span>
          </span>
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
      </div>
    </motion.div>
  );
}
