import type { CrokiCanvasProps } from "./crokiCanvasProps";
import { CrokiTrueCanvas } from "./CrokiTrueCanvas";

export type { CrokiCanvasProps } from "./crokiCanvasProps";

export function CrokiCanvas(props: CrokiCanvasProps) {
  return <CrokiTrueCanvas {...props} />;
}
