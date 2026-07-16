import type { ArchitectureRole, FirmArchitectureElement } from "@/types";
import type { ArchitectureProposalGhostScene } from "../architectureProposalProjection";

const ROLE_LABELS: Record<ArchitectureRole, string> = {
  concept: "Open thought",
  "product-loop": "Product loop",
  system: "Shared capability",
  motion: "Route",
  campaign: "Campaign",
};

const CHANGE_LABELS = {
  create: "Proposed",
  update: "Revised",
  "change-role": "Role change",
  remove: "Removed",
} as const;

function roleDetails(element: FirmArchitectureElement) {
  if (element.role === "product-loop") {
    return [element.actor, element.entry && element.value ? `${element.entry} → ${element.value}` : null]
      .filter(Boolean).join(" · ");
  }
  if (element.role === "system") return element.does ?? null;
  if (element.role === "motion") {
    return [element.actor, element.entry && element.value ? `${element.entry} → ${element.value}` : null]
      .filter(Boolean).join(" · ");
  }
  if (element.role === "campaign") {
    return [element.audience, element.objective].filter(Boolean).join(" · ");
  }
  return element.statement ?? null;
}

export function ProposalGhostScene({ scene }: { scene: ArchitectureProposalGhostScene }) {
  const hasRelationships = scene.connections.length || scene.groups.length || scene.evidence.length;
  return (
    <section className="atlas-proposal-ghost" aria-label="Proposed architecture changes">
      {scene.proposedIntent ? (
        <div className="atlas-proposal-intent-change">
          <span>Venture intent · proposed</span>
          <strong>{scene.proposedIntent.statement}</strong>
          {scene.proposedIntent.constraints?.length ? (
            <small>{scene.proposedIntent.constraints.join(" · ")}</small>
          ) : null}
        </div>
      ) : null}

      {scene.elements.length ? (
        <ol className="atlas-proposal-objects">
          {scene.elements.map((entry) => {
            const details = roleDetails(entry.element);
            return (
              <li key={entry.id} data-role={entry.role} data-change={entry.change}>
                <div>
                  <span>{ROLE_LABELS[entry.role]}</span>
                  <em>{CHANGE_LABELS[entry.change]}</em>
                </div>
                <strong>{entry.name}</strong>
                {entry.element.statement && entry.element.statement !== details ? <p>{entry.element.statement}</p> : null}
                {details ? <small>{details}</small> : null}
                {entry.role === "motion" && entry.element.repeatabilityClaim ? (
                  <p>{entry.element.repeatabilityClaim}</p>
                ) : null}
                {entry.role === "campaign" && entry.element.measurement ? (
                  <p>{[entry.element.measurement.observation, entry.element.measurement.window].filter(Boolean).join(" · ")}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {hasRelationships ? (
        <div className="atlas-proposal-relationships">
          {scene.connections.map((entry) => (
            <p key={entry.id} data-change={entry.change}>
              <span>{CHANGE_LABELS[entry.change]}</span>
              <b>{entry.connection.fromRef}</b>
              <i>→</i>
              <b>{entry.connection.toRef}</b>
              <em>{entry.connection.label} · {entry.connection.assertion}</em>
            </p>
          ))}
          {scene.groups.map((entry) => (
            <p key={entry.id} data-change={entry.change}>
              <span>{CHANGE_LABELS[entry.change]} group</span>
              <b>{entry.group.name}</b>
              <em>{entry.group.memberRefs.join(" · ")}</em>
            </p>
          ))}
          {scene.evidence.map((entry) => (
            <p key={entry.id} data-change={entry.change}>
              <span>{entry.change === "create" ? "Applied evidence" : "Removed evidence"}</span>
              <b>{entry.evidence.subjectRef}</b>
              <em>{entry.evidence.stance} · {entry.evidence.evidenceRef}</em>
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
