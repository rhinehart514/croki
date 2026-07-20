import type { WorkIndexItem } from "@/api";
import { CrewFace } from "@/components/crew/CrewFace";
import type { FirmCrewMember } from "@/types";

function memberName(member: FirmCrewMember) {
  return member.soul?.name?.trim() || member.ref;
}

function presenceFor(member: FirmCrewMember, items: WorkIndexItem[]) {
  const active = items.find((item) => item.activeParticipantRefs.includes(member.ref));
  if (active) return { state: "active" as const, label: "Working", item: active };

  const waiting = items.find((item) => item.attention === "decision" && item.participantRefs.includes(member.ref));
  if (waiting) return { state: "waiting" as const, label: "Needs you", item: waiting };

  const interrupted = items.find((item) => item.attention === "failure" && item.participantRefs.includes(member.ref));
  if (interrupted) return { state: "interrupted" as const, label: "Interrupted", item: interrupted };

  const recent = items.find((item) => item.lifecycle !== "closed" && item.participantRefs.includes(member.ref));
  return { state: "ready" as const, label: "Ready", item: recent ?? null };
}

function PresenceContent({ member, label }: { member: FirmCrewMember; label: string }) {
  return <>
    <CrewFace agentRef={member.ref} size={34} className="thread-agent-face" />
    <span className="thread-agent-presence-copy">
      <strong>{memberName(member)}</strong>
      <small>{label}</small>
    </span>
    <span className="thread-agent-presence-mark" aria-hidden="true" />
  </>;
}

export function ThreadAgentPresence({ crew, items, activeCount, waitingCount, onSelect }: {
  crew: FirmCrewMember[];
  items: WorkIndexItem[];
  activeCount: number;
  waitingCount: number;
  onSelect: (item: WorkIndexItem) => void;
}) {
  return (
    <section className="thread-agent-presence" aria-label="Agent presence">
      <h2>Agents</h2>
      <p className="thread-agent-summary">{activeCount} active · {waitingCount} waiting on you</p>
      {crew.length ? (
        <ul>
          {crew.map((member) => {
            const presence = presenceFor(member, items);
            const name = memberName(member);
            return (
              <li key={member.ref}>
                {presence.item ? (
                  <button type="button" className="thread-agent-presence-row" data-state={presence.state} onClick={() => onSelect(presence.item!)} aria-label={`${name} · ${presence.label}. Open thread`}>
                    <PresenceContent member={member} label={presence.label} />
                  </button>
                ) : (
                  <div className="thread-agent-presence-row" data-state={presence.state} aria-label={`${name} · ${presence.label}`}>
                    <PresenceContent member={member} label={presence.label} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : <p className="thread-rail-empty">No agents in this venture</p>}
    </section>
  );
}
