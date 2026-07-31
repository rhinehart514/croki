import type { CanvasProjection, LabNode } from "./model";

export interface CanvasRendererProps {
  readonly projection: CanvasProjection;
  readonly selectedId: string | null;
  readonly onSelect: (node: LabNode | null) => void;
}
