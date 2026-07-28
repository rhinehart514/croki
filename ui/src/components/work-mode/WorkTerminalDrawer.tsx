import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ChevronDown, TerminalSquare } from "lucide-react";
import type { WorkTerminalStatus } from "./WorkTerminal";
import { OPEN_TERMINAL_REFERENCE_EVENT, type TerminalReference } from "./terminalReference";

export function WorkTerminalDrawer({ workspaceId, status = null, children }: { workspaceId: string; status?: WorkTerminalStatus | null; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const reopen = (event: Event) => {
      if ((event as CustomEvent<TerminalReference>).detail?.workspaceId === workspaceId) setOpen(true);
    };
    window.addEventListener(OPEN_TERMINAL_REFERENCE_EVENT, reopen);
    return () => window.removeEventListener(OPEN_TERMINAL_REFERENCE_EVENT, reopen);
  }, [workspaceId]);
  return (
    <section className="work-terminal" data-open={open ? "true" : undefined}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <TerminalSquare aria-hidden="true" />
        <span>Terminal</span>
        {!open && status ? <em className="work-terminal-trigger-status" data-tone={status.tone}>{status.label}</em> : null}
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? <div className="work-terminal-body">{children}</div> : null}
    </section>
  );
}
