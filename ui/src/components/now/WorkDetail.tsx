// The direction's block vocabulary — repository-native and continuous. A direction returns one coherent
// change set: what Drover now understands, the working result, the EXACT repository change (files, diff,
// tests, preview — never reduced to a summary), what else in the venture it affects, what it learned, and
// how it was done. These blocks were once a single fixed stack; they are now the render bodies the
// representation registry composes. WorkbenchView owns the head, the working-now pulse, and the pinned
// decision; the blocks below are pure over the shared DirectionRenderContext so legacy and panes cannot
// diverge. OverviewBody is the default "overview" representation — the same blocks, same order, same
// now.css classes as before (parity). Steering happens in the persistent composer docked below.
import { Fragment } from "react";
import type { FirmOutcome } from "@/types";
import { DiffView, FilesChanged, ArtifactPreview } from "@/components/review";
import type { DirectionRenderContext, ExactChange, PreviewEntry } from "./projectDirection";

// Returned reality keeps its honest lineage — Drover never invents causal attribution.
function attributionLine(outcome: FirmOutcome): string {
  if (outcome.providerEventId) return "Joined to this direction by captured provider identity — causality is not claimed.";
  if (outcome.joined) return "Joined by captured evidence — causality is not claimed.";
  return "Unattributed — Drover has not claimed this work caused it.";
}

/** Returned reality — what the outside world sent back to this same direction. */
export function ReturnedBlock({ outcomes }: { outcomes: FirmOutcome[] }) {
  if (!outcomes.length) return null;
  return (
    <div className="now-detail-block">
      <span className="now-detail-block-label">The market answered</span>
      {outcomes.map((outcome) => (
        <div key={outcome.id} className="now-returned">
          <p className="now-detail-why">{outcome.body ?? `A ${outcome.outcomeKind ?? "market"} return came back.`}</p>
          <p className="now-change-meta">
            {[outcome.from, outcome.channel].filter(Boolean).join(" · ") || "Market return"} · {attributionLine(outcome)}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Working result — the primary artifact (preview, page, campaign, research). */
export function WorkingResultBlock({ previews }: { previews: PreviewEntry[] }) {
  if (!previews.length) return null;
  return (
    <div className="now-detail-block">
      <span className="now-detail-block-label">
        {previews.length > 1 ? `Working result · ${previews.length} versions` : "Working result"}
      </span>
      <div className="now-detail-block">
        {previews[0].title ? <p className="now-detail-why">{previews[0].title}</p> : null}
        <div className="now-artifact-cap"><ArtifactPreview artifact={previews[0].artifact.artifact} /></div>
      </div>
      {previews.slice(1).map((entry, index) => (
        <details key={index} className="now-secondary">
          <summary>{entry.title ?? `Version ${index + 2}`}</summary>
          <div className="now-artifact-cap"><ArtifactPreview artifact={entry.artifact.artifact} /></div>
        </details>
      ))}
    </div>
  );
}

/** Exact changes — repository-native, never reduced to a summary. */
export function ExactChangeBlock({ changes }: { changes: ExactChange[] }) {
  if (!changes.length) return null;
  return (
    <>
      {changes.map((change) => (
        <div key={change.key} className="now-detail-block">
          <span className="now-detail-block-label">Exact changes</span>
          {change.title ? <p className="now-detail-why">{change.title}</p> : null}
          {change.repository ? <p className="now-change-meta">{change.repository}</p> : null}
          <FilesChanged diff={change.diff} />
          {change.tests || change.preview ? (
            <p className="now-change-meta">
              {change.tests ? <span>{change.tests}</span> : null}
              {change.preview ? <a href={change.preview} target="_blank" rel="noreferrer">Open preview</a> : null}
            </p>
          ) : null}
          <details className="now-exact-diff" open>
            <summary>Review exact diff</summary>
            <DiffView diff={change.diff} />
          </details>
        </div>
      ))}
    </>
  );
}

/** Broader impact — what else in the venture this change means. */
export function ImpactBlock({ impact }: { impact: DirectionRenderContext["impact"] }) {
  if (!impact.length) return null;
  return (
    <div className="now-detail-block">
      <span className="now-detail-block-label">What this affects</span>
      <ul className="now-detail-list">
        {impact.map((line, index) => <li key={index}><span>{line.text}</span></li>)}
      </ul>
    </div>
  );
}

/** What Drover learned — the durable lesson a bet recorded. */
export function LearningBlock({ learning }: { learning: string | null }) {
  if (!learning) return null;
  return (
    <div className="now-detail-block">
      <span className="now-detail-block-label">What Drover learned</span>
      <p className="now-detail-why">{learning}</p>
    </div>
  );
}

/** How this was done — machinery demoted below the fold; never the primary movement signal. */
export function MachineryBlock({ machinery }: { machinery: Array<[string, string]> }) {
  if (!machinery.length) return null;
  return (
    <details className="now-machinery">
      <summary>How this was done</summary>
      <dl className="now-machinery-grid">
        {machinery.map(([label, value]) => (<Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>))}
      </dl>
    </details>
  );
}

/**
 * The default richest representation — the same block stack WorkDetail rendered before, in the same order
 * and with the same now.css classes (parity). The head, working-now pulse, and pinned decisions moved up
 * to WorkbenchView so they never hide behind a non-active chip; everything else composes from ctx here.
 */
export function OverviewBody({ ctx }: { ctx: DirectionRenderContext }) {
  return (
    <>
      <ReturnedBlock outcomes={ctx.outcomes} />
      <WorkingResultBlock previews={ctx.previews} />
      <ExactChangeBlock changes={ctx.exactChanges} />
      <ImpactBlock impact={ctx.impact} />
      <LearningBlock learning={ctx.learning} />
      <MachineryBlock machinery={ctx.machinery} />
    </>
  );
}
