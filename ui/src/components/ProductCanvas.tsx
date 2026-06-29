import { RefreshCw, Lightbulb } from "lucide-react";
import type { ProductModel, ProductModelEdit } from "@/types";
import { ConceptualLens } from "@/components/lenses/ConceptualLens";
import { JobsLens } from "@/components/lenses/JobsLens";
import { IaLens } from "@/components/lenses/IaLens";
import { WorkflowLens } from "@/components/lenses/WorkflowLens";
import { InteractionLens } from "@/components/lenses/InteractionLens";
import { CanvasShell, type LensDef, type LensProps } from "@/components/canvas/CanvasShell";

// ProductCanvas — the Product-mode SHELL, now a thin wrapper over the generic CanvasShell. The
// five-layer ProductModel derives once; this lets the founder look at it through five lenses without
// re-deriving. CanvasShell owns the switcher, the shared cross-lens selection, the empty state, and
// the lens frame; ProductCanvas supplies the five lenses, the product empty invitation, the
// grounding read-out, and the redraw/bridge actions. The Product surface renders identically to its
// pre-extraction form — the extraction is a pure refactor.
//
// Doctrine: this stays one calm tool, not five diagrams. green = derived, amber = guess, set by the
// shared ProvenanceTag. Default lens = Conceptual (the object graph).

// The Product lenses require onRevise; the generic LensProps makes it optional (a GTM lens never
// revises in place). CanvasShell always passes onRevise through for Product, so this adapter is safe
// to assert it — it just bridges the optional generic contract to the lens's required one.
type ProductLens = (props: {
  model: ProductModel;
  selected: string | null;
  onSelect: (id: string) => void;
  onRevise: (edit: ProductModelEdit) => void;
}) => React.ReactNode;

function adapt(Component: ProductLens): LensDef<ProductModel, ProductModelEdit>["Component"] {
  return (p: LensProps<ProductModel, ProductModelEdit>) =>
    Component({ model: p.model, selected: p.selected, onSelect: p.onSelect, onRevise: p.onRevise ?? (() => {}) });
}

const LENSES: LensDef<ProductModel, ProductModelEdit>[] = [
  { id: "conceptual", label: "Conceptual", Component: adapt(ConceptualLens) },
  { id: "jobs", label: "Goals & Jobs", Component: adapt(JobsLens) },
  { id: "ia", label: "IA", Component: adapt(IaLens) },
  { id: "workflow", label: "Workflows", Component: adapt(WorkflowLens) },
  { id: "interaction", label: "Interaction", Component: adapt(InteractionLens) },
];

// Lens metadata (id + label) for the command dock's switcher lives in the sibling
// `canvas/lens-meta.ts` (a non-component module) so this file only exports components and
// fast-refresh stays intact.

export function ProductCanvas({
  model, productName, busy, onDerive, onRevise, onExitToGtm, activeLensId, onLensChange, chromeless,
}: {
  model: ProductModel | null;
  productName: string;
  busy: boolean;
  onDerive: () => void;
  onRevise: (edit: ProductModelEdit) => void;
  onExitToGtm?: () => void;
  activeLensId?: string;
  onLensChange?: (id: string) => void;
  chromeless?: boolean;
}) {
  const isEmpty = !model || model.things.length === 0;

  // Empty — no picture yet. The whole point of Product mode is the picture; invite the founder to
  // draw the first draft from code before any lens has anything to show.
  const empty = (
    <div className="product-canvas-empty">
      <Lightbulb className="product-empty-icon" />
      <h2>No picture yet</h2>
      <p>
        Draw the first picture of <strong>{productName}</strong> — its core objects, how they
        relate, and what people come to do. It reads your code and hands you a draft to correct.
      </p>
      <button className="product-derive-btn" onClick={onDerive} disabled={busy} type="button">
        {busy
          ? <><RefreshCw className="spin" /> Reading the product…</>
          : <><Lightbulb /> Draw the picture</>}
      </button>
    </div>
  );

  const citedCount = model ? model.things.filter((t) => t.provenance === "derived").length : 0;
  const guessCount = model ? model.things.length - citedCount : 0;

  const meta = model && (
    <>
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
    </>
  );

  const actions = (
    <>
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
    </>
  );

  return (
    <CanvasShell<ProductModel, ProductModelEdit>
      model={(model ?? { things: [] }) as ProductModel}
      lenses={LENSES}
      defaultLensId="conceptual"
      layoutId="product-lens"
      isEmpty={isEmpty}
      empty={empty}
      meta={meta}
      actions={actions}
      onRevise={onRevise}
      activeLensId={activeLensId}
      onLensChange={onLensChange}
      chromeless={chromeless}
    />
  );
}
