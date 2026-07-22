import { X } from "lucide-react";
import type { VisualReference } from "@/api";

export function VisualStageHeader({ visual, onClose }: { visual: VisualReference; onClose: () => void }) {
  const kind = visual.kind === "model-view" ? "Product / GTM" : visual.kind;
  return <header className="visual-stage-header"><div><span>{kind}</span><h2>{visual.title}</h2></div><button type="button" aria-label="Close visual" onClick={onClose}><X aria-hidden="true" /></button></header>;
}
