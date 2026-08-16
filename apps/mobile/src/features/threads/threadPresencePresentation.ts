import type { PresenceParticipant } from "@croki/contracts";

function participantLabels(
  participants: ReadonlyArray<PresenceParticipant>,
): ReadonlyArray<string> {
  return [...new Set(participants.map((participant) => participant.label.trim()).filter(Boolean))];
}

export function presenceSummaryContent(
  participants: ReadonlyArray<PresenceParticipant>,
): { readonly accessibilityLabel: string; readonly label: string } | null {
  const labels = participantLabels(participants);
  if (labels.length === 0) return null;
  return {
    accessibilityLabel: `People in this thread: ${labels.join(", ")}`,
    label:
      labels.length === 1
        ? `${labels[0]} here`
        : labels.length === 2
          ? `${labels[0]} and ${labels[1]} here`
          : `${labels.slice(0, 2).join(", ")} +${labels.length - 2} here`,
  };
}

export function typingIndicatorLabel(
  participants: ReadonlyArray<PresenceParticipant>,
): string | null {
  const labels = participantLabels(
    participants.filter((participant) => participant.activity === "typing"),
  );
  if (labels.length === 0) return null;
  if (labels.length === 1) return `${labels[0]} is typing…`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} are typing…`;
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2} are typing…`;
}
