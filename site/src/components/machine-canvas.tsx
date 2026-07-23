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
      aria-label="Croki taking a shipped product to its first users: Claude and Codex draft the outreach, a send waits for the founder's approval, and replies return as real signal"
    >
      <div className="machine-topbar">
        <div className="machine-product">
          <span className="mini-mark">
            <CrokiMark />
          </span>
          <span>
            Buffalo Projects
            <small>live · few users yet</small>
          </span>
        </div>
        <div className="machine-mode">
          <span>Work</span>
          <span className="machine-mode-active">Product / GTM</span>
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
                <small>From your repo</small>
                <strong>What you shipped</strong>
              </span>
            </div>
            <div className="evidence-line">
              <span>README.md:55</span>
              <p>Croki read the real product you built, not a description of it.</p>
            </div>
            <div className="evidence-line">
              <span>Usage</span>
              <p>Visitors leave before they sign up.</p>
            </div>
            <div className="node-foot">
              <ScanSearch /> read from your code
            </div>
          </article>

          <article className="machine-node opening-node">
            <div className="node-heading">
              <span className="node-icon opening-icon">
                <Sparkles />
              </span>
              <span>
                <small>Who it's for · a guess</small>
                <strong>People who starred your repo</strong>
              </span>
            </div>
            <p>
              These 8 already showed interest. A short, personal note might earn
              the first real conversation.
            </p>
            <span className="uncertainty">A guess · not fact</span>
          </article>
        </div>

        <article className="machine-node crew-node">
          <div className="crew-node-head">
            <span>
                <small>Drafting outreach</small>
              <strong>8 personal intros</strong>
            </span>
            <span className="run-state">Moving</span>
          </div>
          <div className="crew-list">
            <RunLine runtime="Claude Code" task="drafted a note to each person" />
            <RunLine runtime="Codex" task="checked every claim is true" />
          </div>
          <div className="artifact-row">
            <span className="artifact-icon">
              <FileCode2 />
            </span>
            <span>
              <strong>8 messages, ready to read</strong>
              <small>One real detail in each. Nothing sent yet.</small>
            </span>
            <span className="artifact-count">8</span>
          </div>
        </article>

        <div className="founder-wall-line" aria-hidden="true">
          <span>Needs you</span>
        </div>

        <div className="machine-result-column">
          <article className="machine-node gate-node">
            <div className="gate-node-head">
              <span className="node-icon gate-icon">
                <LockKeyhole />
              </span>
              <span>
                <small>Needs your hand</small>
                <strong>Send 8 intros</strong>
              </span>
            </div>
            <p>Read all 8 before any of them send. Nothing goes out until you say so.</p>
            <div className="gate-actions" aria-hidden="true">
              <span>Keep staged</span>
              <span className="approve-action">Send 8</span>
            </div>
          </article>

          <article className="machine-node outcome-node">
            <div className="node-heading">
              <span className="node-icon outcome-icon">
                <Flag />
              </span>
              <span>
                <small>What came back</small>
                <strong>3 replied. 1 wants a call.</strong>
              </span>
            </div>
            <p>Real replies, in their own words. This is what to build next.</p>
          </article>
        </div>
      </div>

      <div className="machine-caption">
        <span>It reads what you built.</span>
        <span>You approve who it reaches.</span>
        <span>What they say is your next move.</span>
      </div>
    </div>
  );
}
