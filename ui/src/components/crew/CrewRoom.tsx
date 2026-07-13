// The crew room — your whole go-to-market team in one calm view. Every teammate is a pixel character
// you can walk up to: click one and you step into its profile (what it does, what it's learned). It's
// a read-and-pick surface, not a workspace — no dragging, no editing here, just the roster you've
// assembled, on-system and quiet. Seeded from the same bench roster the rail and the profile grid use.

import { useMemo } from "react";
import { X } from "lucide-react";
import { agentPersona, humanizeRef } from "@/lib/agentPersona";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CrewFace } from "./CrewFace";
import "./CrewRoom.css";

export type CrewMember = { ref: string; job?: string; name?: string; hasRuns?: boolean };

export function CrewRoom({
  open, roster, onClose, onOpen,
}: {
  open: boolean;
  roster: CrewMember[];
  onClose: () => void;
  onOpen: (ref: string) => void;
}) {
  // Names shown to the founder must be unique. Several agents can share one coarse role ("Prospect
  // Researcher" x3), so when a role is shared, fall back to each agent's own descriptive name — the
  // same rule the rail and the profile team grid use, so all three rosters read the same way.
  const nameByRef = useMemo(() => {
    const roleCount = new Map<string, number>();
    const roleByRef = new Map<string, string>();
    for (const m of roster) {
      const { role } = agentPersona(m.ref, m.job);
      roleByRef.set(m.ref, role);
      roleCount.set(role, (roleCount.get(role) ?? 0) + 1);
    }
    const out = new Map<string, string>();
    for (const m of roster) {
      const role = roleByRef.get(m.ref) ?? m.ref;
      // A teammate the founder named (built via "+") shows exactly that name.
      const chosen = m.name?.trim();
      out.set(m.ref, chosen || ((roleCount.get(role) ?? 0) > 1 ? humanizeRef(m.ref) : role));
    }
    return out;
  }, [roster]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent
        className="crewroom-scrim"
        overlayClassName="!bg-transparent !backdrop-blur-none"
        showCloseButton={false}
        style={{ transform: "none", maxWidth: "none", borderRadius: 0, boxShadow: "none" }}
        onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      >
      <div className="crewroom-sheet">
        <header className="crewroom-head">
          <div className="crewroom-headings">
            <DialogTitle className="crewroom-title">Your crew</DialogTitle>
            <DialogDescription className="crewroom-sub">
              {roster.length === 0
                ? "No teammates yet."
                : `${roster.length} teammate${roster.length === 1 ? "" : "s"} on your go-to-market team. Open one to see what it does and what it's learned.`}
            </DialogDescription>
          </div>
          <button type="button" className="crewroom-close" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {roster.length === 0 ? (
          <p className="crewroom-empty">No crew yet — assemble agents and they'll gather here.</p>
        ) : (
          <div className="crewroom-grid">
            {roster.map((m) => {
              const p = agentPersona(m.ref, m.job);
              const name = nameByRef.get(m.ref) ?? p.role;
              return (
                <button
                  key={m.ref}
                  type="button"
                  className="crewroom-card"
                  onClick={() => onOpen(m.ref)}
                  title={`Open ${name}'s profile`}
                >
                  <span className="crewroom-stage">
                    <CrewFace agentRef={m.ref} job={m.job} family={p.family} monogram={p.monogram} size={56} />
                  </span>
                  <span className="crewroom-name">{name}</span>
                  {name !== p.role ? <span className="crewroom-role">{p.role}</span> : null}
                  <span className="crewroom-note">{m.hasRuns ? "Proven" : "On the bench"}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      </DialogContent>
    </Dialog>
  );
}
