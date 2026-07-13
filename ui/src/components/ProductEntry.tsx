import { useEffect, useState } from "react";
import { ArrowRight, Check, FolderOpen, LoaderCircle, PackageOpen, ScanSearch } from "lucide-react";
import { getSampleProduct, pickFolder, scanPreview } from "@/api";
import type { ScanPreview as ScanPreviewData } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The front door for a stranger, kept to ONE calm screen: point it at your product, watch the
// read-only scan, and see a plain-language read of what it learned — then walk in. There is no
// separate diagnostic page and no forced goal step: the goal is asked later, on the canvas, so the
// founder is never made to converge before they've looked around. The scan is still the wedge
// (grounding), but it's presented as a calm confirmation, never an alarm.
type Phase = "pick" | "scanning" | "read";

export function ProductEntry({ busy, onStart, onSeePortfolio }: {
  busy: boolean;
  onStart: (input: { repoPath: string; outcome: string; goal: string }) => void | Promise<void>;
  onSeePortfolio?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [repoPath, setRepoPath] = useState("");
  const [outcome, setOutcome] = useState("");
  const [picking, setPicking] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [report, setReport] = useState<ScanPreviewData | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // A live elapsed clock for the read — the scan is one open-ended pass (no honest percentage), so what's
  // real is how long the crew has been working. It keeps the read reading as alive-and-working, never a
  // hung spinner. Runs only while scanning; resets each time.
  const [scanElapsed, setScanElapsed] = useState(0);
  useEffect(() => {
    if (phase !== "scanning") return;
    const start = Date.now();
    const t = window.setInterval(() => setScanElapsed(Date.now() - start), 200);
    return () => window.clearInterval(t);
  }, [phase]);
  const scanClock = `${Math.floor(scanElapsed / 1000)}s`;

  const runScan = async (path: string, winOverride?: string) => {
    setPhase("scanning");
    setScanError(null);
    try {
      const result = await scanPreview(path, winOverride || outcome.trim() || undefined);
      setReport(result);
      setPhase("read");
    } catch (error) {
      setScanError(error instanceof Error ? error.message : String(error));
      setPhase("pick");
    }
  };

  // "Try it on a sample product" — for a stranger with no instrumented repo of their own. Pulls the
  // bundled sample's real path + win event from the server, then runs the exact same scan flow a real
  // folder would, so they see the read prove itself on honest code before committing anything.
  const trySample = async () => {
    setLoadingSample(true);
    setScanError(null);
    try {
      const sample = await getSampleProduct();
      setRepoPath(sample.repoPath);
      setOutcome(sample.winEvent);
      await runScan(sample.repoPath, sample.winEvent);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : String(error));
      setPhase("pick");
    } finally {
      setLoadingSample(false);
    }
  };

  const choose = async () => {
    setPicking(true);
    try {
      const r = await pickFolder();
      if (r.path) {
        setRepoPath(r.path);
        void runScan(r.path);
      }
    } finally {
      setPicking(false);
    }
  };

  const startOver = () => {
    setPhase("pick");
    setReport(null);
    setRepoPath("");
    setScanError(null);
  };

  // Walk in. The goal is deferred to the canvas (its "what do you want to happen" launcher), so we hand
  // the operator no goal here — grounding the product is enough to land on the canvas and look around.
  // The win event the founder named (or the scan detected) still rides along so attribution has a target.
  const enter = () => {
    if (!repoPath.trim() || busy) return;
    const detected = typeof report?.winEvent === "string"
      ? report.winEvent
      : report?.winEvent?.name;
    const winEvent = outcome.trim() || detected?.trim() || "signup";
    void onStart({ repoPath: repoPath.trim(), outcome: winEvent, goal: "" });
  };

  // ── Plain-language read of the scan — calm, never an alarm ──────────────────────────────────────
  const stack = report?.stack?.filter(Boolean) ?? [];
  const files = report?.report?.filesScanned ?? null;
  const winName = typeof report?.winEvent === "string"
    ? report.winEvent.trim() || null
    : report?.winEvent?.name?.trim() || null;
  const winFound = report && typeof report.winEvent === "object" && report.winEvent
    ? report.winEvent.found === true
    : false;
  const emptyScan = files === 0;

  return (
    <div className="product-entry">
      <div className="product-entry-inner">
        <span className="product-entry-eyebrow">Drover</span>

        {/* ── Point it at your product ─────────────────────────────────────────── */}
        {(phase === "pick" || phase === "scanning") && (
          <>
            <h1 className="product-entry-title">Point it at your product.</h1>
            <p className="product-entry-sub">
              It reads your code first — read-only, nothing changes, nothing sends. Then you walk in.
            </p>

            <div className="product-entry-field">
              <span className="product-entry-label"><ScanSearch size={14} /> Your product</span>
              <Button
                type="button"
                variant="outline"
                className={`product-entry-folder ${repoPath ? "chosen" : ""}`}
                disabled={busy || picking || phase === "scanning"}
                onClick={choose}
              >
                <FolderOpen size={15} />
                {repoPath
                  ? <><span className="product-entry-folder-path">{repoPath}</span><span className="product-entry-folder-change">Change</span></>
                  : <span>{picking ? "Opening Finder…" : "Choose your product folder"}</span>}
              </Button>
            </div>

            <details className="product-entry-adv">
              <summary>Win event — what counts as it working (optional)</summary>
              <Input
                className="product-entry-input"
                placeholder="e.g. signup, project_created, pilot_requested"
                value={outcome}
                disabled={busy || phase === "scanning"}
                onChange={(e) => setOutcome(e.target.value)}
              />
            </details>

            <div className="product-entry-sample">
              <span className="product-entry-sample-or">No codebase handy?</span>
              <Button
                type="button"
                variant="outline"
                className="product-entry-sample-btn"
                disabled={busy || picking || loadingSample || phase === "scanning"}
                onClick={trySample}
              >
                <PackageOpen size={14} />
                {loadingSample ? "Opening sample…" : "Try it on a sample product"}
              </Button>
            </div>

            {phase === "scanning" ? (
              <div className="product-entry-progress" role="status" aria-live="polite">
                <LoaderCircle className="spin" size={16} />
                <div className="product-entry-progress-steps">
                  <div className="product-entry-progress-head">
                    <strong>Reading your product…</strong>
                    <span className="product-entry-progress-clock tnum mono">{scanClock}</span>
                  </div>
                  <span>Walking the codebase, detecting your stack, finding where wins fire. Read-only — nothing changes.</span>
                </div>
              </div>
            ) : null}

            {scanError ? (
              <p className="product-entry-error" role="alert">Couldn't read that folder: {scanError}</p>
            ) : null}
          </>
        )}

        {/* ── The calm read, then walk in ──────────────────────────────────────── */}
        {phase === "read" && report && (
          <>
            <h1 className="product-entry-title">
              {emptyScan ? "Not much to read in there yet." : "Here's what it read."}
            </h1>
            <p className="product-entry-sub">
              {emptyScan
                ? <>No code files turned up in that folder. You can point it somewhere else, or walk in anyway and tell it what you want.</>
                : <>You'll tell it what you want once you're inside — nothing to decide here.</>}
            </p>

            {!emptyScan && (
              <div className="product-entry-read">
                <p className="product-entry-read-line">
                  {stack.length
                    ? <>A <strong>{stack.length === 1 ? "single-framework" : "multi-part"}</strong> product{typeof files === "number" ? <>, <strong>{files.toLocaleString()}</strong> files</> : null}.</>
                    : <>{typeof files === "number" ? <><strong>{files.toLocaleString()}</strong> files</> : "Read"}, no framework manifest — that's fine.</>}
                </p>
                <p className={`product-entry-read-win ${winFound ? "found" : "pending"}`}>
                  {winFound
                    ? <><Check size={13} /> Win event <code>{winName}</code> — found in your code.</>
                    : <>Win event {winName ? <code>{winName}</code> : null} isn't wired yet. You can add one anytime.</>}
                </p>
              </div>
            )}

            <Button className="product-entry-go" disabled={busy || !repoPath.trim()} onClick={enter} type="button">
              {busy ? "Taking you in…" : <>Take me in <ArrowRight size={16} /></>}
            </Button>
            <Button variant="link" className="product-entry-link product-entry-back" onClick={startOver} type="button">
              Pick a different folder
            </Button>
          </>
        )}

        <p className="product-entry-foot">
          Read-only scan. Nothing sends. You approve everything at the gate.
          {onSeePortfolio ? <> · <Button variant="link" className="product-entry-link" onClick={onSeePortfolio} type="button">open an existing product</Button></> : null}
        </p>
      </div>
    </div>
  );
}
