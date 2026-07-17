// Work detail — selecting a row transforms the center here. Order is deliberate and the reverse of most
// AI tools: the conclusion and the produced artifact come first, the decision next, and the machinery
// (agents, runtime, cost, events) last, behind a disclosure. A decision that reaches into the rest of
// the venture links to the smallest useful neighbourhood on the Map — the one place structure earns its
// keep.
import { Fragment, useMemo } from "react";
import { ArrowLeft, Square } from "lucide-react";
import type { FirmActiveDrive, WallQueueItemView } from "@/api";
import type { FirmBet, FirmLens } from "@/types";
import { DiffView, FilesChanged, ArtifactPreview } from "@/components/review";
import { DecisionGate } from "./DecisionGate";
import { resolveStagedArtifact } from "./reviewArtifact";
import type { NowRow } from "./nowModel";

function waitingWallItem(items: WallQueueItemView[], betId: string | null): WallQueueItemView | null {
  return items.find((item) => item.decision === null && (betId ? item.betId === betId : true)) ?? null;
}

function machineryRows(bet: FirmBet | null, drive: FirmActiveDrive | null): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const agent = bet?.teammateRef ?? drive?.teammateRef;
  if (agent) rows.push(["Agent", agent]);
  if (drive?.runtime) rows.push(["Runtime", drive.runtime]);
  if (bet?.events?.length) {
    rows.push(["Steps", String(bet.events.length)]);
    const cost = bet.events.reduce((sum, event) => sum + (event.costUsd ?? 0), 0);
    if (cost > 0) rows.push(["Cost", `$${cost.toFixed(2)}`]);
  }
  if (bet?.configurationRevision != null) rows.push(["Venture revision", `v${bet.configurationRevision}`]);
  if (bet?.forkedFrom) rows.push(["Branched from", bet.forkedFrom]);
  return rows;
}

export function WorkDetail({
  ventureId,
  row,
  lens,
  wallItems,
  activeDrives,
  onBack,
  onChanged,
  onRevise,
  onStop,
  onOpenMap,
}: {
  ventureId: string;
  row: NowRow;
  lens: FirmLens;
  wallItems: WallQueueItemView[];
  activeDrives: FirmActiveDrive[];
  onBack: () => void;
  onChanged: () => void;
  onRevise: (betId: string | null) => void;
  onStop: (driveId: string) => void;
  onOpenMap: () => void;
}) {
  const target = row.target;
  const betId = target.kind === "bet" ? target.betId : target.kind === "drive" ? target.betId : null;
  const bet = useMemo(() => (betId ? lens.bets.find((candidate) => candidate.id === betId) ?? null : null), [betId, lens.bets]);
  const drive = target.kind === "drive" ? activeDrives.find((entry) => entry.id === target.driveId) ?? null : null;

  const gateItem = target.kind === "wall"
    ? waitingWallItem(wallItems, null)
    : betId ? waitingWallItem(wallItems, betId) : null;

  const stagedArtifacts = (bet?.staged ?? [])
    .map((staged) => ({ title: staged.title ?? null, resolved: resolveStagedArtifact(staged.content) }))
    .filter((entry) => entry.resolved !== null);

  const machinery = machineryRows(bet, drive);
  const eyebrow = gateItem ? "Needs your decision" : drive ? "Working" : row.stateLabel;

  return (
    <div className="now-detail" data-tone={gateItem ? "needs-you" : row.state}>
      <button type="button" className="now-detail-back" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Back to Now
      </button>

      <div>
        <div className="now-detail-eyebrow">{eyebrow}</div>
        <h1 className="now-detail-title">{bet?.intent ?? row.title}</h1>
      </div>
      {row.detail ? <p className="now-detail-why">{row.detail}</p> : null}

      {drive ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">In progress</span>
          <p className="now-detail-why">Drover is working on this now. It will return an artifact and stop at any outward step.</p>
          {drive.abortSupported ? (
            <div className="now-gate-actions">
              <button type="button" className="now-gate-btn" data-intent="reject" onClick={() => onStop(drive.id)} disabled={Boolean(drive.abortRequestedAt)}>
                <Square aria-hidden="true" style={{ width: 12, height: 12 }} /> {drive.abortRequestedAt ? "Stopping…" : "Stop this work"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!drive && !gateItem && stagedArtifacts.length ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">What was produced</span>
          {stagedArtifacts.map((entry, index) => (
            <div key={index} className="now-detail-block">
              {entry.title ? <p className="now-row-detail">{entry.title}</p> : null}
              {entry.resolved!.kind === "diff" ? (
                <><FilesChanged diff={entry.resolved!.diff} /><DiffView diff={entry.resolved!.diff} /></>
              ) : (
                <ArtifactPreview artifact={entry.resolved!.artifact} />
              )}
            </div>
          ))}
        </div>
      ) : null}

      {bet?.architectureTarget || bet?.campaignId ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">Affected context</span>
          <p className="now-row-detail">This work connects to how the venture reaches and serves people.</p>
          <div className="now-gate-actions">
            <button type="button" className="now-gate-btn" onClick={onOpenMap}>See on the map</button>
          </div>
        </div>
      ) : null}

      {gateItem ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">Your decision</span>
          <DecisionGate ventureId={ventureId} item={gateItem} onDecided={onChanged} onRevise={() => onRevise(betId)} />
        </div>
      ) : null}

      {bet?.learning ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">What Drover learned</span>
          <p className="now-detail-why">{bet.learning}</p>
        </div>
      ) : null}

      {machinery.length ? (
        <details className="now-machinery">
          <summary>How this was done</summary>
          <dl className="now-machinery-grid">
            {machinery.map(([label, value]) => (<Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}
