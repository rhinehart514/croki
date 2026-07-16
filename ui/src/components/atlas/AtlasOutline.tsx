import { useLayoutEffect, useMemo, useRef } from "react";
import { ListTree, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AtlasNode } from "./atlasTypes";

export function AtlasOutline({
  open,
  nodes,
  selectedId,
  onSelect,
  onClose,
}: {
  open: boolean;
  nodes: AtlasNode[];
  selectedId: string | null;
  onSelect: (id: string, focus?: boolean) => void;
  onClose: () => void;
}) {
  const firstRef = useRef<HTMLButtonElement | null>(null);
  const rows = useMemo(() => nodes.flatMap((node) => {
    if (["group", "teammate", "capability", "wall", "intent"].includes(node.data.kind)) return [];
    const role = node.data.kind === "theory" ? "Current read"
      : node.data.kind === "bet" ? "In progress"
        : node.data.kind === "outcome" ? "Returned"
          : node.data.kind === "work" ? "Concrete work"
            : "Venture structure";
    return [{ id: node.id, role, name: node.data.title }];
  }), [nodes]);
  useLayoutEffect(() => {
    if (open) firstRef.current?.focus({ preventScroll: true });
  }, [open]);
  if (!open) return null;
  return (
    <aside id="atlas-outline-panel" className="atlas-outline" aria-label="Venture atlas outline">
      <header><ListTree aria-hidden="true" /><span><small>Deterministic access</small><strong>Venture outline</strong></span><Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close atlas outline"><X /></Button></header>
      <div role="listbox" aria-label="Current read, concrete work, and returned evidence">
        {rows.map((row, index) => (
          <button
            ref={index === 0 ? firstRef : undefined}
            key={row.id}
            type="button"
            role="option"
            aria-selected={selectedId === row.id}
            onClick={() => onSelect(row.id)}
            onDoubleClick={() => onSelect(row.id, true)}
            onKeyDown={(event) => {
              const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button[role='option']");
              if (!buttons?.length) return;
              const current = [...buttons].indexOf(event.currentTarget);
              const next = event.key === "ArrowDown" ? Math.min(buttons.length - 1, current + 1)
                : event.key === "ArrowUp" ? Math.max(0, current - 1)
                  : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : null;
              if (next == null) return;
              event.preventDefault(); buttons[next].focus();
            }}
          >
            <small>{row.role.replace("-", " ")}</small><span>{row.name}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
