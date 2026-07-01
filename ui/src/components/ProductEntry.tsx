import { useState } from "react";
import { ArrowRight, FolderOpen, LoaderCircle, ScanSearch } from "lucide-react";
import { pickFolder, scanPreview } from "@/api";
import type { ScanPreview as ScanPreviewData } from "@/types";
import { ScanPreview } from "@/components/ScanPreview";

// The front door for a stranger, in three honest beats: point it at your product, SEE what it read,
// then say what you want. The scan is the wedge (grounding) — so we no longer hide it behind a silent
// createProject. You pick a folder, watch the read-only scan run, and the preview hands back the real
// product headline, stack, the detected win event with its file:line evidence, and an honest
// blind-attribution callout. Only after you confirm "this is my product" do you give the goal, which
// becomes the operator's durable goal and composes the loop to the gate.
type Phase = "pick" | "scanning" | "preview" | "goal";

export function ProductEntry({ busy, onStart, onSeePortfolio }: {
  busy: boolean;
  onStart: (input: { repoPath: string; outcome: string; goal: string }) => void | Promise<void>;
  onSeePortfolio?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [repoPath, setRepoPath] = useState("");
  const [goal, setGoal] = useState("");
  const [outcome, setOutcome] = useState("");
  const [picking, setPicking] = useState(false);
  const [report, setReport] = useState<ScanPreviewData | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const runScan = async (path: string) => {
    setPhase("scanning");
    setScanError(null);
    try {
      const result = await scanPreview(path, outcome.trim() || undefined);
      setReport(result);
      setPhase("preview");
    } catch (error) {
      setScanError(error instanceof Error ? error.message : String(error));
      setPhase("pick");
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

  const canStart = !!repoPath.trim() && !!goal.trim() && !busy;
  const submit = () => {
    if (!canStart) return;
    // The win event the founder named on the preview wins; otherwise fall back to what the scan
    // detected, or a sane default — so the operator always has an outcome to chase. The scan returns
    // the win event as a structured object ({ name, ... }); tolerate the legacy string form too.
    const detected = typeof report?.winEvent === "string"
      ? report.winEvent
      : report?.winEvent?.name;
    const winEvent = outcome.trim() || detected?.trim() || "signup";
    void onStart({ repoPath: repoPath.trim(), outcome: winEvent, goal: goal.trim() });
  };

  return (
    <div className="product-entry">
      <div className="product-entry-inner">
        <span className="product-entry-eyebrow">Drover</span>

        {/* ── Beat 1: point it at your product ───────────────────────────────── */}
        {(phase === "pick" || phase === "scanning") && (
          <>
            <h1 className="product-entry-title">Point it at your product. It reads your code first.</h1>
            <p className="product-entry-sub">
              Pick your product folder and watch the read-only scan. You'll see what it learned —
              your stack, the win event, where it fires — before you say what you want.
            </p>

            <div className="product-entry-field">
              <span className="product-entry-label"><ScanSearch size={14} /> Your product</span>
              <button
                type="button"
                className={`product-entry-folder ${repoPath ? "chosen" : ""}`}
                disabled={busy || picking || phase === "scanning"}
                onClick={choose}
              >
                <FolderOpen size={15} />
                {repoPath
                  ? <><span className="product-entry-folder-path">{repoPath}</span><span className="product-entry-folder-change">Change</span></>
                  : <span>{picking ? "Opening Finder…" : "Choose your product folder"}</span>}
              </button>
            </div>

            <details className="product-entry-adv">
              <summary>Win event — what counts as it working (optional)</summary>
              <input
                className="product-entry-input"
                placeholder="e.g. signup, project_created, pilot_requested"
                value={outcome}
                disabled={busy || phase === "scanning"}
                onChange={(e) => setOutcome(e.target.value)}
              />
            </details>

            {phase === "scanning" ? (
              <div className="product-entry-progress" role="status">
                <LoaderCircle className="spin" size={16} />
                <div className="product-entry-progress-steps">
                  <strong>Reading your product…</strong>
                  <span>Walking the codebase, detecting your stack, finding where wins fire. Read-only — nothing changes.</span>
                </div>
              </div>
            ) : null}

            {scanError ? (
              <p className="product-entry-error" role="alert">Couldn't read that folder: {scanError}</p>
            ) : null}
          </>
        )}

        {/* ── Beat 2: see what it read ───────────────────────────────────────── */}
        {phase === "preview" && report && (
          <>
            <ScanPreview
              repoPath={repoPath}
              report={report}
              busy={busy}
              onConfirm={() => setPhase("goal")}
              onRescan={startOver}
            />
          </>
        )}

        {/* ── Beat 3: say what you want ──────────────────────────────────────── */}
        {phase === "goal" && (
          <>
            <h1 className="product-entry-title">Now — what do you want to happen?</h1>
            <p className="product-entry-sub">
              {report?.headline?.trim()
                ? <>It knows your product. Tell it the goal and it builds the go-to-market system that chases it — stopping at your gate before anything reaches a real person.</>
                : <>Tell it the goal and it builds the go-to-market system that chases it — stopping at your gate before anything reaches a real person.</>}
            </p>

            <label className="product-entry-field">
              <span className="product-entry-label">What do you want to happen?</span>
              <textarea
                className="product-entry-goal"
                rows={2}
                placeholder="e.g. get my first dev-tool founder to try it"
                value={goal}
                disabled={busy}
                autoFocus
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
              />
            </label>

            <button className="product-entry-go" disabled={!canStart} onClick={submit} type="button">
              {busy ? "Building your system…" : <>Build it <ArrowRight size={16} /></>}
            </button>
            <button className="product-entry-link product-entry-back" onClick={() => setPhase("preview")} type="button">
              Back to the scan
            </button>
          </>
        )}

        <p className="product-entry-foot">
          Read-only scan. Nothing sends. You approve everything at the gate.
          {onSeePortfolio ? <> · <button className="product-entry-link" onClick={onSeePortfolio} type="button">open an existing product</button></> : null}
        </p>
      </div>
    </div>
  );
}
