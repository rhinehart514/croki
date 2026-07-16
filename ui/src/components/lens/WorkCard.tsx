import { ArrowUpRight, ShieldCheck } from "lucide-react";
import type { FirmConfiguration, FirmCrewMember } from "@/types";
import { WorkAttribution } from "./WorkAttribution";
import type { WorkyardCard } from "./workyardProjection";

function returnLabel(joined: boolean): string {
  return joined ? "Joined market return" : "Unattributed return";
}

function wallLabel(purpose: NonNullable<WorkyardCard["wallItems"]>[number]["purpose"]): string {
  if (purpose === "answer") return "Answer exact question";
  if (purpose === "review-outcome") return "Review exact return";
  if (purpose === "end-bet") return "Review proposed ending";
  return "Review exact act";
}

function instrumentReading(card: WorkyardCard) {
  if (card.wallItems.length) return { state: "Needs your hand", output: "Exact outward act", verb: "Review" };
  if (card.outcomes.length) return { state: "Reality returned", output: `${card.outcomes.length} joined ${card.outcomes.length === 1 ? "return" : "returns"}`, verb: "Keep" };
  return { state: "Prepared", output: card.source === "staged" ? "Release in progress" : SOURCE_LABEL[card.source], verb: "Refine" };
}

const SOURCE_LABEL: Record<WorkyardCard["source"], string> = {
  staged: "Prepared work",
  evidence: "Evidence",
  wall: "Needs your hand",
  outcome: "Market return",
};

export function WorkCard({
  card,
  crew,
  configuration,
  selectedTeammateRefs = [],
  selected,
  compact = false,
  onSelect,
  onOpenWall,
  onToggleTeammate,
}: {
  card: WorkyardCard;
  crew: FirmCrewMember[];
  configuration?: FirmConfiguration;
  selectedTeammateRefs?: string[];
  selected: boolean;
  compact?: boolean;
  onSelect: () => void;
  onOpenWall?: (itemId: string) => void;
  onToggleTeammate?: (ref: string) => void;
}) {
  const reading = instrumentReading(card);
  return (
    <article
      className="workyard-card"
      data-selected={selected ? "true" : "false"}
      data-compact={compact ? "true" : "false"}
      data-at-wall={card.wallItems.length ? "true" : "false"}
      data-has-return={card.outcomes.length ? "true" : "false"}
    >
      <button
        type="button"
        className="workyard-card-select nodrag nopan nowheel"
        onClick={(event) => { event.stopPropagation(); onSelect(); }}
        aria-pressed={selected}
        aria-label={`${card.workRef ? "Target" : "Focus"} ${card.title}`}
      >
        <span className="workyard-card-heading">
          <strong>{card.title}</strong>
          {card.wallItems.length ? <ShieldCheck aria-label="Waiting for your review" /> : null}
        </span>
        {!compact ? (
          selected && card.presentation === "artifact"
            ? <pre>{card.body}</pre>
            : card.preview
              ? <span className="workyard-card-body">{selected ? card.body : card.preview}</span>
              : null
        ) : null}
        {!compact ? (
          <small className="workyard-card-provenance">
            {SOURCE_LABEL[card.source]}{card.configurationRevision ? ` · Firm definition v${card.configurationRevision}` : ""}
          </small>
        ) : null}
        <span className="workyard-card-instrument">
          <b>{reading.state}</b>
          <span>{reading.output}</span>
          <em>{reading.verb}</em>
        </span>
      </button>

      <WorkAttribution
        ownerRefs={card.ownerRefs}
        contributorRefs={card.contributorRefs}
        crew={crew}
        configuration={configuration}
        selectedRefs={selectedTeammateRefs}
        onToggleTeammate={onToggleTeammate}
      />

      {!compact && onOpenWall ? card.wallItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className="workyard-card-wall nodrag nopan"
          onClick={(event) => { event.stopPropagation(); onOpenWall(item.id); }}
        >
          <ShieldCheck aria-hidden="true" /> {wallLabel(item.purpose)} <ArrowUpRight aria-hidden="true" />
        </button>
      )) : null}

      {!compact && card.outcomes.map((outcome) => (
        <blockquote key={outcome.id} className="workyard-card-return">
          <span>{returnLabel(outcome.joined)}{outcome.from ? ` · ${outcome.from}` : ""}</span>
          <p>{outcome.body?.trim() || "No market words were captured with this return."}</p>
        </blockquote>
      ))}
    </article>
  );
}
