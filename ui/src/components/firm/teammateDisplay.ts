import type { FirmConfiguration, FirmCrewMember } from "@/types";

export function teammateDisplayName(member: FirmCrewMember | undefined, fallback = "Your first agent") {
  return typeof member?.soul?.name === "string" && member.soul.name.trim()
    ? member.soul.name
    : member?.ref ?? fallback;
}

export function configuredParticipantName(
  configuration: FirmConfiguration | null | undefined,
  ref: string | null | undefined,
  member?: FirmCrewMember,
  fallback = "Your first agent",
) {
  const configured = configuration?.agents.find((agent) => agent.ref === ref)?.name?.trim();
  return configured || teammateDisplayName(member, ref || fallback);
}
