import type { WorkIndexItem } from "@/api";

export function latestAgentThread(items: WorkIndexItem[], agentRef: string) {
  return items
    .filter((item) => item.participantRefs.includes(agentRef))
    .sort((left, right) => String(right.createdAt ?? right.updatedAt ?? "").localeCompare(String(left.createdAt ?? left.updatedAt ?? "")))[0] ?? null;
}
