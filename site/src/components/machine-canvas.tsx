import {
  ArrowDown,
  Check,
  FileCode2,
  Flag,
  LockKeyhole,
  ScanSearch,
  Sparkles,
} from "lucide-react";

function CrewLine({ name, task }: { name: string; task: string }) {
  return (
    <div className="crew-line">
      <span className="crew-portrait" aria-hidden="true">
        <span className="crew-hair" />
        <span className="crew-head" />
      </span>
      <span>
        <strong>{name}</strong>
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
      aria-label="A Drover experiment moving from cited product truth, through a working crew and founder approval, to a real outcome"
    >
      <div className="machine-topbar">
        <div className="machine-product">
          <span className="mini-mark" aria-hidden="true">
            D
          </span>
          <span>
            Your product
            <small>living terrain</small>
          </span>
        </div>
        <div className="machine-mode">
          <span>Canvas</span>
          <span className="machine-mode-active">Experiments</span>
        </div>
        <span className="machine-status">
          <span /> 3 bets moving
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
                <small>Product truth</small>
                <strong>What the code proves</strong>
              </span>
            </div>
            <div className="evidence-line">
              <span>README.md:55</span>
              <p>Product claims carry file and line receipts.</p>
            </div>
            <div className="evidence-line">
              <span>README.md:138</span>
              <p>Repository scan stays read-only and local.</p>
            </div>
            <div className="node-foot">
              <ScanSearch /> 43 cited files
            </div>
          </article>

          <article className="machine-node opening-node">
            <div className="node-heading">
              <span className="node-icon opening-icon">
                <Sparkles />
              </span>
              <span>
                <small>Opening · informed read</small>
                <strong>Turn product truth into a testable bet</strong>
              </span>
            </div>
            <p>
              The first useful artifact should prove demand before the team adds
              another surface.
            </p>
            <span className="uncertainty">Medium confidence</span>
          </article>
        </div>

        <div className="machine-flow" aria-hidden="true">
          <span />
          <ArrowDown />
        </div>

        <article className="machine-node crew-node">
          <div className="crew-node-head">
            <span>
              <small>Pipeline 03</small>
              <strong>Prove the wedge</strong>
            </span>
            <span className="run-state">Prepared</span>
          </div>
          <div className="crew-list">
            <CrewLine name="Pilot lead" task="mapped the opening" />
            <CrewLine name="Readiness auditor" task="checked every claim" />
          </div>
          <div className="artifact-row">
            <span className="artifact-icon">
              <FileCode2 />
            </span>
            <span>
              <strong>Launch artifact</strong>
              <small>Preview and source ready</small>
            </span>
            <span className="artifact-count">v4</span>
          </div>
        </article>

        <div className="founder-wall-line" aria-hidden="true">
          <span>Your wall</span>
        </div>

        <div className="machine-result-column">
          <article className="machine-node gate-node">
            <div className="gate-node-head">
              <span className="node-icon gate-icon">
                <LockKeyhole />
              </span>
              <span>
                <small>Needs your call</small>
                <strong>Publish launch artifact</strong>
              </span>
            </div>
            <p>Review the exact page, destination, and claim receipts.</p>
            <div className="gate-actions" aria-hidden="true">
              <span>Keep staged</span>
              <span className="approve-action">Approve</span>
            </div>
          </article>

          <article className="machine-node outcome-node">
            <div className="node-heading">
              <span className="node-icon outcome-icon">
                <Flag />
              </span>
              <span>
                <small>Outcome returns</small>
                <strong>What changed in the world</strong>
              </span>
            </div>
            <p>No scoreboard. The result lands back on the bet that caused it.</p>
          </article>
        </div>
      </div>

      <div className="machine-caption">
        <span>Evidence stays evidence.</span>
        <span>Judgment stays labeled.</span>
        <span>Authority stays yours.</span>
      </div>
    </div>
  );
}
