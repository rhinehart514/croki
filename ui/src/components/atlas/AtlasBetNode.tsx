import { memo, type KeyboardEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CrewFace } from "@/components/crew/CrewFace";
import { useAtlasDensity } from "./atlasDensity";
import type { AtlasNode } from "./atlasTypes";

// The effort card — the workhorse node. A piece of work the crew is attempting, rendered as a page
// torn from a working notebook (composite §effort): a founder-word kicker, a content-derived title
// (never an ID), a summary, its draft chip, and an instrument footer — status dot + plain state word
// + attribution faces. The selected card keeps its resting size on the canvas; its full detail (the
// draft's actual content, the run record) opens in the docked inspector, not by ballooning inline.

function moveBetFocus(event: KeyboardEvent<HTMLButtonElement>) {
  const direction = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].indexOf(event.key);
  if (direction < 0) return;
  const bets = [...document.querySelectorAll<HTMLButtonElement>(".atlas-effort-card")];
  const current = bets.indexOf(event.currentTarget);
  if (current < 0 || !bets.length) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0
    : event.key === "End" ? bets.length - 1
      : (current + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) + bets.length) % bets.length;
  bets[next]?.focus();
}

function DraftChip({ count, title }: { count: number; title: string | null }) {
  if (count <= 0) return null;
  const label = count === 1 ? "1 draft" : `${count} drafts`;
  return (
    <span className="e-draft">
      <span className="stack" aria-hidden="true"><span /><span /><span /></span>
      <b>{label}</b>{title ? <span className="e-draft-what"> · {title}</span> : null}
    </span>
  );
}

function AtlasBetNodeView({ data, id, selected }: NodeProps<AtlasNode>) {
  const expanded = Boolean(data.expanded || selected);
  const tone = data.effortTone ?? "underway";
  const kicker = data.effortKicker ?? "Underway";
  const stateLabel = data.stateLabel ?? "In progress";
  const summary = (data.statement ?? "").trim() || null;
  const faces = (data.teammates ?? []).slice(0, 3);
  const working = tone === "underway" && !data.draftCount;
  // Card detail responds to zoom continuously (contract §3): title/glyph at low zoom, body and footer
  // re-detailing as the founder zooms in. Density is the CSS variant that reveals or quiets each part.
  // A selected/expanded card is always fully detailed regardless of zoom — selection is the founder's
  // request to read this effort in full, not a zoom tier. This is a render function of zoom, not a mode.
  const density = useAtlasDensity();
  const cardDensity = expanded ? "detailed" : density;
  return (
    <article
      className="atlas-effort atlas-bet-node atlas-element"
      data-atlas-kind="bet"
      data-kind="bet"
      data-focus-role={data.focusRole}
      data-position={data.bet?.position}
      data-band={data.decisionBand}
      data-tone={tone}
      data-density={cardDensity}
      data-expanded={expanded ? "true" : "false"}
    >
      {/* Hidden, centered handles so the hub spoke and draft edges route to this effort. */}
      <Handle type="target" position={Position.Left} className="atlas-hidden-handle" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="atlas-hidden-handle" isConnectable={false} />
      <button
        type="button"
        className="atlas-effort-card"
        aria-pressed={expanded}
        title={data.title}
        onKeyDown={moveBetFocus}
        onClick={(event) => { event.stopPropagation(); data.onSelect(id); }}
      >
        <span className="e-body">
          <span className="e-kicker">
            <span className={working ? "kdot pulse" : "kdot"} aria-hidden="true" />
            {kicker}
          </span>
          <span className="e-title">{data.title}</span>
          {tone === "needs" ? (
            <span className="e-need">
              <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5l6 10.5H1z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M7 5.5v3M7 10h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
              <span>Waiting on your read — open it and say the word.</span>
            </span>
          ) : summary ? <span className="e-summary">{summary}</span> : null}
          <DraftChip count={data.draftCount ?? 0} title={data.draftTitle ?? null} />
        </span>
        <span className="e-foot">
          <span className={tone === "needs" ? "e-state needs" : "e-state"}>
            <span className="sdot" aria-hidden="true" />{stateLabel}
          </span>
          {faces.length ? (
            <span className="e-faces">
              {faces.map((member) => (
                <CrewFace key={member.ref} agentRef={member.ref} size={21} className="face" />
              ))}
            </span>
          ) : null}
        </span>
      </button>
    </article>
  );
}

export const AtlasBetNode = memo(AtlasBetNodeView);
