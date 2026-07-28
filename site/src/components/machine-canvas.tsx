import {
  Check,
  FileCode2,
  Flag,
  LockKeyhole,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { CrokiMark } from "./croki-wordmark";

function RunLine({ runtime, task }: { runtime: string; task: string }) {
  return (
    <div className="crew-line">
      <span className="crew-portrait" aria-hidden="true">
        <span className="crew-hair" />
        <span className="crew-head" />
      </span>
      <span>
        <strong>{runtime}</strong>
        <small>{task}</small>
      </span>
      <Check className="crew-check" aria-hidden="true" />
    </div>
  );
}

export function MachineCanvas() {
  return (
    <div
      className="machine-shell"
      role="img"
      aria-label="A Croki coding Thread: Claude changes an isolated worktree, exact checks pass, the founder reviews the diff, and useful product context remains available in Canvas"
    >
      <div className="machine-topbar">
        <div className="machine-product">
          <span className="mini-mark">
            <CrokiMark />
          </span>
          <span>
            Buffalo Projects
            <small>signup-fix · isolated worktree</small>
          </span>
        </div>
        <div className="machine-mode">
          <span className="machine-mode-active">Thread</span>
          <span>Canvas available</span>
        </div>
        <span className="machine-status">
          <span /> illustrative scenario
        </span>
      </div>

      <div className="machine-grid">
        <div className="machine-source-column">
          <article className="machine-node source-node">
            <div className="node-heading">
              <span className="node-icon source-icon">
                <FileCode2 />
              </span>
              <span>
                <small>Founder direction</small>
                <strong>Fix the signup handoff</strong>
              </span>
            </div>
            <div className="evidence-line">
              <span>README.md:55</span>
              <p>New users lose their invitation after signing in.</p>
            </div>
            <div className="evidence-line">
              <span>src/auth/return.ts:42</span>
              <p>The return path drops the pending invitation.</p>
            </div>
            <div className="node-foot">
              <ScanSearch /> grounded in the repository
            </div>
          </article>

          <article className="machine-node opening-node">
            <div className="node-heading">
              <span className="node-icon opening-icon">
                <Sparkles />
              </span>
              <span>
                <small>Retained product context</small>
                <strong>Invitation acceptance is the first-run promise</strong>
              </span>
            </div>
            <p>
              A prior Thread established that successful onboarding ends with the
              invited workspace open, not the account home.
            </p>
            <span className="uncertainty">Founder-adopted · source-backed</span>
          </article>
        </div>

        <article className="machine-node crew-node">
          <div className="crew-node-head">
            <span>
                <small>Working in this Thread</small>
              <strong>Repair the return path</strong>
            </span>
            <span className="run-state">Moving</span>
          </div>
          <div className="crew-list">
            <RunLine runtime="Claude Code" task="updated the callback and state restore" />
            <RunLine runtime="Verification" task="unit checks and browser journey passed" />
          </div>
          <div className="artifact-row">
            <span className="artifact-icon">
              <FileCode2 />
            </span>
            <span>
              <strong>3 files changed</strong>
              <small>Exact diff and checkpoint ready to inspect.</small>
            </span>
            <span className="artifact-count">3</span>
          </div>
        </article>

        <div className="founder-wall-line" aria-hidden="true">
          <span>Review</span>
        </div>

        <div className="machine-result-column">
          <article className="machine-node gate-node">
            <div className="gate-node-head">
              <span className="node-icon gate-icon">
                <LockKeyhole />
              </span>
              <span>
                <small>Exact founder review</small>
                <strong>Apply the signup fix</strong>
              </span>
            </div>
            <p>Inspect the diff, preview, and attributed checks before changing the project.</p>
            <div className="gate-actions" aria-hidden="true">
              <span>Keep working</span>
              <span className="approve-action">Apply change</span>
            </div>
          </article>

          <article className="machine-node outcome-node">
            <div className="node-heading">
              <span className="node-icon outcome-icon">
                <Flag />
              </span>
              <span>
                <small>Exact result</small>
                <strong>Checks passed. Thread ready.</strong>
              </span>
            </div>
            <p>The next dependent task can reuse the accepted first-run context without another briefing.</p>
          </article>
        </div>
      </div>

      <div className="machine-caption">
        <span>Direct the selected model.</span>
        <span>Review the exact work.</span>
        <span>Return with product context intact.</span>
      </div>
    </div>
  );
}
