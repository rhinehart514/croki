import { VisualMemo } from "./VisualMemo";
import type { ArtifactSectionFocus } from "./artifactSectionFocus";
import "./review.css";

export interface ReviewArtifact {
  kind: "image" | "html" | "markdown" | "text" | "code";
  /** For image: the src (a data: URI or URL). */
  src?: string;
  /** For html/markdown/text: the raw content string. */
  content?: string;
  caption?: string;
}

/**
 * Render a produced artifact so the founder reviews the thing, not its description. image → <img>,
 * html → a sandboxed iframe, prose → a normalized editorial document, code → monospace. Unknown or
 * empty artifacts fall to a quiet empty state.
 */
export function ArtifactPreview({ artifact, artifactRef, artifactAt, focusedSectionId, onFocusSection }: {
  artifact: ReviewArtifact;
  artifactRef?: string;
  artifactAt?: string | null;
  focusedSectionId?: string | null;
  onFocusSection?: (focus: ArtifactSectionFocus) => void;
}) {
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

  if ((kind === "markdown" || kind === "text") && content) {
    return <VisualMemo content={content} title={caption} artifactRef={artifactRef} artifactAt={artifactAt} focusedSectionId={focusedSectionId} onFocusSection={onFocusSection} />;
  }

  if (kind === "code" && content) {
    return (
      <div className="review-artifact">
        <pre className="review-artifact-text">{content}</pre>
        {caption ? <p className="review-artifact-caption">{caption}</p> : null}
      </div>
    );
  }

  return <div className="review-empty">No preview is available for this artifact.</div>;
}
