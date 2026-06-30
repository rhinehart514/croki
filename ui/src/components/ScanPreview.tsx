import { ArrowRight, Check, EyeOff, FileCode2, Layers, ScanSearch, Target } from "lucide-react";
import type { ScanPreview as ScanPreviewData } from "@/types";

// What the product learned about your code, shown before you commit a goal. The pitch is "it knows
// your product" — this is where that becomes visible: the headline it read, the stack it detected,
// the win event it found WITH the file:line that proves it, and an honest callout when attribution
// is blind. The founder reads this, then confirms and gives the goal. Everything here is real scan
// output; an empty field reads honestly ("not detected") rather than faking confidence.
export function ScanPreview({
  repoPath,
  report,
  busy,
  onConfirm,
  onRescan,
}: {
  repoPath: string;
  report: ScanPreviewData;
  busy: boolean;
  onConfirm: () => void;
  onRescan: () => void;
}) {
  const stack = report.stack?.filter(Boolean) ?? [];
  // Tolerate both the new front-door shape (winEvent: string) and the legacy rich ScanReport shape
  // (winEvent: { name, found, citations }) the old /api/scan returned, so the preview never crashes
  // if the parallel backend hasn't cut over yet.
  const rawWin = report.winEvent as unknown;
  const winEvent = typeof rawWin === "string"
    ? rawWin.trim() || null
    : (rawWin && typeof rawWin === "object" && "name" in rawWin
        ? String((rawWin as { name?: unknown }).name ?? "").trim() || null
        : null);
  const legacyCites = (rawWin && typeof rawWin === "object" && "citations" in rawWin
    ? (rawWin as { citations?: unknown }).citations
    : undefined);
  const evidence = (report.winEventEvidence ?? (Array.isArray(legacyCites) ? legacyCites : []))
    .filter((c): c is NonNullable<typeof c> => !!c && typeof c === "object" && "file" in c);
  const blind = report.blindAttribution?.blind === true;

  return (
    <div className="scan-preview">
      <div className="scan-preview-head">
        <span className="scan-preview-eyebrow"><ScanSearch size={14} /> What it read in your product</span>
        <h2 className="scan-preview-headline">{report.headline?.trim() || "Read your code, but couldn't summarize it yet."}</h2>
        {report.productLine?.trim() ? <p className="scan-preview-line">{report.productLine.trim()}</p> : null}
        <p className="scan-preview-repo"><FileCode2 size={12} /> {repoPath}</p>
      </div>

      <div className="scan-preview-facts">
        <section className="scan-preview-fact">
          <span className="scan-preview-fact-label"><Layers size={13} /> Stack</span>
          {stack.length ? (
            <div className="scan-preview-chips">
              {stack.map((tech) => <span className="scan-preview-chip" key={tech}>{tech}</span>)}
            </div>
          ) : <span className="scan-preview-empty">No stack detected.</span>}
        </section>

        <section className="scan-preview-fact">
          <span className="scan-preview-fact-label"><Target size={13} /> Win event</span>
          {winEvent ? (
            <>
              <code className="scan-preview-win">{winEvent}</code>
              {evidence.length ? (
                <ul className="scan-preview-evidence">
                  {evidence.map((cite, i) => (
                    <li key={`${cite.file}:${cite.line}:${i}`}>
                      <span className="scan-preview-cite-file">{cite.file}:{cite.line}</span>
                      {cite.text ? <span className="scan-preview-cite-text">{cite.text}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : <span className="scan-preview-empty">Found the event, but no line citation.</span>}
            </>
          ) : <span className="scan-preview-empty">No win event detected. You can name one on the next step.</span>}
        </section>

        {blind ? (
          <section className="scan-preview-blind">
            <span className="scan-preview-blind-label"><EyeOff size={13} /> Attribution is blind</span>
            <p>{report.blindAttribution?.reason?.trim()
              || "The win event fires, but nothing in the code records where it came from — so this product can't yet tell which pipeline earned a win. That's a real gap, not a bug in the scan."}</p>
          </section>
        ) : null}
      </div>

      <div className="scan-preview-actions">
        <button className="scan-preview-confirm" disabled={busy} onClick={onConfirm} type="button">
          {busy ? "Reading…" : <>This is my product <ArrowRight size={15} /></>}
        </button>
        <button className="scan-preview-rescan" disabled={busy} onClick={onRescan} type="button">
          Pick a different folder
        </button>
      </div>
      <p className="scan-preview-foot"><Check size={12} /> Read-only scan. Nothing changed in your code, nothing sends.</p>
    </div>
  );
}
