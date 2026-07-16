import { KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
const LEGEND = [
  { kind: "radius", label: "Radius", meaning: "Nearer the intent means less decision distance" },
  { kind: "sector", label: "Area", meaning: "Related work shares a concrete path to value" },
  { kind: "machinery", label: "Receipts", meaning: "Marks appear only for recorded actions, work, decisions, or returned evidence" },
  { kind: "wall", label: "Amber", meaning: "An outward action needs your hand" },
];

export function AtlasLegend({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? (
        <aside
          id="atlas-legend-panel"
          className="atlas-legend"
          aria-label="Canvas legend"
        >
          <header>
            <span className="atlas-legend-eyebrow">Canvas legend</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close legend" onClick={onClose}><X aria-hidden="true" /></Button>
          </header>
          <dl>
            {LEGEND.map((entry) => (
              <div key={entry.kind}>
                <dt><span className="atlas-legend-token" data-kind={entry.kind} aria-hidden="true" />{entry.label}</dt>
                <dd>{entry.meaning}</dd>
              </div>
            ))}
          </dl>
          <p className="atlas-legend-foot">Distance is the primary reading. Color never carries meaning alone.</p>
        </aside>
  ) : null;
}

export function AtlasLegendToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button type="button" variant="secondary" size="sm" aria-expanded={open} aria-controls={open ? "atlas-legend-panel" : undefined} onClick={onToggle}>
      <KeyRound aria-hidden="true" /> Legend
    </Button>
  );
}
