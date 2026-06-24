import { useState } from "react";
import { ArrowRight, ScanSearch } from "lucide-react";

// The front door for a stranger: one screen, two truths — point it at your product, say what you
// want. The repo triggers the read-only scan (the wedge: grounding), and the sentence becomes the
// operator's durable goal, which composes the loop to the gate. No portfolio, no channel list, no
// vocabulary to learn. Everything downstream (scan, operator, compose, gate) already exists; this
// is the doorway that turns "I have a product and a goal" into a gate-ready loop.
export function ProductEntry({ busy, onStart, onSeePortfolio }: {
  busy: boolean;
  onStart: (input: { repoPath: string; outcome: string; goal: string }) => void | Promise<void>;
  onSeePortfolio?: () => void;
}) {
  const [repoPath, setRepoPath] = useState("");
  const [goal, setGoal] = useState("");
  const [outcome, setOutcome] = useState("");
  const canStart = !!repoPath.trim() && !!goal.trim() && !busy;
  const submit = () => {
    if (!canStart) return;
    void onStart({ repoPath: repoPath.trim(), outcome: outcome.trim() || "signup", goal: goal.trim() });
  };

  return (
    <div className="product-entry">
      <div className="product-entry-inner">
        <span className="product-entry-eyebrow">GTM IDE</span>
        <h1 className="product-entry-title">Point it at your product. Say what you want.</h1>
        <p className="product-entry-sub">
          It reads your real code, then builds the go-to-market system that chases your goal —
          stopping at your gate before anything reaches a real person.
        </p>

        <label className="product-entry-field">
          <span className="product-entry-label"><ScanSearch size={14} /> Your product</span>
          <input
            className="product-entry-input"
            placeholder="repo path, or github.com/you/your-product"
            value={repoPath}
            disabled={busy}
            onChange={(e) => setRepoPath(e.target.value)}
          />
        </label>

        <label className="product-entry-field">
          <span className="product-entry-label">What do you want to happen?</span>
          <textarea
            className="product-entry-goal"
            rows={2}
            placeholder="e.g. get my first dev-tool founder to try it"
            value={goal}
            disabled={busy}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
          />
        </label>

        <details className="product-entry-adv">
          <summary>Win event — what counts as it working (optional)</summary>
          <input
            className="product-entry-input"
            placeholder="e.g. signup, project_created, pilot_requested"
            value={outcome}
            disabled={busy}
            onChange={(e) => setOutcome(e.target.value)}
          />
        </details>

        <button className="product-entry-go" disabled={!canStart} onClick={submit} type="button">
          {busy ? "Reading your product…" : <>Read my product &amp; build it <ArrowRight size={16} /></>}
        </button>
        <p className="product-entry-foot">
          Read-only scan. Nothing sends. You approve everything at the gate.
          {onSeePortfolio ? <> · <button className="product-entry-link" onClick={onSeePortfolio} type="button">see an existing one</button></> : null}
        </p>
      </div>
    </div>
  );
}
