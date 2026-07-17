import {
  Check,
  FileCode2,
  Flag,
  LockKeyhole,
  ScanSearch,
  Sparkles,
} from "lucide-react";

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
      aria-label="A Drover venture canvas joining Product and go-to-market work, bounded Claude and Codex execution, an exact founder consequence, and returned evidence"
    >
      <div className="machine-topbar">
        <div className="machine-product">
          <span className="mini-mark" aria-hidden="true">
            D
          </span>
          <span>
            Buffalo Projects
            <small>one canonical venture</small>
          </span>
        </div>
        <div className="machine-mode">
          <span className="machine-mode-active">Product</span>
          <span>Go-to-market</span>
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
                <small>Product · evidence-backed</small>
                <strong>Project discovery</strong>
              </span>
            </div>
            <div className="evidence-line">
              <span>README.md:55</span>
              <p>The repository proves the current discovery path.</p>
            </div>
            <div className="evidence-line">
              <span>Telemetry</span>
              <p>Builders leave before viewing a complete brief.</p>
            </div>
            <div className="node-foot">
              <ScanSearch /> cited Product truth
            </div>
          </article>

          <article className="machine-node opening-node">
            <div className="node-heading">
              <span className="node-icon opening-icon">
                <Sparkles />
              </span>
              <span>
                <small>Go-to-market · inferred</small>
                <strong>Founder interviews</strong>
              </span>
            </div>
            <p>
              The current promise may be ahead of the Product experience it asks
              builders to trust.
            </p>
            <span className="uncertainty">Interpretation · not fact</span>
          </article>
        </div>

        <article className="machine-node crew-node">
          <div className="crew-node-head">
            <span>
              <small>Selected relationship</small>
              <strong>Promise → Product capability</strong>
            </span>
            <span className="run-state">Directed</span>
          </div>
          <div className="crew-list">
            <RunLine runtime="Claude Code" task="implemented the Product change" />
            <RunLine runtime="Codex" task="independently verified the claim" />
          </div>
          <div className="artifact-row">
            <span className="artifact-icon">
              <FileCode2 />
            </span>
            <span>
              <strong>Landing-page and onboarding revision</strong>
              <small>Exact diff, preview, and evidence ready</small>
            </span>
            <span className="artifact-count">v4</span>
          </div>
        </article>

        <div className="founder-wall-line" aria-hidden="true">
          <span>Founder consequence</span>
        </div>

        <div className="machine-result-column">
          <article className="machine-node gate-node">
            <div className="gate-node-head">
              <span className="node-icon gate-icon">
                <LockKeyhole />
              </span>
              <span>
                <small>Needs your hand</small>
                <strong>Publish the revised promise</strong>
              </span>
            </div>
            <p>Review the exact page, destination, evidence, and rollback path.</p>
            <div className="gate-actions" aria-hidden="true">
              <span>Keep staged</span>
              <span className="approve-action">Publish artifact</span>
            </div>
          </article>

          <article className="machine-node outcome-node">
            <div className="node-heading">
              <span className="node-icon outcome-icon">
                <Flag />
              </span>
              <span>
                <small>Illustrative evidence</small>
                <strong>Example replies challenge the audience claim</strong>
              </span>
            </div>
            <p>The evidence contests the relationship; it does not claim causality.</p>
          </article>
        </div>
      </div>

      <div className="machine-caption">
        <span>One model.</span>
        <span>Evidence stays evidence.</span>
        <span>Authority stays yours.</span>
      </div>
    </div>
  );
}
