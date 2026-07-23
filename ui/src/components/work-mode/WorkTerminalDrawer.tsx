import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown, TerminalSquare } from "lucide-react";
import type { WorkTerminalStatus } from "./WorkTerminal";

export function WorkTerminalDrawer({ status = null, children }: { status?: WorkTerminalStatus | null; children: ReactNode }) {
  const [open, setOpen] = useState(false);
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

