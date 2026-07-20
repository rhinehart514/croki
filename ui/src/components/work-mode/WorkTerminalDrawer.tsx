import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown, TerminalSquare } from "lucide-react";

export function WorkTerminalDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="work-terminal" data-open={open ? "true" : undefined}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <TerminalSquare aria-hidden="true" />
        <span>Terminal</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? <div className="work-terminal-body">{children}</div> : null}
    </section>
  );
}

