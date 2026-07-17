import { Handle, Position as HandlePosition, type NodeProps } from "@xyflow/react";
import { GitFork } from "lucide-react";
import type { FirmBet, FirmConfiguration, FirmCrewMember } from "@/types";
import type { CanvasAltitude } from "./lensScene";
import { WorkAttribution } from "./WorkAttribution";
import { WorkCard } from "./WorkCard";
import type { WorkyardCard } from "./workyardProjection";

export type BetTerritoryData = {
  bet: FirmBet;
  cards: WorkyardCard[];
  crew: FirmCrewMember[];
  configuration?: FirmConfiguration;
  altitude?: CanvasAltitude;
  focusRole?: "focus" | "related" | "context";
  selectedWorkRef?: string | null;
  selectedTeammateRefs?: string[];
  onSelectBet?: (betId: string) => void;
  onSelectWork?: (betId: string, workRef: string) => void;
  onToggleTeammate?: (teammateRef: string) => void;
  onOpenWall?: (itemId?: string) => void;
};

const POSITION_LABEL: Record<FirmBet["position"], string> = {
  live: "Underway",
  "at-wall": "Needs your hand",
  ended: "Ended by you",
};

function involvedRefs(bet: FirmBet, cards: WorkyardCard[]) {
  return [...new Set([
    bet.teammateRef,
    ...cards.flatMap((card) => [...card.ownerRefs, ...card.contributorRefs]),
  ].filter((ref): ref is string => Boolean(ref)))];
}

function middleCards(cards: WorkyardCard[], selectedWorkRef?: string | null) {
  const selected = selectedWorkRef ? cards.find((card) => card.workRef === selectedWorkRef) : null;
  return [...new Set([selected, ...cards].filter((card): card is WorkyardCard => Boolean(card)))].slice(0, 3);
}

export function BetTerritory({ data }: NodeProps & { data: BetTerritoryData }) {
  const {
    bet,
    cards,
    crew,
    configuration,
    altitude = "near",
    focusRole = "context",
    selectedWorkRef = null,
    selectedTeammateRefs = [],
    onSelectBet,
    onSelectWork,
    onToggleTeammate,
    onOpenWall,
  } = data;
  const involved = involvedRefs(bet, cards);
  const visibleCards = altitude === "middle" ? middleCards(cards, selectedWorkRef) : cards;

  if (altitude === "far") {
    return (
      <section
        className="workyard-territory workyard-territory-far"
        data-position={bet.position}
        data-focus-role={focusRole}
        aria-label={`${POSITION_LABEL[bet.position]}: ${bet.intent}`}
        title={bet.intent}
      >
        <Handle type="target" position={HandlePosition.Top} style={{ opacity: 0 }} />
        <Handle type="source" position={HandlePosition.Bottom} style={{ opacity: 0 }} />
        <span aria-hidden="true" />
        <strong>{bet.intent}</strong>
        <small>{cards.length ? `${cards.length} ${cards.length === 1 ? "workpiece" : "workpieces"}` : "Interpreting"}</small>
      </section>
    );
  }

  return (
    <section
      className={`workyard-territory workyard-territory-${altitude}`}
      data-position={bet.position}
      data-focus-role={focusRole}
      aria-label={`Work area: ${bet.intent}`}
    >
      <Handle type="target" position={HandlePosition.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={HandlePosition.Bottom} style={{ opacity: 0 }} />

      <header className="workyard-territory-header">
        <button
          type="button"
          className="workyard-territory-title nodrag nopan"
          onClick={(event) => { event.stopPropagation(); onSelectBet?.(bet.id); }}
          aria-label={`Target work: ${bet.intent}`}
        >
          <span>{bet.forkedFrom ? <GitFork aria-hidden="true" /> : null}{POSITION_LABEL[bet.position]}</span>
          <strong>{bet.intent}</strong>
        </button>
        <WorkAttribution
          ownerRefs={involved.slice(0, 1)}
          contributorRefs={involved.slice(1)}
          crew={crew}
          configuration={configuration}
          selectedRefs={selectedTeammateRefs}
          onToggleTeammate={onToggleTeammate}
        />
      </header>

      {visibleCards.length ? (
        <div className="workyard-territory-work" data-card-count={visibleCards.length}>
          {visibleCards.map((card) => (
            <WorkCard
              key={card.key}
              card={card}
              crew={crew}
              configuration={configuration}
              selectedTeammateRefs={selectedTeammateRefs}
              selected={Boolean(card.workRef && card.workRef === selectedWorkRef)}
              compact={altitude === "middle"}
              onSelect={() => card.workRef ? onSelectWork?.(bet.id, card.workRef) : onSelectBet?.(bet.id)}
              onOpenWall={card.wallItems.length && onOpenWall ? (itemId) => onOpenWall(itemId) : undefined}
              onToggleTeammate={onToggleTeammate}
            />
          ))}
          {altitude === "middle" && cards.length > visibleCards.length ? (
            <button
              type="button"
              className="workyard-territory-more nodrag nopan"
              onClick={(event) => { event.stopPropagation(); onSelectBet?.(bet.id); }}
            >
              {cards.length - visibleCards.length} more inside this work
            </button>
          ) : null}
        </div>
      ) : (
        <div className="workyard-territory-empty">
          <strong>No durable work yet</strong>
          <span>The area is real; the agent is still interpreting this direction.</span>
        </div>
      )}

      {altitude === "near" ? (
        <footer className="workyard-territory-footer">
          <span>{bet.configurationRevision ? `Formed under firm definition v${bet.configurationRevision}` : "No firm-definition receipt attached"}</span>
          <span>{bet.forkedFrom ? "Earlier direction remains attached" : "First attempt"}</span>
        </footer>
      ) : null}
    </section>
  );
}
