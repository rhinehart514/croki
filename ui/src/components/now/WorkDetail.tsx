// The direction workspace — repository-native. Opening a direction focuses the same surface on one
// founder intent and returns one coherent change set: what changed in plain language, the working
// result, the EXACT repository change (files, diff, tests, preview — never reduced to a summary), what
// else in the venture it affects, and every outward decision held independently. A direction may hold
// several parallel attempts and several decisions; they are aggregated here, never fragmented.
import { Fragment } from "react";
import { ArrowLeft, Square } from "lucide-react";
import type { FirmActiveDrive, WallQueueItemView } from "@/api";
import type { FirmArchitectureProjection, FirmBet, FirmLens } from "@/types";
import { targetBet } from "@/components/firm/directionTarget";
import { DiffView, FilesChanged, ArtifactPreview } from "@/components/review";
import { DecisionGate } from "./DecisionGate";
import { NowComposer } from "./NowComposer";
import { resolveStagedArtifact } from "./reviewArtifact";
import { buildDirectionImpact } from "./directionImpact";
import type { Direction } from "./directionModel";

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

type ExactChange = { key: string; title: string | null; diff: string; stat: string | null; tests: string | null; preview: string | null; repository: string | null };

function machineryRows(bets: FirmBet[], drive: FirmActiveDrive | null, approaches: number): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (approaches > 1) rows.push(["Approaches", String(approaches)]);
  const agent = bets[0]?.teammateRef ?? drive?.teammateRef;
  if (agent) rows.push(["Agent", agent]);
  if (drive?.runtime) rows.push(["Runtime", drive.runtime]);
  const steps = bets.reduce((sum, bet) => sum + (bet.events?.length ?? 0), 0);
  if (steps > 0) rows.push(["Steps", String(steps)]);
  const cost = bets.flatMap((bet) => bet.events ?? []).reduce((sum, event) => sum + (event.costUsd ?? 0), 0);
  if (cost > 0) rows.push(["Cost", `$${cost.toFixed(2)}`]);
  const revision = bets.find((bet) => bet.configurationRevision != null)?.configurationRevision;
  if (revision != null) rows.push(["Venture revision", `v${revision}`]);
  return rows;
}

function productChangeMeta(effect: Record<string, unknown>): Omit<ExactChange, "key" | "diff"> {
  const tests = str(effect.tests) ?? (effect.testsPassed === true ? "Tests passed" : effect.testsPassed === false ? "Tests failed" : null);
  return {
    title: str(effect.title) ?? str(effect.intent),
    stat: str(effect.diffStat) ?? str(effect.summary),
    tests,
    preview: str(effect.preview) ?? str(effect.previewUrl) ?? str(effect.previewPath),
    repository: str(effect.repository) ?? str(effect.repo),
  };
}

export function WorkDetail({
  ventureId,
  ventureName,
  direction,
  lens,
  wallItems,
  activeDrives,
  projection,
  onBack,
  onChanged,
  onSteered,
  onStop,
}: {
  ventureId: string;
  ventureName: string;
  direction: Direction;
  lens: FirmLens;
  wallItems: WallQueueItemView[];
  activeDrives: FirmActiveDrive[];
  projection: FirmArchitectureProjection | null;
  onBack: () => void;
  onChanged: () => void;
  onSteered: () => void;
  onStop: (driveId: string) => void;
}) {
  const own = new Set(direction.betIds);
  const memberBets = lens.bets.filter((bet) => own.has(bet.id));
  const drive = activeDrives.find((entry) => direction.activeDriveIds.includes(entry.id)) ?? null;
  const waiting = wallItems.filter((item) => direction.waitingWallItemIds.includes(item.id) && item.decision === null);

  // Split staged work into working-result previews and exact code changes. Product-change wall items
  // contribute their exact diff too, deduped by diff text so it is shown once.
  const previews: Array<{ title: string | null; artifact: Extract<ReturnType<typeof resolveStagedArtifact>, { kind: "preview" }> }> = [];
  const changeByDiff = new Map<string, ExactChange>();
  for (const bet of memberBets) {
    for (const staged of bet.staged ?? []) {
      const resolved = resolveStagedArtifact(staged.content);
      if (!resolved) continue;
      if (resolved.kind === "diff") {
        changeByDiff.set(resolved.diff, { key: resolved.diff.slice(0, 40), title: staged.title ?? null, diff: resolved.diff, stat: resolved.stat, tests: null, preview: null, repository: null });
      } else {
        previews.push({ title: staged.title ?? null, artifact: resolved });
      }
    }
  }
  for (const item of waiting) {
    if (String(item.effect.kind ?? "").toLowerCase() !== "product-change") continue;
    const diff = str(item.effect.diff) ?? str(item.effect.patch) ?? str(item.effect.artifact);
    if (!diff) continue;
    changeByDiff.set(diff, { key: diff.slice(0, 40), diff, ...productChangeMeta(item.effect) });
  }
  const exactChanges = [...changeByDiff.values()];

  const impact = buildDirectionImpact(direction.betIds, lens, projection);
  const learning = memberBets.map((bet) => bet.learning).find((value): value is string => Boolean(value)) ?? null;
  const machinery = machineryRows(memberBets, drive, direction.approaches);
  const eyebrow = waiting.length ? "Needs your decision" : drive ? "Working" : direction.state === "from-market" ? "The market answered" : "Direction";

  return (
    <div className="now-detail" data-tone={waiting.length ? "needs-you" : direction.state}>
      <button type="button" className="now-detail-back" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Back to Now
      </button>

      {/* 1 · What changed — the whole consequence, in ordinary language. */}
      <div>
        <div className="now-detail-crumbs">
          <span>{ventureName}</span>
          <span aria-hidden="true">/</span>
          <span>This direction</span>
        </div>
        <div className="now-detail-eyebrow">{eyebrow}</div>
        <h1 className="now-detail-title">{direction.sentence}</h1>
      </div>
      <p className="now-detail-why">{direction.understanding}</p>

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

      {/* 2 · Working result — the primary artifact (preview, page, campaign, research). */}
      {previews.length ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">Working result</span>
          {previews.map((entry, index) => (
            <div key={index} className="now-detail-block">
              {entry.title ? <p className="now-row-detail">{entry.title}</p> : null}
              <div className="now-artifact-cap"><ArtifactPreview artifact={entry.artifact.artifact} /></div>
            </div>
          ))}
        </div>
      ) : null}

      {/* 3 · Exact changes — repository-native, never reduced to a summary. */}
      {exactChanges.map((change) => (
        <div key={change.key} className="now-detail-block">
          <span className="now-detail-block-label">Exact changes</span>
          {change.title ? <p className="now-row-detail">{change.title}</p> : null}
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

      {/* 4 · Broader impact — what else in the venture this change means. */}
      {impact.length ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">What this affects</span>
          <ul className="now-detail-list">
            {impact.map((line, index) => <li key={index}><span>{line.text}</span></li>)}
          </ul>
        </div>
      ) : null}

      {/* 5 · Decisions — each outward consequence held independently. */}
      {waiting.length ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">{waiting.length === 1 ? "Your decision" : "Your decisions"}</span>
          {waiting.map((item) => (
            <DecisionGate
              key={item.id}
              ventureId={ventureId}
              item={item}
              onDecided={onChanged}
              showArtifact={String(item.effect.kind ?? "").toLowerCase() !== "product-change"}
            />
          ))}
        </div>
      ) : null}

      {direction.primaryBetId ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">Keep directing this</span>
          <NowComposer
            ventureId={ventureId}
            ventureName={ventureName}
            selection={targetBet(direction.primaryBetId)}
            scopeLabel={direction.sentence.length > 44 ? `${direction.sentence.slice(0, 44).trimEnd()}…` : direction.sentence}
            hasWork
            onDriven={onSteered}
          />
        </div>
      ) : null}

      {learning ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">What Drover learned</span>
          <p className="now-detail-why">{learning}</p>
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
