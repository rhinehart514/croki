import { ArrowRight } from "lucide-react";
import type { FirmArchitectureElement } from "@/types";

export function MotionRoute({ motion, compact, active }: { motion: FirmArchitectureElement; compact: boolean; active: boolean }) {
  if (compact) return <span className="atlas-motion-route atlas-motion-route-compact" aria-hidden="true"><span>{motion.actor || "Someone"}</span><i /><ArrowRight /><span>{motion.value || "Value"}</span>{active ? <b>Active now</b> : null}</span>;
  return (
    <div className="atlas-motion-route" aria-hidden="true">
      <span>{motion.actor || "Someone"}</span>
      <i /><i /><i />
      <ArrowRight />
      <span>{motion.value || "Value"}</span>
    </div>
  );
}
