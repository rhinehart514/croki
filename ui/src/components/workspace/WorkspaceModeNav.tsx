import { Boxes, MessageSquare } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { WorkspaceMode } from "@/lib/venture-session";

const modes = [
  { id: "work", label: "Work", shortcut: "⌘1", Icon: MessageSquare },
  { id: "product-gtm", label: "Product / GTM", shortcut: "⌘2", Icon: Boxes },
] as const;

export type ModeAttention = { needsYou: number; active: number };

// A derived background signal on each mode tab: how many threads/objects need the founder's judgment,
// and whether work is running while they look elsewhere. Both counts come straight from the index the
// brain already derives — never a hand-maintained badge. "Needs you" wins over a quiet running pulse.
function AttentionBadge({ attention, label }: { attention: ModeAttention; label: string }) {
  if (attention.needsYou > 0) {
    return (
      <b className="workspace-mode-badge" data-tone="attention" aria-label={`${attention.needsYou} in ${label} ${attention.needsYou === 1 ? "needs" : "need"} you`}>
        {attention.needsYou}
      </b>
    );
  }
  if (attention.active > 0) {
    return <b className="workspace-mode-badge" data-tone="active" aria-label={`${label} is running`} />;
  }
  return null;
}

export function WorkspaceModeNav({ mode, animate, attention, onMode }: {
  mode: WorkspaceMode;
  animate: boolean;
  attention: Record<WorkspaceMode, ModeAttention>;
  onMode: (mode: WorkspaceMode, opener?: HTMLElement, animate?: boolean) => void;
}) {
  const reducedMotion = useReducedMotion();
  return <nav className="workspace-mode-nav" aria-label="Workspace modes">{modes.map(({ id, label, shortcut, Icon }) => <button key={id} type="button" aria-current={mode === id ? "page" : undefined} onClick={(event) => onMode(id, event.currentTarget, event.detail > 0)}>{mode === id ? <motion.i className="workspace-mode-active" layoutId="workspace-mode-active" transition={reducedMotion || !animate ? { duration: 0 } : { type: "spring", duration: 0.18, bounce: 0 }} /> : null}<Icon aria-hidden="true" /><span className="workspace-mode-copy"><strong>{label}</strong><AttentionBadge attention={attention[id]} label={label} /></span><kbd>{shortcut}</kbd></button>)}</nav>;
}
