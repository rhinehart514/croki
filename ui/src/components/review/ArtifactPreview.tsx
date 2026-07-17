import { lazy, Suspense } from "react";
import "./review.css";

// Match message.tsx: Streamdown's markdown/diagram parser is substantial, so it loads only when an
// actual markdown artifact reaches this surface rather than on every review.
const LazyStreamdown = lazy(async () => {
  const module = await import("streamdown");
  return { default: module.Streamdown };
});

export interface ReviewArtifact {
  kind: "image" | "html" | "markdown" | "text";
  /** For image: the src (a data: URI or URL). */
  src?: string;
  /** For html/markdown/text: the raw content string. */
  content?: string;
  caption?: string;
}

/**
 * Render a produced artifact so the founder reviews the thing, not its description. image → <img>,
 * html → a sandboxed iframe with a visible Preview label, markdown → Streamdown, text → monospace
 * <pre> in a scroll container. Unknown or empty artifacts fall to a quiet empty state.
 */
export function ArtifactPreview({ artifact }: { artifact: ReviewArtifact }) {
  const { kind, src, content, caption } = artifact ?? {};

  if (kind === "image" && src) {
    return (
      <figure className="review-artifact">
        <img className="review-artifact-image" src={src} alt={caption ?? "Produced image artifact"} />
        {caption ? <figcaption className="review-artifact-caption">{caption}</figcaption> : null}
      </figure>
    );
  }

  if (kind === "html" && content) {
    return (
      <div className="review-artifact">
        <span className="review-artifact-label">Preview</span>
        <iframe
          className="review-artifact-frame"
          title={caption ?? "HTML preview"}
          sandbox=""
          srcDoc={content}
        />
        {caption ? <p className="review-artifact-caption">{caption}</p> : null}
      </div>
    );
  }

  if (kind === "markdown" && content) {
    return (
      <div className="review-artifact">
        <div className="review-artifact-markdown">
          <Suspense fallback={<pre className="review-artifact-text">{content}</pre>}>
            <LazyStreamdown>{content}</LazyStreamdown>
          </Suspense>
        </div>
        {caption ? <p className="review-artifact-caption">{caption}</p> : null}
      </div>
    );
  }

  if (kind === "text" && content) {
    return (
      <div className="review-artifact">
        <pre className="review-artifact-text">{content}</pre>
        {caption ? <p className="review-artifact-caption">{caption}</p> : null}
      </div>
    );
  }

  return <div className="review-empty">No preview is available for this artifact.</div>;
}
