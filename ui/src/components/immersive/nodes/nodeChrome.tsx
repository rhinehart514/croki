// Shared paper-card frame for immersive world nodes. Owns the provisional (dashed/desaturated),
// needs-your-hand (amber), focus, and semantic-zoom-band visuals so the individual archetypes stay
// unaware of state sequencing (mirrors how the legacy atlas centralizes the materializing class).
// Color is hard-rationed by the CSS: green = living, amber = needs-your-hand only. Crew face helpers
// live in nodeCrew.ts (re-exported here for the archetypes that import from this module).
import type { ReactNode } from "react";
import { useSemanticZoom } from "../world/useSemanticZoom";
import type { AtlasNodeData } from "@/components/atlas/atlasTypes";

export function NodeChrome({
  data,
  children,
  className,
}: {
  data: AtlasNodeData;
  children: ReactNode;
  className?: string;
}) {
  const band = useSemanticZoom();
  return (
    <div
      className={`iw-node${className ? ` ${className}` : ""}`}
      data-band={band}
      data-provisional={data.provisional ? "true" : "false"}
      data-focus={data.focusRole}
      data-at-gate={data.atWall ? "true" : "false"}
    >
      {children}
    </div>
  );
}
