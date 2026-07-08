import { useMemo, useState, type DragEvent } from "react";
import { CrewFace } from "@/components/crew/CrewFace";
import { agentPersona } from "@/lib/agentPersona";
import { STEP_DRAG_MIME } from "@/lib/objectPalette";
import type { StepDragPayload } from "@/components/LeftRail";
import {
  CAPABILITIES, STAGE_ORDER, capabilityMark, type Capability,
} from "@/lib/capabilities";
import type { AgentBenchRow } from "@/api";
import "@/styles/composer-parts.css";

// The SUMMONED parts tray — a horizontal strip of the founder's crew faces and capability marks that
// slides in from the composer's "Parts" toggle. Every tile is the same object the founder sees on the
// canvas and in the @-menu: drag it onto the board to add a pipeline step, or click/drop it into the
// sentence to drop in a mention chip. It carries no logic of its own beyond that — it's a projection of
// the bench + CAPABILITIES the rest of the app already holds client-side.
//
// NOTE: this renders faces/marks inline. When ui/src/components/composer/RosterTile.tsx lands (built in
// parallel), swap the inline <TileFace>/<TileMark> bodies for <RosterTile> so all four surfaces share one
// tile component — the drag/insert wiring here stays unchanged.

// What a tile hands back when the founder clicks it (or drops it into the line) to mention it in the
// sentence. The integrator wires the textarea side; this only says which teammate or capability was
// picked, in the same shape the app already resolves elsewhere.
export type PartsTrayEntity =
  | { kind: "agent"; ref: string; label: string; job?: string }
  | { kind: "capability"; cap: Capability };

// The exact dataTransfer payloads LeftRail writes, so a tile dragged from here and a row dragged from the
// rail land identically on the canvas drop target. Teammate → agent ref; capability → its stage + gated.
function agentPayload(row: AgentBenchRow, label: string): StepDragPayload {
  return { kind: "agent", ref: row.ref, label };
}
function capabilityPayload(cap: Capability): StepDragPayload {
  return { kind: "capability", id: cap.id, name: cap.name, stage: cap.stage, gated: !!cap.gated };
}

function writeDrag(event: DragEvent<HTMLElement>, payload: StepDragPayload) {
  event.dataTransfer.setData(STEP_DRAG_MIME, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = "copy";
}

// A capability's brand mark drawn in its own color (identity, not decoration), or a clean lettermark
// tile. Gated capabilities carry the small amber gate dot — the same marker they wear on the rail and in
// the flow — because they reach the outside world and only act behind the founder gate.
function TileMark({ cap }: { cap: Capability }) {
  const mark = capabilityMark(cap);
  return (
    <span className="pt-mark" title={cap.name} aria-hidden="true">
      {mark ? (
        <svg viewBox="0 0 24 24" width="16" height="16" fill={`#${mark.hex}`}>
          <path d={mark.path} />
        </svg>
      ) : (
        <span className="pt-mark-letter" style={{ color: cap.lettermark!.hex }}>{cap.lettermark!.text}</span>
      )}
      {cap.gated ? <span className="pt-gate-dot" /> : null}
    </span>
  );
}

// One draggable tile: a teammate face or a capability mark. Dragging it writes the LeftRail payload so it
// lands on the canvas as a step; clicking it fires onInsert so it drops into the sentence as a chip.
function CrewTile({ row, label, onInsert }: {
  row: AgentBenchRow;
  label: string;
  onInsert: (entity: PartsTrayEntity) => void;
}) {
  return (
    <button
      className="pt-tile"
      type="button"
      draggable
      onDragStart={(e) => writeDrag(e, agentPayload(row, label))}
      onClick={() => onInsert({ kind: "agent", ref: row.ref, label, job: row.job })}
      title={`Drag ${label} onto the canvas, or click to mention`}
    >
      <CrewFace agentRef={row.ref} job={row.job} size={26} className="pt-face" />
    </button>
  );
}

function CapTile({ cap, onInsert }: {
  cap: Capability;
  onInsert: (entity: PartsTrayEntity) => void;
}) {
  return (
    <button
      className="pt-tile"
      type="button"
      draggable
      onDragStart={(e) => writeDrag(e, capabilityPayload(cap))}
      onClick={() => onInsert({ kind: "capability", cap })}
      title={`Drag ${cap.name} onto the canvas, or click to mention`}
    >
      <TileMark cap={cap} />
    </button>
  );
}

export function PartsTray({
  bench,
  capabilities = CAPABILITIES,
  onInsert,
  maxCrew = 5,
  maxCaps = 5,
  className,
}: {
  // The founder's crew — same list the rail reads. null while loading; empty renders just the tools.
  bench: AgentBenchRow[] | null;
  // The capabilities to surface — defaults to the full roster, ordered by run-stage.
  capabilities?: Capability[];
  // Fired when a tile is clicked (or, once wired, dropped into the line) to mention it in the sentence.
  onInsert: (entity: PartsTrayEntity) => void;
  // How many faces / marks to show before collapsing the rest into a "+N" the founder clicks to expand.
  maxCrew?: number;
  maxCaps?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Names fall back to the derived role, exactly like the rail — a founder-chosen name wins when present.
  const crew = useMemo(() => {
    const list = bench ?? [];
    return list.map((row) => ({
      row,
      label: row.name?.trim() || agentPersona(row.ref, row.job).role,
    }));
  }, [bench]);

  // Capabilities ordered find → enrich → reach → publish → measure, the same pipeline reading as the rail.
  const caps = useMemo(() => {
    const order = new Map(STAGE_ORDER.map((s, i) => [s, i]));
    return [...capabilities].sort((a, b) => (order.get(a.stage) ?? 99) - (order.get(b.stage) ?? 99));
  }, [capabilities]);

  const crewShown = expanded ? crew : crew.slice(0, maxCrew);
  const capsShown = expanded ? caps : caps.slice(0, maxCaps);
  const hidden = (crew.length - crewShown.length) + (caps.length - capsShown.length);

  return (
    <div className={`pt-tray${className ? ` ${className}` : ""}`} role="group" aria-label="Your crew & tools">
      <span className="pt-label">Your crew &amp; tools</span>

      {crewShown.map(({ row, label }) => (
        <CrewTile key={row.ref} row={row} label={label} onInsert={onInsert} />
      ))}

      {crewShown.length > 0 && capsShown.length > 0 ? <span className="pt-div" aria-hidden="true" /> : null}

      {capsShown.map((cap) => (
        <CapTile key={cap.id} cap={cap} onInsert={onInsert} />
      ))}

      {hidden > 0 ? (
        <button className="pt-more" type="button" onClick={() => setExpanded(true)}>
          +{hidden}
        </button>
      ) : null}
    </div>
  );
}
