import type { FirmArchitectureElement, FirmArchitecturePressure } from "@/types";
import { ArrowRight } from "lucide-react";
import { CrewFace } from "@/components/crew/CrewFace";

export function CampaignPressure({
  campaign,
  pressure,
  compact,
  active,
  teammates,
  continuation,
}: {
  campaign: FirmArchitectureElement;
  pressure: FirmArchitecturePressure[];
  compact: boolean;
  active: boolean;
  teammates: Array<{ ref: string; name: string }>;
  continuation?: string | null;
}) {
  return (
    <div className="atlas-campaign-pressure" aria-hidden="true">
      <i className="atlas-campaign-bracket atlas-campaign-bracket-start" />
      {!compact || !pressure.length ? <span className={compact ? "atlas-campaign-audience-compact" : undefined}>{campaign.audience || "Bounded audience"}</span> : null}
      {pressure.length ? <b>{pressure.length}</b> : null}
      <i className="atlas-campaign-bracket atlas-campaign-bracket-end" />
      {active && continuation ? <em>{continuation} <ArrowRight /></em> : null}
      {active && teammates.length ? <span className="atlas-campaign-team"><span>{teammates.slice(0, 3).map((teammate) => <CrewFace key={teammate.ref} agentRef={teammate.ref} size={26} />)}</span><strong>{teammates.map((teammate) => teammate.name).join(" + ")}</strong></span> : null}
    </div>
  );
}
