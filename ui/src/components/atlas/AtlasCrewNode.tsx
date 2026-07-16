import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { CrewFace } from "@/components/crew/CrewFace";
import type { AtlasNode } from "./atlasTypes";

// A teammate on the stage — the composite's crew node: a face with a live presence dot, the name, and
// one line of what they're doing right now, placed in clear space near the effort they hold. Clicking
// opens their current work in the docked inspector (no separate profile surface). The "doing" line is
// derived deterministically upstream; presence tone (working / asking / idle) drives the dot and the
// activity chip's color.

function AtlasCrewNodeView({ data, id, selected }: NodeProps<AtlasNode>) {
  const presence = (data.crewPresence as "working" | "asking" | "idle" | undefined) ?? "idle";
  const doing = (data.crewDoing as string | undefined)?.trim() || "with you on this venture";
  const isSelected = Boolean(selected || data.selected);
  return (
    <div
      className="atlas-crew"
      data-atlas-kind="teammate"
      data-atlas-id={id}
      data-presence={presence}
      data-selected={isSelected ? "true" : "false"}
      data-focus-role={data.focusRole}
    >
      <button
        type="button"
        className="atlas-crew-button"
        aria-label={`${data.title} — ${doing}`}
        aria-pressed={isSelected}
        onClick={(event) => { event.stopPropagation(); data.onSelect(id); }}
      >
        <span className="cr-av">
          {data.agentRef ? <CrewFace agentRef={data.agentRef} size={46} state={presence === "working" ? "working" : "idle"} /> : null}
          <span className={`cr-presence ${presence}`} aria-hidden="true" />
        </span>
        <span className="cr-name">{data.title}</span>
        <span className={`cr-doing ${presence}`}>{doing}</span>
      </button>
    </div>
  );
}

export const AtlasCrewNode = memo(AtlasCrewNodeView);
