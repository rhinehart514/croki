import type { ContextManifest } from "@/types";

// What Claude reads, folded into the dock. The grounding, the product picture, and the bloomed
// ideas used to be mystery buttons on a far rail; here they sit one line under the dock
// header as "Reading: <providers> · 5/5", so the founder can see the model's footing and reach
// the two deeper views inline. Presentational only — the host opens each view via the callbacks.
export function DockContext({
  contextManifest,
  onOpenGrounding,
  onOpenPicture,
  onIdeate,
}: {
  contextManifest: ContextManifest | null;
  onOpenGrounding: () => void;
  onOpenPicture: () => void;
  onIdeate: () => void;
}) {
  const providers = contextManifest?.providers ?? [];
  const total = providers.length;
  const contributing =
    contextManifest?.contributingProviders ??
    providers.filter((p) => p.contributed).length;

  return (
    <div className="dctx" role="group" aria-label="What Claude reads">
      <button
        className="dctx-reading"
        onClick={onOpenGrounding}
        type="button"
        title="Open product grounding — what Claude reads about your product"
      >
        <span className="dctx-label">Reading</span>
        {total > 0 ? (
          // A calm summary, not a row of truncated pills: "● 5/5 sources". The per-provider
          // breakdown lives one click away in the grounding view (this button opens it).
          <span className="dctx-summary" title={`${contributing} of ${total} sources contributing — ${providers.map((p) => p.name).join(", ")}`}>
            <span className={`dctx-dot ${contributing > 0 ? "on" : "off"}`} aria-hidden="true" />
            <span className="dctx-count">{contributing}/{total}</span>
            <span className="dctx-sources">sources</span>
          </span>
        ) : (
          <span className="dctx-empty">nothing grounded yet</span>
        )}
      </button>

      <span className="dctx-actions">
        <button className="dctx-action" onClick={onOpenPicture} type="button">
          Product picture
        </button>
        <span className="dctx-action-sep" aria-hidden="true" />
        <button className="dctx-action" onClick={onIdeate} type="button">
          Ideate pipelines
        </button>
      </span>
    </div>
  );
}
