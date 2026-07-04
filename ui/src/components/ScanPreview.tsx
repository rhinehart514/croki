import { ArrowRight, Check } from "lucide-react";
import type { ScanPreview as ScanPreviewData } from "@/types";
import { ProductReadout, type ProductEvidence } from "@/components/ProductReadout";

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
  const evidence = ((report.winEventEvidence ?? (Array.isArray(legacyCites) ? legacyCites : [])) as ProductEvidence[])
    .filter((c): c is ProductEvidence => !!c && typeof c === "object" && "file" in c);

  return (
    <div className="scan-preview">
      <ProductReadout
        data={{
          headline: report.headline,
          productLine: report.productLine,
          repoPath,
          stack,
          // Onboarding-specific nudge: a missing win event here can still be named on the next step.
          winEvent: winEvent ?? undefined,
          evidence,
          blind: report.blindAttribution ?? null,
        }}
      />

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
