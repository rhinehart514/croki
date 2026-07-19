import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, Folder, LoaderCircle, RotateCcw } from "lucide-react";
import type { Direction, DirectionState } from "@/components/now/directionModel";
import { relativeAge } from "@/components/now/directionModel";
import type { OutlineObjectNode, OutlineTerritory, VentureOutline } from "./ventureOutlineModel";

const STATUS_LABELS: Partial<Record<DirectionState, string>> = {
  "needs-you": "Needs you",
  working: "Working",
  "from-market": "Returned",
};

type ThreadEntry =
  | { kind: "thought"; id: string; direction: Direction; object: OutlineObjectNode }
  | { kind: "object"; id: string; object: OutlineObjectNode };

function territoryEntries(territory: OutlineTerritory): ThreadEntry[] {
  const entries: ThreadEntry[] = [];
  const seenThoughts = new Set<string>();
  const visit = (object: OutlineObjectNode) => {
    if (object.thoughts.length) {
      for (const direction of object.thoughts) {
        if (seenThoughts.has(direction.id)) continue;
        seenThoughts.add(direction.id);
        entries.push({ kind: "thought", id: `thought:${direction.id}`, direction, object });
      }
    } else if (object.targetable && object.id !== "unplaced-thoughts") {
      entries.push({ kind: "object", id: `object:${object.id}`, object });
    }
    object.children.forEach(visit);
  };
  territory.sections.forEach((section) => section.objects.forEach(visit));
  return entries;
}

function ThreadRow({ entry, selectedObjectId, selectedDirectionId, now, onSelectObject, onSelectDirection }: {
  entry: ThreadEntry; selectedObjectId: string | null; selectedDirectionId: string | null; now: number;
  onSelectObject: (object: OutlineObjectNode) => void; onSelectDirection: (direction: Direction) => void;
}) {
  if (entry.kind === "object") {
    return (
      <button
        type="button"
        className="vw-outline-thread"
        data-state="open"
        aria-current={entry.object.id === selectedObjectId ? "page" : undefined}
        title={entry.object.statement || entry.object.name}
        onClick={() => onSelectObject(entry.object)}
      >
        <span className="vw-index-status" aria-hidden="true" />
        <span className="vw-outline-thread-title">{entry.object.name}</span>
        {entry.object.assertion === "tentative" ? <small className="vw-outline-thread-draft">Draft</small> : null}
      </button>
    );
  }

  const status = STATUS_LABELS[entry.direction.state];
  return (
    <button
      type="button"
      className="vw-outline-thread"
      data-state={entry.direction.state}
      aria-current={entry.direction.id === selectedDirectionId ? "page" : undefined}
      title={`${entry.direction.sentence}\n${entry.direction.understanding}`}
      onClick={() => onSelectDirection(entry.direction)}
    >
      <span className="vw-index-status" aria-hidden="true" />
      <span className="vw-outline-thread-copy">
        {status ? <span className="vw-outline-thread-state">{status}</span> : null}
        <span className="vw-outline-thread-title">{entry.direction.sentence}</span>
      </span>
      <time dateTime={entry.direction.updatedAt ?? undefined}>{relativeAge(entry.direction.updatedAt, now)}</time>
    </button>
  );
}

export function WorkspaceOutline({ outline, state, error, search, needsOnly, selectedObjectId, selectedDirectionId, now, onSelectObject, onSelectDirection, onRetry }: {
  outline: VentureOutline; state: "loading" | "ready" | "failed"; error: string | null; search: string; needsOnly: boolean;
  selectedObjectId: string | null; selectedDirectionId: string | null; now: number;
  onSelectObject: (object: OutlineObjectNode) => void; onSelectDirection: (direction: Direction) => void; onRetry: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(["context"]));
  const toggle = (id: string) => setCollapsed((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const visible = outline.territories.some((territory) => territory.sections.length);

  return (
    <nav className="vw-index-work vw-outline" aria-label="Venture outline">
      <div className="vw-outline-heading">Workspaces</div>
      {state === "loading" ? <div className="vw-index-load-state" role="status"><LoaderCircle aria-hidden="true" /><span>Loading venture</span></div>
        : state === "failed" ? (
          <div className="vw-index-load-state" role="alert"><AlertCircle aria-hidden="true" /><strong>Venture is unavailable</strong>
            <small>{error ?? "Drover could not load this venture."}</small><button type="button" onClick={onRetry}><RotateCcw aria-hidden="true" /> Retry</button></div>
        ) : !visible && (search || needsOnly) ? <div className="vw-index-empty" role="status">No matching work</div>
          : outline.territories.map((territory) => {
            const entries = territoryEntries(territory);
            const open = !collapsed.has(territory.id) || Boolean(search || needsOnly);
            return (
              <section className="vw-outline-workspace" key={territory.id}>
                <button type="button" className="vw-outline-workspace-toggle" aria-expanded={open} onClick={() => toggle(territory.id)}>
                  {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                  <Folder aria-hidden="true" />
                  <span>{territory.label}</span>
                </button>
                {open ? (
                  <div className="vw-outline-threads">
                    {entries.map((entry) => (
                      <ThreadRow key={entry.id} entry={entry} selectedObjectId={selectedObjectId} selectedDirectionId={selectedDirectionId}
                        now={now} onSelectObject={onSelectObject} onSelectDirection={onSelectDirection} />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
    </nav>
  );
}
