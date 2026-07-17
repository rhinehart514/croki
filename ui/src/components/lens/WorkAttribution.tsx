import { CrewFace } from "@/components/crew/CrewFace";
import type { FirmConfiguration, FirmCrewMember } from "@/types";
import { participantName } from "./workyardProjection";

const VISIBLE_FACES = 4;

export function WorkAttribution({
  ownerRefs,
  contributorRefs,
  crew,
  configuration,
  selectedRefs = [],
  onToggleTeammate,
}: {
  ownerRefs: string[];
  contributorRefs: string[];
  crew: FirmCrewMember[];
  configuration?: FirmConfiguration;
  selectedRefs?: string[];
  onToggleTeammate?: (ref: string) => void;
}) {
  const owners = [...new Set(ownerRefs)];
  const contributors = [...new Set(contributorRefs)].filter((ref) => !owners.includes(ref));
  const all = [...owners, ...contributors];
  const ownerNames = owners.map((ref) => participantName(ref, crew, configuration));
  const contributorNames = contributors.map((ref) => participantName(ref, crew, configuration));
  const label = [
    ownerNames.length ? `Owned by ${ownerNames.join(", ")}` : "No owner attributed",
    contributorNames.length ? `${contributorNames.join(", ")} contributed` : null,
  ].filter(Boolean).join("; ");

  if (!all.length) return <span className="workyard-attribution-empty">No agent attributed</span>;

  return (
    <div className="workyard-attribution" aria-label={label}>
      <div className="workyard-attribution-faces">
        {all.slice(0, VISIBLE_FACES).map((ref, index) => {
          const face = <CrewFace agentRef={ref} size={24} />;
          return onToggleTeammate ? (
            <button
              key={ref}
              type="button"
              className="nodrag nopan"
              data-owner={index < owners.length ? "true" : "false"}
              aria-pressed={selectedRefs.includes(ref)}
              onClick={(event) => { event.stopPropagation(); onToggleTeammate(ref); }}
              aria-label={`${selectedRefs.includes(ref) ? "Remove" : "Add"} ${participantName(ref, crew, configuration)} ${selectedRefs.includes(ref) ? "from" : "to"} this direction`}
            >
              {face}
            </button>
          ) : <span key={ref} data-owner={index < owners.length ? "true" : "false"}>{face}</span>;
        })}
        {all.length > VISIBLE_FACES ? <em>+{all.length - VISIBLE_FACES}</em> : null}
      </div>
      <span>{ownerNames[0] ?? contributorNames[0]}</span>
      {contributors.length ? <small>{contributors.length === 1 ? "1 contributor" : `${contributors.length} contributors`}</small> : null}
    </div>
  );
}
