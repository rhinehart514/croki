import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { AtlasNode } from "./atlasTypes";
import { ORBIT_CENTER, ORBIT_FIELD_SIZE, ORBIT_RADII } from "./atlasOrbitLayout";

function point(angle: number, radius: number) {
  const radians = angle * Math.PI / 180;
  return { x: ORBIT_CENTER.x + Math.cos(radians) * radius, y: ORBIT_CENTER.y + Math.sin(radians) * radius };
}

function arcPath(start: number, end: number, radius: number) {
  const a = point(start, radius);
  const b = point(end, radius);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

function AtlasOrbitFieldView({ data }: NodeProps<AtlasNode>) {
  const sectors = data.sectors ?? [];
  return (
    <div className="atlas-orbit-field" data-atlas-kind="orbit-field" aria-hidden="true">
      <svg viewBox={`0 0 ${ORBIT_FIELD_SIZE.width} ${ORBIT_FIELD_SIZE.height}`}>
        {Object.entries(ORBIT_RADII).map(([band, radius]) => <circle key={band} className="atlas-orbit-ring" data-band={band} cx={ORBIT_CENTER.x} cy={ORBIT_CENTER.y} r={radius} />)}
        {sectors.map((sector) => {
          const spoke = point(sector.startAngle, 510);
          const label = point((sector.startAngle + sector.endAngle) / 2, 330);
          return <g key={sector.id}><line className="atlas-sector-spoke" x1={ORBIT_CENTER.x} y1={ORBIT_CENTER.y} x2={spoke.x} y2={spoke.y} /><text className="atlas-sector-label" data-hemisphere={label.y < ORBIT_CENTER.y ? "upper" : "lower"} x={label.x} y={label.y}>{sector.label}</text></g>;
        })}
        <path className="atlas-wall-arc" d={arcPath(-54, 54, 520)} />
      </svg>
      <div className="atlas-radius-labels">
        <span data-band="near-intent">Near intent</span>
        <span data-band="drifting">Drifting</span>
        <span data-band="approaching-wall">Needs a decision soon</span>
        <span data-band="settled">Evidence returned</span>
      </div>
    </div>
  );
}

export const AtlasOrbitField = memo(AtlasOrbitFieldView);
