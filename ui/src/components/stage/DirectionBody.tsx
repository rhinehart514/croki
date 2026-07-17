// The direction workspace body: the venture→direction operating context — its approaches, the work under
// way, and the results the world returned. It re-hosts what the rail workbench proves (ResultBody: returned
// reality + working result + impact + learning + machinery) and adds the descent affordance the canvas
// frame owns: each staged artifact and each member approach is a row that descends DEEPER on double-click,
// re-keying the SAME selection one segment finer (direction → artifact / approach) without leaving the
// stage. Agents surface only through the approach row's team, never an org chart.
import type { FirmActiveDrive } from "@/api";
import { targetBet, targetWork } from "@/components/firm/directionTarget";
import { ResultBody } from "@/components/now/WorkDetail";
import { resolveStagedArtifact } from "@/components/now/reviewArtifact";
import type { DirectionRenderContext } from "@/components/now/projectDirection";
import type { CanvasSelection } from "@/components/firm/directionTarget";

function stagedKind(content: unknown): "product-change" | "draft" {
  const resolved = resolveStagedArtifact(content);
  return resolved?.kind === "diff" ? "product-change" : "draft";
}

export function DirectionBody({
  ctx,
  onDescend,
  onStop,
}: {
  ctx: DirectionRenderContext;
  onDescend: (selection: CanvasSelection) => void;
  onStop?: (driveId: string) => void;
}) {
  const openApproaches = ctx.memberBets.filter((bet) => !bet.endedAt);
  return (
    <>
      {/* Approaches — the parallel attempts, each descendable to steer just that one. */}
      {openApproaches.length > 1 ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">
            {openApproaches.length} approaches
          </span>
          {openApproaches.map((bet) => (
            <button
              key={bet.id}
              type="button"
              className="now-approach"
              data-tone={bet.position === "live" ? "working" : bet.position === "at-wall" ? "needs-you" : "changed"}
              onClick={() => onDescend(targetBet(bet.id))}
            >
              <span className="now-approach-head">
                <span className="now-approach-intent">{bet.intent}</span>
                <span className="now-approach-state">{bet.position}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Active work — the live drives, each with the founder's Stop. */}
      {ctx.drives.length ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">Working now</span>
          {ctx.drives.map((drive: FirmActiveDrive) => (
            <div key={drive.id} className="now-progress">
              <span className="now-progress-dot" aria-hidden="true" />
              <span>Drover is working on this now. It stops at any outward step.</span>
              {drive.abortSupported && onStop ? (
                <button type="button" className="now-progress-stop" onClick={() => onStop(drive.id)} disabled={Boolean(drive.abortRequestedAt)}>
                  {drive.abortRequestedAt ? "Stopping…" : "Stop"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Staged artifacts — each descendable into its exact change / preview. Differentiated by kind. */}
      {ctx.memberBets.some((bet) => (bet.staged ?? []).length) ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">Prepared work</span>
          {ctx.memberBets.flatMap((bet) =>
            (bet.staged ?? []).map((staged) => (
              <button
                key={`${bet.id}:${staged.id}`}
                type="button"
                className="now-approach"
                data-kind={stagedKind(staged.content)}
                onClick={() => staged.id && onDescend(targetWork(bet.id, staged.id))}
              >
                <span className="now-approach-head">
                  <span className="now-approach-intent">
                    {staged.title?.trim() || (stagedKind(staged.content) === "product-change" ? "Product change" : "Draft")}
                  </span>
                  <span className="now-approach-state">
                    {stagedKind(staged.content) === "product-change" ? "Diff" : "Preview"}
                  </span>
                </span>
              </button>
            )),
          )}
        </div>
      ) : null}

      {/* Returned results + the rest of the shared result body (impact, learning, machinery). */}
      <ResultBody ctx={ctx} />
    </>
  );
}
