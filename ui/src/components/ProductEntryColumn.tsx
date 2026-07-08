import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import type { ProductModel } from "@/types";
import "@/styles/product-entry.css";

// ProductEntryColumn — the product's truth, pinned to the LEFT EDGE of the GTM canvas as the place
// wins come from. It makes the product visibly present on the same surface as the go-to-market work,
// so the flow reads left-to-right OUT of it: this is where a real win originates, and everything to
// the right is how you go get more of them. Plain English only — the founder never sees code.
//
// FIRST PASS: this is a left-edge anchor over the canvas, not a full merge of the separate Product
// canvas into one coordinate space. It surfaces the product's real entry points (the things people do
// that count as a win) and opens the full product picture on demand. Folding the whole Product canvas
// into these coordinates is the follow-up.
export function ProductEntryColumn({
  productName,
  model,
  onOpenFull,
  deriving = false,
  onReread,
}: {
  productName: string;
  model: ProductModel | null;
  // Optionally open a deeper product view. When omitted, the "full picture" button is hidden — the
  // product's understanding now lives on the main canvas, so there's no separate screen to open.
  onOpenFull?: () => void;
  // True while the crew is reading the product in the background (right after a scan, or on a manual
  // re-read). Shows a live "reading your product…" state so an empty panel never reads as a dead void.
  deriving?: boolean;
  // Manually re-read the product — an explicit refresh of the picture. Hidden when not supplied.
  onReread?: () => void;
}) {
  const [open, setOpen] = useState(true);

  // The column is an absolute overlay pinned to the canvas's left edge (mounted as a sibling of the
  // canvas, so it can't reserve space by layout). Publish the gutter it currently occupies as a CSS
  // variable on the document root; the GTM canvas panes read it and pad their left edge by exactly this
  // much, so no node ever renders under the column and it never steals a node's click. Expanded ≈ the
  // 246px panel + its flow-out cue; collapsed ≈ the thin spine tab. Cleared on unmount (e.g. switching to
  // the Product view) so the canvas reclaims the full width.
  useEffect(() => {
    const gutter = open ? "300px" : "64px";
    document.documentElement.style.setProperty("--pentry-gutter", gutter);
    return () => { document.documentElement.style.removeProperty("--pentry-gutter"); };
  }, [open]);

  const goals = model?.userGoals ?? [];
  const things = model?.things ?? [];
  // A win enters where a real person accomplishes something. Prefer the user goals (who does what);
  // fall back to the product's key things when goals haven't been derived yet.
  const entries = goals.length
    ? goals.slice(0, 4).map((g) => ({ title: g.goal, sub: g.actor }))
    : things.slice(0, 4).map((t) => ({ title: t.name, sub: t.summary }));
  const hasModel = entries.length > 0;

  if (!open) {
    return (
      <button
        type="button"
        className="pentry-tab"
        onClick={() => setOpen(true)}
        aria-label="Show where wins enter"
        title="Where wins enter"
      >
        <ChevronRight size={14} />
        <span className="pentry-tab-label">Where wins enter</span>
      </button>
    );
  }

  return (
    <aside className="pentry" aria-label="Product — where wins enter">
      <div className="pentry-head">
        <div className="pentry-head-text">
          <span className="pentry-kicker">Where wins enter</span>
          <strong className="pentry-name" title={productName}>{productName}</strong>
        </div>
        <button
          type="button"
          className="pentry-collapse"
          onClick={() => setOpen(false)}
          aria-label="Collapse"
          title="Collapse"
        >
          <ChevronLeft size={15} />
        </button>
      </div>

      {hasModel ? (
        <ul className="pentry-list">
          {entries.map((e, i) => (
            <li key={i} className="pentry-item">
              <span className="pentry-item-dot" aria-hidden="true" />
              <span className="pentry-item-text">
                <span className="pentry-item-title">{e.title}</span>
                {e.sub ? <span className="pentry-item-sub">{e.sub}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : deriving ? (
        <div className="pentry-reading" role="status">
          <Loader2 className="pentry-reading-spin" size={15} aria-hidden="true" />
          <span>Reading your product… mapping where real wins come from.</span>
        </div>
      ) : (
        <p className="pentry-empty">
          Point Drover at your product and it maps where real wins come from — then your go-to-market
          flows out from here.
        </p>
      )}

      {onOpenFull ? (
        <button type="button" className="pentry-open" onClick={onOpenFull}>
          {hasModel ? "Open the full product picture" : "Read my product"}
          <ArrowRight size={13} />
        </button>
      ) : null}

      {/* Manual re-read — an explicit refresh of the picture when the founder wants the crew to look
          again (after shipping something, or if the auto-read hasn't filled it in). Quiet by default. */}
      {onReread ? (
        <button
          type="button"
          className="pentry-reread"
          onClick={onReread}
          disabled={deriving}
          title="Read the product again"
        >
          <RefreshCw size={11} className={deriving ? "pentry-reading-spin" : undefined} />
          {deriving ? "Reading…" : hasModel ? "Re-read product" : "Read it now"}
        </button>
      ) : null}

      {/* The flow-out cue: go-to-market reads to the RIGHT of the product, so the canvas visibly grows
          out of it. Decorative — the real edges live on the canvas nodes. */}
      <span className="pentry-flow" aria-hidden="true">
        <span className="pentry-flow-line" />
        <ArrowRight className="pentry-flow-arrow" size={14} />
      </span>
    </aside>
  );
}
