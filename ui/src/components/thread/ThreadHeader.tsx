import { Ellipsis, Map, Pin, PinOff } from "lucide-react";
import type { ThreadTimeline, VisualReference, WorkIndexItem } from "@/api";

function status(item: WorkIndexItem | null) {
  if (!item) return "Venture conversation";
  if (item.attention === "decision") return "Waiting for your judgment";
  if (item.attention === "failure") return "Interrupted";
  if (item.activity !== "idle") return "Agents working";
  if (item.unread) return "New result";
  return item.lifecycle === "closed" ? "Closed" : "Open";
}

export function ThreadHeader({ item, timeline, onOpenVisual, onTogglePin }: {
  item: WorkIndexItem | null;
  timeline: ThreadTimeline | null;
  onOpenVisual: (visual: VisualReference, origin: HTMLElement) => void;
  onTogglePin: () => void;
}) {
  const isRoot = item?.threadRef === "thread:venture-root";
  const isLegacy = item?.threadRef.startsWith("thread:legacy-") === true;
  const map = timeline?.visuals.find((visual) => visual.kind === "map")
    ?? (item ? { kind: "map" as const, ref: `${item.threadRef}#venture-map`, threadRef: item.threadRef, title: "Venture map" } : null);
  const jumpToAgent = (participantRef: string) => document.getElementById(`agent-update-${participantRef}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  return (
    <header className="thread-header">
      <div className="thread-header-copy"><h1>{item?.founderIntent ?? "Drover"}</h1><span>{status(item)}</span></div>
      <div className="thread-header-agents" aria-label="Thread participants">
        {timeline?.agents.map((agent) => <button type="button" key={agent.runRef} onClick={() => jumpToAgent(agent.participantRef)}><span aria-hidden="true" />{agent.participantLabel ?? agent.participantRef}<small>{agent.state}</small></button>)}
      </div>
      <div className="thread-header-actions">
        {map ? <button type="button" aria-label="Open venture map beside chat" onClick={(event) => onOpenVisual(map, event.currentTarget)}><Map aria-hidden="true" /><span>Map</span></button> : null}
        {item && !isRoot && !isLegacy ? (
          <details className="thread-actions-menu">
            <summary aria-label="Thread actions"><Ellipsis aria-hidden="true" /></summary>
            <div>
              <button type="button" onClick={onTogglePin}>{item.pinnedAt ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}{item.pinnedAt ? "Unpin thread" : "Pin thread"}</button>
              <button type="button" disabled title="Rename through chat in this release">Rename through chat</button>
              <button type="button" disabled title="Close this direction explicitly through chat">Close through chat</button>
            </div>
          </details>
        ) : null}
      </div>
    </header>
  );
}
