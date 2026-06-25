import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductModel, ProductModelEdit } from "@/types";
import { ConceptualLens } from "@/components/lenses/ConceptualLens";
import { JobsLens } from "@/components/lenses/JobsLens";
import { IaLens } from "@/components/lenses/IaLens";
import { WorkflowLens } from "@/components/lenses/WorkflowLens";
import { InteractionLens } from "@/components/lenses/InteractionLens";

// ProductCanvas — the Product-mode SHELL. The five-layer ProductModel derives once; this shell lets
// the founder look at it through five lenses without re-deriving. Each lens reads the SAME model and
// shares ONE selected-id, so touching an object in one lens stays lit when you switch to another.
// The shell owns the switcher, that shared selection, the empty state, and the derive/redraw
// handlers; the active lens owns the drawing. Default lens = Conceptual (the object graph).
//
// Doctrine: this stays one calm tool, not five diagrams. The switcher is a quiet segmented control;
// provenance, cards, and panel chrome are shared primitives the lenses import. The shell adds no
// color of its own — green = derived, amber = guess, set by the shared ProvenanceTag.

type LensProps = {
  model: ProductModel;
  selected: string | null;
  onSelect: (id: string) => void;
  onRevise: (edit: ProductModelEdit) => void;
};

type LensId = "conceptual" | "jobs" | "ia" | "workflow" | "interaction";

const LENSES: Array<{
  id: LensId;
  label: string;
  Component: (props: LensProps) => React.ReactNode;
}> = [
  { id: "conceptual", label: "Conceptual", Component: ConceptualLens },
  { id: "jobs", label: "Goals & Jobs", Component: JobsLens },
  { id: "ia", label: "IA", Component: IaLens },
  { id: "workflow", label: "Workflows", Component: WorkflowLens },
  { id: "interaction", label: "Interaction", Component: InteractionLens },
];

export function ProductCanvas({
  model, productName, busy, onDerive, onRevise, onExitToGtm,
}: {
  model: ProductModel | null;
  productName: string;
  busy: boolean;
  onDerive: () => void;
  onRevise: (edit: ProductModelEdit) => void;
  onExitToGtm?: () => void;
}) {
  const [lens, setLens] = useState<LensId>("conceptual");
  // The shared cross-lens selection. An object id touched in one lens stays selected in another.
  const [selected, setSelected] = useState<string | null>(null);

  // Empty — no picture yet. The whole point of Product mode is the picture; invite the founder to
  // draw the first draft from code before any lens has anything to show.
  if (!model || model.things.length === 0) {
    return (
      <div className="product-canvas-empty">
        <Sparkles className="product-empty-icon" />
        <h2>No picture yet</h2>
        <p>
          Draw the first picture of <strong>{productName}</strong> — its core objects, how they
          relate, and what people come to do. It reads your code and hands you a draft to correct.
        </p>
        <button className="product-derive-btn" onClick={onDerive} disabled={busy} type="button">
          {busy
            ? <><RefreshCw className="spin" /> Reading the product…</>
            : <><Sparkles /> Draw the picture</>}
        </button>
      </div>
    );
  }

  const Active = LENSES.find((l) => l.id === lens)!.Component;

  const citedCount = model.things.filter((t) => t.provenance === "derived").length;
  const guessCount = model.things.length - citedCount;

  return (
    <div className="product-canvas product-canvas-shell">
      {/* Lens bar — the switcher + the grounding read-out + the redraw / bridge actions. Docks to
          the top; on mobile it stacks and scrolls horizontally instead of floating off-screen. */}
      <div className="lens-bar">
        <div className="lens-switcher" role="tablist" aria-label="Product lens">
          {LENSES.map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={lens === l.id}
              className={cn("lens-tab", lens === l.id && "active")}
              onClick={() => setLens(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="lens-bar-meta">
          <span className="product-head-meta">
            v{model.version} · {model.generatedBy === "claude" ? "drawn from code" : model.generatedBy}
          </span>
          <span className="product-count product-count-cited" title="Objects grounded in real code">
            {citedCount} cited
          </span>
          {guessCount > 0 && (
            <span className="product-count product-count-guess" title="Objects that are interpretive guesses">
              {guessCount} guess{guessCount === 1 ? "" : "es"}
            </span>
          )}
        </div>

        <div className="lens-bar-actions">
          <button
            className="product-rederive-btn"
            onClick={onDerive}
            disabled={busy}
            type="button"
            title="Redraw the picture from the product code"
          >
            {busy ? <RefreshCw className="spin" /> : <RefreshCw />} {busy ? "Redrawing…" : "Redraw"}
          </button>
          {onExitToGtm && (
            <button
              className="lens-bridge"
              onClick={onExitToGtm}
              type="button"
              title="Switch to GTM mode — your channels are grounded in this picture"
            >
              This grounds your go-to-market
            </button>
          )}
        </div>
      </div>

      {/* The active lens. It fills the rest of the frame; the lens owns its own canvas/panels. */}
      <div className="lens-frame">
        <Active model={model} selected={selected} onSelect={setSelected} onRevise={onRevise} />
      </div>
    </div>
  );
}
