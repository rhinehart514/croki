import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { AtlasNode } from "./atlasTypes";

function ArchitectureGroupView({ data, id, selected }: NodeProps<AtlasNode>) {
  const isSelected = Boolean(selected || data.selected);
  return (
    <section className="atlas-group" data-atlas-kind="group" data-atlas-id={id} data-selected={isSelected ? "true" : "false"}>
      <button type="button" onClick={() => data.onSelect(id)} onDoubleClick={() => data.onFocus(id)}>
        <strong>{data.title}</strong>
        {data.altitude !== "venture" && data.statement ? <span>{data.statement}</span> : null}
      </button>
    </section>
  );
}

export const ArchitectureGroup = memo(ArchitectureGroupView);
