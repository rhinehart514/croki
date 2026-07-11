// The crew room — your whole go-to-market team in one calm view. Every teammate is a pixel character
// you can walk up to: click one and you step into its profile (what it does, what it's learned). It's
// a read-and-pick surface, not a workspace — no dragging, no editing here, just the roster you've
// assembled, on-system and quiet. Seeded from the same bench roster the rail and the profile grid use.

import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { agentPersona, humanizeRef } from "@/lib/agentPersona";
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
  // Escape closes — the expected way out of a centered sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

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

  if (!open) return null;

  return (
    <div className="crewroom-scrim" role="dialog" aria-modal="true" aria-label="Your crew">
      {/* The backdrop is a real button so clicking outside closes — keyboard-reachable, and it never
          swallows clicks meant for the sheet (the sheet paints above it). */}
      <button type="button" className="crewroom-scrim-close" aria-label="Close crew room" onClick={onClose} />
      <div className="crewroom-sheet">
        <header className="crewroom-head">
          <div className="crewroom-headings">
            <h2 className="crewroom-title">Your crew</h2>
            <p className="crewroom-sub">
              {roster.length === 0
                ? "No teammates yet."
                : `${roster.length} teammate${roster.length === 1 ? "" : "s"} on your go-to-market team. Open one to see what it does and what it's learned.`}
            </p>
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
    </div>
  );
}
