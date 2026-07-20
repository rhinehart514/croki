import { Boxes, MessageSquare, Rocket } from "lucide-react";
import type { WorkspaceMode } from "@/lib/venture-session";

const modes = [
  { id: "work", label: "Work", shortcut: "⌘1", Icon: MessageSquare },
  { id: "system", label: "Product / GTM", shortcut: "⌘2", Icon: Boxes },
  { id: "releases", label: "Releases", shortcut: "⌘3", Icon: Rocket },
] as const;
export function WorkspaceModeNav({ mode, onMode }: { mode: WorkspaceMode; onMode: (mode: WorkspaceMode, opener?: HTMLElement) => void }) {
  return <nav className="workspace-mode-nav" aria-label="Workspace modes">{modes.map(({ id, label, shortcut, Icon }) => <button key={id} type="button" aria-current={mode === id ? "page" : undefined} onClick={(event) => onMode(id, event.currentTarget)}><Icon aria-hidden="true" /><span>{label}</span><kbd>{shortcut}</kbd></button>)}</nav>;
}
