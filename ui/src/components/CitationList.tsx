import { FileCode2 } from "lucide-react";
import type { Citation } from "@/types";

export function CitationList({
  citations,
  compact = false,
}: {
  citations: Citation[];
  compact?: boolean;
}) {
  if (citations.length === 0) {
    return <p className="empty-copy">No code citation proves this yet.</p>;
  }

  return (
    <div className="citation-list">
      {citations.map((citation, index) => (
        <div className="citation" key={`${citation.file}:${citation.line}:${index}`}>
          <div className="citation-location">
            <FileCode2 aria-hidden="true" />
            <span>{citation.file}:{citation.line}</span>
          </div>
          {!compact && <code>{citation.text}</code>}
        </div>
      ))}
    </div>
  );
}
