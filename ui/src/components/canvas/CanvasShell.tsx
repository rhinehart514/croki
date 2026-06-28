import { useState } from "react";
import { SlidingTabs } from "@/components/SlidingTabs";

// CanvasShell — the ONE generic canvas engine. It renders a projection over an object model through
// lenses: a switcher up top, a single cross-lens selection that persists as you switch lenses, an
// empty frame, and the lens frame that the active lens draws into. It owns NO model and NO drawing —
// it is the chrome and the routing. Product mode and GTM mode both instantiate it; the only thing
// that differs is the object model and the set of lenses projected over it.
//
// Doctrine (carried over from the original Product-mode shell): this stays one calm tool, not N
// diagrams. The switcher is the quiet SlidingTabs; the shell adds no color of its own. A lens reads
// the SAME model and shares ONE selected-id, so touching an object in one lens stays lit in another.

export type LensProps<TModel, TEdit> = {
  model: TModel;
  selected: string | null;
  onSelect: (id: string) => void;
  // Optional — a read-only lens (e.g. GTM channel-flow) never revises the model in place; an
  // editable lens (the Product lenses) wires this through to its in-canvas editors.
  onRevise?: (edit: TEdit) => void;
};

export type LensDef<TModel, TEdit> = {
  id: string;
  label: string;
  Component: (props: LensProps<TModel, TEdit>) => React.ReactNode;
};

export type CanvasShellProps<TModel, TEdit> = {
  model: TModel;
  lenses: LensDef<TModel, TEdit>[];
  defaultLensId: string;
  // Must be unique per shell instance — it's the SlidingTabs shared element Motion springs between.
  // Product mode and GTM mode pass different ids so their pills never animate into each other.
  layoutId: string;
  isEmpty: boolean;
  empty: React.ReactNode;
  // The grounding read-out (cited/guess counts, version) — rendered inside the lens bar's meta slot.
  meta?: React.ReactNode;
  // Redraw / bridge buttons — rendered inside the lens bar's actions slot (or, when chromeless, a slim
  // floating overlay so they aren't lost).
  actions?: React.ReactNode;
  onRevise?: (edit: TEdit) => void;
  // Controlled lens — when provided, the single command dock owns the switcher (one bar, not two).
  // Omit both to keep the shell's own internal switcher (uncontrolled fallback).
  activeLensId?: string;
  onLensChange?: (id: string) => void;
  // Chromeless — the dock renders the lens switcher, so the shell drops its own lens-bar. Everything
  // stays on the one canvas; only the meta/actions float as a slim overlay.
  chromeless?: boolean;
};

export function CanvasShell<TModel, TEdit>({
  model, lenses, defaultLensId, layoutId, isEmpty, empty, meta, actions, onRevise,
  activeLensId, onLensChange, chromeless,
}: CanvasShellProps<TModel, TEdit>) {
  const [internalLens, setInternalLens] = useState<string>(defaultLensId);
  const lens = activeLensId ?? internalLens;
  const setLens = onLensChange ?? setInternalLens;
  // The shared cross-lens selection. An object id touched in one lens stays selected in another.
  const [selected, setSelected] = useState<string | null>(null);

  // Empty — no picture yet. The host supplies the invitation to draw the first one.
  if (isEmpty) return <>{empty}</>;

  const Active = (lenses.find((l) => l.id === lens) ?? lenses[0]).Component;

  return (
    <div className={`product-canvas product-canvas-shell${chromeless ? " chromeless" : ""}`}>
      {/* Lens bar — only when the shell owns its switcher. When chromeless, the command dock carries
          the lenses (one dock, no second bar) and only the meta/actions float as a slim overlay. */}
      {!chromeless ? (
        <div className="lens-bar">
          <SlidingTabs
            items={lenses.map((l) => ({ value: l.id, label: l.label }))}
            value={lens}
            onChange={setLens}
            layoutId={layoutId}
            size="sm"
          />
          {meta && <div className="lens-bar-meta">{meta}</div>}
          {actions && <div className="lens-bar-actions">{actions}</div>}
        </div>
      ) : (meta || actions) ? (
        <div className="lens-overlay-meta">
          {meta}
          {actions}
        </div>
      ) : null}

      {/* The active lens. It fills the rest of the frame; the lens owns its own canvas/panels. */}
      <div className="lens-frame">
        <Active model={model} selected={selected} onSelect={setSelected} onRevise={onRevise} />
      </div>
    </div>
  );
}
