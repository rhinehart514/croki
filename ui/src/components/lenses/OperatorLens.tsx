// OperatorLens — the one operating view over the whole go-to-market fleet (GTM-MACHINE.md Area 6).
//
// The shared-map operating surface. Every motion — an outbound lane, a programmatic-page lane, a
// product-change lane — is drawn as ONE uniform lane in ONE grammar: the same calm stage strip, the
// same health dot, the same parked-state. Color earns its place ONLY for state (live / needs-you),
// never to decorate or distinguish motion kinds. Beside the lanes, the money shot: every shared object
// drawn ONCE with a tie to the lanes that both touched it — "one person, many motions, never worked
// twice." Area 4's plan renders as proposed-state lanes in the same view. Area 1's funnel is this lens
// zoomed to objects. Attention pulses in place: a run parked at the founder gate lights its lane, and
// one click flies to it (panSignal → the real gate).
//
// STRICTLY read-only. It renders state and routes to real decisions/objects; it NEVER emits a next-move
// recommendation. Every health number and derived object state carries its receipt (which run, which
// outcome) on inspection — the part a screenshot can't clone. All data is a pure backend read
// (getOperatingView); this component derives nothing and seeds nothing.

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type {
  OperatingView, OperatingLane, OperatingObject, OperatingProvenance, OperatingStage,
} from "@/types";
import "./OperatorLens.css";

type OperatorLensProps = {
  // The whole fleet read, composed by the backend. Null before the first read resolves (loading).
  view: OperatingView | null;
  // Fly to a parked run's real gate — the one click that opens the founder gate for that lane. Given the
  // pending-decision id and the pipeline/session location the inbox row carries.
  onFlyToGate?: (target: { decisionId: string; sessionId: string | null; pipelineId: string | null; channelId: string }) => void;
  // Open a lane's pipeline in the Engineer lens (the single-motion editor) — a quiet route, never forced.
  onOpenLane?: (channelId: string) => void;
  // A fresh product with nothing wired yet lands here — the compose invitation, not empty scaffolding.
  onComposeFirst?: () => void;
};

// ── Health → band. The same figure the engine node badge shows; here it only picks the semantic dot.
// A motion with no signal reads "blind" (grey), never a confident fake.
function healthBand(health: number, provenance: OperatingProvenance): "good" | "watch" | "hurt" | "blind" {
  if (provenance.kind === "bet") return "blind";
  if (health >= 66) return "good";
  if (health >= 33) return "watch";
  if (health > 0) return "hurt";
  return "blind";
}

// The plain-words run-state label — state, spoken. Never "you should".
function runLabel(lane: OperatingLane): string {
  switch (lane.runState) {
    case "running": return "Working now";
    case "parked": return "Needs you";
    case "error": return "Snagged";
    default: return "At rest";
  }
}

// A relative "how long it's been waiting" line for a parked lane — quiet, factual.
function sinceLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

// The provenance receipt as an inspectable title string — plain words plus the ids so a founder can
// trace a number back to the run/outcome/probe that produced it. Grounded facts read differently from
// bets (a bet says so honestly instead of borrowing confidence).
function provReceipt(p: OperatingProvenance): string {
  const bits = [p.kind === "bet" ? "A bet — no signal yet" : "Grounded", p.basis].filter(Boolean);
  if (p.runId) bits.push(`run ${p.runId}`);
  if (p.outcomeId) bits.push(`outcome ${p.outcomeId}`);
  if (p.probe) bits.push(`probe ${p.probe}`);
  return bits.join(" · ");
}

// ── One emergent stage strip — this motion's OWN steps, in flow order, the active one named. ──
function StageStrip({ stages }: { stages: OperatingStage[] }) {
  if (!stages.length) return null;
  return (
    <div className="op-stages" role="list" aria-label="Steps">
      {stages.map((stage, i) => (
        <span key={stage.id} style={{ display: "inline-flex", alignItems: "center" }}>
          {i > 0 ? <span className="op-stage-sep" aria-hidden /> : null}
          <span className="op-stage" data-state={stage.active ? "active" : stage.state} role="listitem">
            <span className="op-stage-dot" aria-hidden />
            {stage.label}
          </span>
        </span>
      ))}
    </div>
  );
}

// ── The efficiency read — tabular, honest. Never a fabricated rate: nothing measured reads as such. ──
function EfficiencyRow({ lane }: { lane: OperatingLane }) {
  const eff = lane.efficiency;
  if (!eff) return null;
  const outcomes = Object.entries(eff.outcomesByKind).sort((a, b) => b[1] - a[1]);
  const measuredNone = eff.measured === 0;
  return (
    <div className="op-eff">
      <span className="op-eff-metric"><b>{eff.staged}</b> staged</span>
      {measuredNone ? (
        <span className="op-eff-unmeasured">nothing measured yet</span>
      ) : (
        <span className="op-eff-metric">
          <b>{eff.measured}</b> measured
          {eff.coverage != null ? <span> · {Math.round(eff.coverage * 100)}% covered</span> : null}
        </span>
      )}
      {outcomes.length ? (
        <span className="op-eff-outcomes">
          {outcomes.map(([kind, n]) => (
            <span key={kind} className="op-eff-outcome">{n} {kind}</span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

// ── One lane — the uniform card every motion kind gets. Running / parked / proposed differ only in
// state color and the dashed proposed treatment; the SHAPE is identical. ──
function Lane({
  lane, onFlyToGate, onOpenLane,
}: {
  lane: OperatingLane;
  onFlyToGate?: OperatorLensProps["onFlyToGate"];
  onOpenLane?: OperatorLensProps["onOpenLane"];
}) {
  const band = healthBand(lane.health, lane.healthProvenance);
  const parked = lane.runState === "parked" && lane.parked;
  const openGate = () => {
    if (parked && onFlyToGate) {
      onFlyToGate({
        decisionId: lane.parked!.decisionId,
        sessionId: lane.parked!.sessionId,
        pipelineId: lane.parked!.pipelineId,
        channelId: lane.channelId,
      });
    } else if (onOpenLane) {
      onOpenLane(lane.channelId);
    }
  };
  const clickable = Boolean(parked && onFlyToGate);
  return (
    <div
      className="op-lane"
      id={`op-lane-${lane.channelId}`}
      data-state={lane.runState}
      data-proposed={lane.proposed ? "true" : undefined}
      onClick={clickable ? openGate : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openGate(); } } : undefined}
    >
      <div className="op-lane-top">
        <span className="op-lane-name">{lane.name}</span>
        {lane.motionKind ? <span className="op-lane-kind">{lane.motionKind}</span> : null}
        {lane.proposed ? (
          <span className="op-origin" data-origin={lane.origin ?? "speculative"}>
            {lane.origin === "derived" ? "from your code" : "a bet"}
          </span>
        ) : (
          <span className="op-health" data-band={band} title={provReceipt(lane.healthProvenance)}>
            <span className="op-health-dot" aria-hidden />
            <span className="op-health-num">{Math.round(lane.health)}</span>
            <span>health</span>
          </span>
        )}
      </div>

      {!lane.proposed ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span className="op-run" data-state={lane.runState}>
            {lane.runState === "running" ? <span className="op-live-dot" aria-hidden /> : null}
            {runLabel(lane)}
          </span>
          {parked ? (
            <span className="op-park-open">
              Open your gate{sinceLabel(lane.parked!.waitingSince) ? ` · waiting ${sinceLabel(lane.parked!.waitingSince)}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      {lane.proposed && lane.rationale ? (
        <div className="op-lane-rationale">{lane.rationale}</div>
      ) : null}

      <StageStrip stages={lane.stages} />

      {!lane.proposed ? <EfficiencyRow lane={lane} /> : null}
    </div>
  );
}

// ── One shared object on the map — drawn ONCE, tied to every lane that touched it. ──
function ObjectRow({
  obj, laneNames, onOpenLane,
}: {
  obj: OperatingObject;
  laneNames: Map<string, string>;
  onOpenLane?: OperatorLensProps["onOpenLane"];
}) {
  const shared = obj.lanes.length >= 2;
  const bucketLabel = obj.bucket === "in_flight" ? "in flight"
    : obj.bucket === "handled" ? "handled"
    : obj.bucket === "suppressed" ? "set aside"
    : "seen";
  return (
    <div className="op-obj" data-shared={shared ? "true" : undefined} data-bucket={obj.bucket}>
      <div className="op-obj-top">
        <span className="op-obj-kind">{obj.kind}</span>
        <span className="op-obj-label" title={obj.objectKey}>{obj.label ?? obj.objectKey}</span>
        <span className="op-obj-bucket">{bucketLabel}</span>
      </div>
      <div className="op-obj-ties">
        {obj.lanes.map((channelId) => (
          <span
            key={channelId}
            className="op-tie"
            role={onOpenLane ? "button" : undefined}
            tabIndex={onOpenLane ? 0 : undefined}
            onClick={onOpenLane ? () => onOpenLane(channelId) : undefined}
            onKeyDown={onOpenLane ? (e) => { if (e.key === "Enter") onOpenLane(channelId); } : undefined}
          >
            {laneNames.get(channelId) ?? channelId}
          </span>
        ))}
      </div>
      <span className="op-obj-worked" title={provReceipt(obj.provenance)}>
        {shared
          ? <>Touched by <b>{obj.motionCount}</b> motions — never worked twice</>
          : <>Touched by <b>1</b> motion · {obj.touchCount} time{obj.touchCount === 1 ? "" : "s"}</>}
      </span>
    </div>
  );
}

export function OperatorLens({ view, onFlyToGate, onOpenLane, onComposeFirst }: OperatorLensProps) {
  const laneNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const lane of view?.lanes ?? []) map.set(lane.channelId, lane.name);
    return map;
  }, [view]);

  // Split real lanes from proposed plan lanes so the group labels read honestly.
  const { liveLanes, proposedLanes } = useMemo(() => {
    const live: OperatingLane[] = [];
    const proposed: OperatingLane[] = [];
    for (const lane of view?.lanes ?? []) (lane.proposed ? proposed : live).push(lane);
    return { liveLanes: live, proposedLanes: proposed };
  }, [view]);

  // The shared map draws objects touched by 2+ lanes first (the ties — the money shot), then the rest by
  // recency. An object nothing has touched simply isn't here; an empty map reads honestly.
  const mapObjects = useMemo(() => {
    const objs = [...(view?.objects ?? [])];
    objs.sort((a, b) => {
      const as = a.lanes.length >= 2 ? 1 : 0;
      const bs = b.lanes.length >= 2 ? 1 : 0;
      return bs - as || String(b.lastSeenAt ?? "").localeCompare(String(a.lastSeenAt ?? ""));
    });
    return objs;
  }, [view]);

  // Nothing wired yet → the compose invitation, never empty scaffolding.
  if (view && view.lanes.length === 0) {
    return (
      <div className={cn("operator-lens")}>
        <div className="op-empty">
          <strong>Your operation lives here</strong>
          <span>
            Every go-to-market motion you run shows up as a lane on one map — outbound, pages minted from
            your data, product changes — with the people and places they share drawn once. State a goal and
            the first motion appears. Nothing sends without you.
          </span>
          {onComposeFirst ? (
            <button type="button" className="blank-channel-compose" onClick={onComposeFirst}>
              State a go-to-market goal
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const parkedCount = liveLanes.filter((l) => l.runState === "parked").length;
  const runningCount = liveLanes.filter((l) => l.runState === "running").length;
  const sharedCount = mapObjects.filter((o) => o.lanes.length >= 2).length;

  return (
    <div className={cn("operator-lens")}>
      <div className="op-head">
        <span className="op-head-title">Your operation</span>
        {view?.planStale ? (
          <span className="op-stale" title="The plan below was proposed before your last scan. Refresh it when you want.">
            plan older than your last scan
          </span>
        ) : null}
        <div className="op-head-counts">
          <span className="op-head-count"><b>{liveLanes.length}</b>motions</span>
          {runningCount ? <span className="op-head-count"><b>{runningCount}</b>working</span> : null}
          {parkedCount ? <span className="op-head-count"><b>{parkedCount}</b>need you</span> : null}
        </div>
      </div>

      <div className="op-body">
        <div className="op-lanes">
          {liveLanes.map((lane) => (
            <Lane key={lane.channelId} lane={lane} onFlyToGate={onFlyToGate} onOpenLane={onOpenLane} />
          ))}

          {proposedLanes.length ? (
            <>
              <div className="op-lanes-group-label">Proposed — not running yet</div>
              {proposedLanes.map((lane) => (
                <Lane key={lane.channelId} lane={lane} onFlyToGate={onFlyToGate} onOpenLane={onOpenLane} />
              ))}
            </>
          ) : null}

          {!view ? (
            <div className="op-empty"><span>Reading your operation…</span></div>
          ) : null}
        </div>

        <div className="op-map">
          <div className="op-map-head">
            <span className="op-map-title">The shared map</span>
            <span className="op-map-sub">
              {sharedCount
                ? `${sharedCount} object${sharedCount === 1 ? "" : "s"} touched by more than one motion — drawn once so nothing gets worked twice.`
                : "Every person, place, and page your motions touch, drawn once."}
            </span>
          </div>
          {mapObjects.length > 0 ? (
            <div className="op-map-objects">
              {mapObjects.map((obj) => (
                <ObjectRow key={obj.objectKey} obj={obj} laneNames={laneNames} onOpenLane={onOpenLane} />
              ))}
            </div>
          ) : null}
          {view && mapObjects.length === 0 ? (
            <div className="op-prov">Nothing touched yet — objects appear as your motions run.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
