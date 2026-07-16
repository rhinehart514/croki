import { LockKeyhole } from "lucide-react";
import { CrewFace } from "@/components/crew/CrewFace";
import type { ComposerTarget } from "./goalComposerTarget";

export function DirectionTargetChips({ target, locked }: { target: ComposerTarget; locked: boolean }) {
  return (
    <div className="firm-app-direction-target" aria-label="Direction target">
      <span className="firm-app-direction-target-path">
        <em>Venture</em>
        {target.theoryLabel ? <><i aria-hidden="true">›</i><strong title={target.theoryLabel}>{target.theoryLabel}</strong></> : null}
        {target.architectureLabel ? <><i aria-hidden="true">›</i><strong title={target.architectureLabel}>{target.architectureLabel}</strong></> : null}
        {target.betLabel ? <><i aria-hidden="true">›</i><em title={target.betLabel}>{target.betLabel}</em></> : null}
        {target.workLabel ? <><i aria-hidden="true">›</i><strong title={target.workLabel}>{target.workLabel}</strong></> : null}
      </span>
      {target.teammateRefs.map((ref, index) => (
        <span key={ref} className="firm-app-direction-target-person">
          <CrewFace agentRef={ref} size={20} />
          {target.teammateNames[index] ?? ref}
        </span>
      ))}
      {locked ? <LockKeyhole aria-label="Scope locked while you write" /> : null}
    </div>
  );
}
