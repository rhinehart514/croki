import { X } from "lucide-react";
import type { VisualReference } from "@/api";

export function VisualStageHeader({ visual, onClose }: { visual: VisualReference; onClose: () => void }) {
  const kind = visual.kind === "model-view" ? "Canvas" : visual.kind;
  return <header className="visual-stage-header"><div><span>{`Review · ${kind}`}</span><h2>{visual.title}</h2></div><button type="button" aria-label="Close Review" onClick={onClose}><X aria-hidden="true" /></button></header>;
}
