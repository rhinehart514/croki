import type { WorkIndex, WorkIndexItem } from "@/api";
import { ThreadList, type ThreadSearchStatus } from "@/components/thread/ThreadList";

// The one-shell rail is the recency spine: Threads and search over them, nothing else. Agents and
// connected capabilities live on the Canvas beside the graph they drop onto, never here.
export function WorkspaceRailBody({ workIndex, selectedThread, search, workLoading, searchStatus, onSelectThread }: {
  workIndex: WorkIndex | null; selectedThread: string | null;
  search: string; workLoading?: boolean; searchStatus?: ThreadSearchStatus;
  onSelectThread: (item: WorkIndexItem) => void;
}) {
  return <ThreadList workIndex={workIndex} search={search} searchStatus={searchStatus} loading={workLoading} selected={selectedThread} onSelect={onSelectThread} />;
}
