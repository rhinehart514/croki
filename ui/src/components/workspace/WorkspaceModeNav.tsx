import { Boxes, MessageSquare } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { WorkspaceMode } from "@/lib/venture-session";

const modes = [
  { id: "work", label: "Work", shortcut: "⌘1", Icon: MessageSquare },
  { id: "product-gtm", label: "Product / GTM", shortcut: "⌘2", Icon: Boxes },
] as const;
export function WorkspaceModeNav({ mode, animate, onMode }: { mode: WorkspaceMode; animate: boolean; onMode: (mode: WorkspaceMode, opener?: HTMLElement, animate?: boolean) => void }) {
  const reducedMotion = useReducedMotion();
  return <nav className="workspace-mode-nav" aria-label="Workspace modes">{modes.map(({ id, label, shortcut, Icon }) => <button key={id} type="button" aria-current={mode === id ? "page" : undefined} onClick={(event) => onMode(id, event.currentTarget, event.detail > 0)}>{mode === id ? <motion.i className="workspace-mode-active" layoutId="workspace-mode-active" transition={reducedMotion || !animate ? { duration: 0 } : { type: "spring", duration: 0.18, bounce: 0 }} /> : null}<Icon aria-hidden="true" /><span className="workspace-mode-copy"><strong>{label}</strong></span><kbd>{shortcut}</kbd></button>)}</nav>;
}
