// GroundLens — L0, the ground: the far-zoom overview of the one-canvas altitude stack. It is the shared
// kernel made visible — the project owns ONE ICP (plus any ICP-targeted experiments), and every pipeline
// is an activation over it. Pipelines land as cards grouped under the ICP they test; where a ground holds
// two or more, its header races them as arms on real throughput (ink bars, the leader called out, a
// founder-validated arm in green, honest-blind when nothing has run). Each card states its pipeline in
// plain words ("built — hasn't run yet", "ran clean — work is moving through"; internal conviction only
// drives the track's ink, never a number the founder reads), a conviction track that reads the pipeline
// as a flow toward its founder gate (the amber notch — the only accent here), a loud "waiting on you"
// count when items wait at that gate, a chip naming the ICP it tests, and the People it shares with its
// siblings — the connective tissue of the shared kernel.
//
// ── Integrator mount (in GtmCanvas) ───────────────────────────────────────────────
//   <GroundLens model={useGround(projectId, channels, people, claims, board, board?.icpGrouping).model} onOpenChannel={...} />
// See groundModel.ts for the exact hook signature.

import { useMemo } from "react";
import { ArrowRight, Crosshair, ShieldCheck, Users } from "lucide-react";
import { pipelineStatusLine } from "@/lib/groundModel";
import type { GroundMeasurement, GroundModel, GroundPipeline } from "@/lib/groundModel";
import "./GroundLens.css";

type GroundLensProps = {
  model: GroundModel | null;
  onOpenChannel: (channelId: string) => void;
};

// Conviction 0–1 → the width of the filled portion of the track (%). A committed pipeline reads as a
// track that has carried flow most of the way to its gate; a blind one barely starts.
function fillPct(conviction: number): number {
  return Math.round(12 + Math.min(Math.max(conviction, 0), 1) * 76); // 12%..88%
}

// Drop the "Target: " prefix the backend stamps on a stated ICP so the card chip stays tight.
function shortIcp(label: string): string {
  return label.replace(/^target:\s*/i, "").trim() || label;
}

// One arm bar's width as a share of the leading arm — a tiny sliver stays visible so a small-but-real
// number never reads as nothing.
function armWidth(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.round(6 + (value / max) * 94); // 6%..100%
}

// The arm race in a band header — only shown where a ground holds 2+ pipelines. It reads the pipelines
// as arms on one honest signal (items staged, else runs) and never invents a winner.
function ArmRace({ measurement }: { measurement: GroundMeasurement }) {
  const { signal, arms, max, decided } = measurement;
  const leader = arms.find((a) => a.isLeader) ?? null;
  const total = arms.reduce((sum, a) => sum + a.value, 0);
  const unit = signal === "staged" ? "staged" : "runs";
  const head = !decided
    ? "no runs yet — nothing to compare"
    : leader
      ? `${leader.label} leads · ${total} ${unit} across ${arms.length} arms`
      : `${total} ${unit} across ${arms.length} arms`;
  return (
    <div className="ground-race" role="group" aria-label={`Arm comparison: ${head}`}>
      <div className="ground-race-head">{head}</div>
      <div className="ground-race-rows">
        {arms.map((a) => (
          <div className="ground-arm" key={a.channelId}>
            <span className="ground-arm-name" title={a.label}>{a.label}</span>
            <span className="ground-arm-track">
              <span
                className={`ground-arm-fill${a.isLeader ? " is-leader" : ""}${a.proven ? " is-proven" : ""}`}
                style={{ width: `${armWidth(a.value, max)}%` }}
                aria-hidden
              />
            </span>
            <span className="ground-arm-val">{decided ? a.value : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// One pipeline card. The track is the transit idea made compact: a rail from find → its founder gate,
// filled by conviction, the gate a fixed amber notch near the end, a moving ink dot when it's live. The
// kernel chip names the ICP it tests; the shares line is the junction tie to the siblings it shares a
// real Person with.
function PipelineCard({
  pipeline,
  icpLabel,
  sharesWith,
  sharedCount,
  onOpen,
}: {
  pipeline: GroundPipeline;
  icpLabel: string;
  sharesWith: string[];
  sharedCount: number;
  onOpen: () => void;
}) {
  const { name, conviction, beliefState, needsYouCount, live, steps } = pipeline;
  return (
    <button type="button" className={`gc-card gc-${beliefState}`} onClick={onOpen}>
      <div className="gc-head">
        <span className="gc-name">{name}</span>
      </div>

      <div className="gc-meta">
        {steps > 0 ? `${steps} step${steps === 1 ? "" : "s"}` : "not shaped yet"}
        <ArrowRight size={11} aria-hidden />
        <ShieldCheck size={11} aria-hidden className="gc-meta-gate" />
        your gate
      </div>

      <div className="gc-track">
        <span className="gc-track-fill" style={{ width: `${fillPct(conviction)}%` }} />
        {live ? <span className="gc-track-now" style={{ left: `${Math.min(fillPct(conviction), 82)}%` }} /> : null}
        <span className="gc-track-gate" />
        <span className="gc-track-end" />
      </div>

      <div className="gc-foot">
        <span className={`gc-status gc-${beliefState}`}>
          <span className="gc-dot" />
          {pipelineStatusLine(pipeline)}
        </span>
        {needsYouCount > 0 ? (
          <span className="gc-needs"><span className="gc-needs-dot" />{needsYouCount} waiting on you</span>
        ) : null}
      </div>

      <div className="gc-kernel">
        <span className="gc-chip gc-chip-icp" title={`Tests ${icpLabel}`}>
          <Crosshair size={10} aria-hidden />
          <span>tests {shortIcp(icpLabel)}</span>
        </span>
        {sharedCount > 0 ? (
          <span className="gc-chip" title={`Shares ${sharedCount} ${sharedCount === 1 ? "person" : "people"} with siblings`}>
            <Users size={10} aria-hidden />
            <span>{sharedCount} shared</span>
          </span>
        ) : null}
      </div>

      {sharesWith.length > 0 ? (
        <div className="gc-shares">
          <span className="gc-shares-tie" aria-hidden />
          <span>also in {sharesWith.slice(0, 2).join(", ")}{sharesWith.length > 2 ? ` +${sharesWith.length - 2}` : ""}</span>
        </div>
      ) : null}
    </button>
  );
}

// The band's eyebrow in plain words — where this audience grouping came from. Open on source: an
// unknown source still reads as an audience rather than dropping the eyebrow.
function bandEyebrow(source: string): string {
  if (source === "experiment") return "An audience you're testing";
  if (source === "explicit-link") return "An audience you linked";
  if (source === "stated") return "Your audience";
  return "Audience";
}

export function GroundLens({ model, onOpenChannel }: GroundLensProps) {
  // For each pipeline: the sibling pipelines it shares a real Person with (names, for the junction tie)
  // and how many distinct People it shares (the kernel chip count). Junctions are already scoped per
  // ground, so a tie only ever names a card sitting in the same band.
  const shareInfo = useMemo(() => {
    const nameOf = new Map<string, string>();
    const siblings = new Map<string, Set<string>>();
    const peopleIds = new Map<string, Set<string>>();
    if (!model) return { siblings, count: new Map<string, number>() };
    for (const icp of model.icps) for (const p of icp.pipelines) nameOf.set(p.channelId, p.name);
    for (const j of model.junctions) {
      for (const a of j.pipelineIds) {
        if (!nameOf.has(a)) continue;
        if (!siblings.has(a)) siblings.set(a, new Set());
        if (!peopleIds.has(a)) peopleIds.set(a, new Set());
        peopleIds.get(a)!.add(j.id);
        for (const b of j.pipelineIds) if (b !== a && nameOf.has(b)) siblings.get(a)!.add(nameOf.get(b)!);
      }
    }
    const count = new Map<string, number>();
    for (const [id, set] of peopleIds) count.set(id, set.size);
    return { siblings, count };
  }, [model]);

  const totals = useMemo(() => {
    if (!model) return { pipelines: 0, testing: 0, needsYou: 0 };
    // A pipeline can activate over more than one ground; count each pipeline once for the top strip.
    const seen = new Set<string>();
    let testing = 0, needsYou = 0;
    for (const icp of model.icps) for (const p of icp.pipelines) {
      if (seen.has(p.channelId)) continue;
      seen.add(p.channelId);
      if (p.beliefState === "testing" || p.beliefState === "validated") testing++;
      needsYou += p.needsYouCount;
    }
    return { pipelines: seen.size, testing, needsYou };
  }, [model]);

  if (!model || model.icps.every((i) => i.pipelines.length === 0)) {
    return (
      <div className="ground-lens ground-lens--empty">
        <div className="ground-empty">
          <strong>No pipelines on the ground yet</strong>
          <span>Name a pipeline and Claude composes it into a flow up to your gate. Once one exists, it lands here under the ICP it tests.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ground-lens">
      <header className="ground-top">
        <div className="ground-top-stats">
          <span><b>{totals.pipelines}</b> pipeline{totals.pipelines === 1 ? "" : "s"}</span>
          <span className="ground-sep" />
          <span><b>{model.icps.length}</b> audience{model.icps.length === 1 ? "" : "s"}</span>
          <span className="ground-sep" />
          <span><b>{totals.testing}</b> running</span>
          {totals.needsYou > 0 ? (
            <>
              <span className="ground-sep" />
              <span className="ground-top-needs"><span className="gc-needs-dot" /><b>{totals.needsYou}</b> waiting on you</span>
            </>
          ) : null}
        </div>
      </header>

      {model.icps.map((icp) => {
        // The People shared across THIS ground's pipelines — first-class nodes on the canvas, not a
        // side rail. In-band fatigue = how many of the ground's pipelines a person sits in; a person in
        // 3+ turns amber (over-contacted). Real, from Person.appearances — never seeded.
        const bandIds = new Set(icp.pipelines.map((p) => p.channelId));
        const sharedPeople = model.junctions
          .filter((j) => j.type === "person")
          .map((j) => ({ id: j.id, label: j.label, reach: j.pipelineIds.filter((id) => bandIds.has(id)).length }))
          .filter((p) => p.reach >= 2)
          .sort((a, b) => b.reach - a.reach);
        return (
        <section className={`ground-band ground-band--${icp.source}`} key={icp.id}>
          <div className="ground-band-rail" />
          <div className="ground-band-head">
            <div className="ground-band-eyebrow">{bandEyebrow(icp.source)}</div>
            <h2 className="ground-band-title">{icp.label}</h2>
            {icp.positioning && icp.positioning !== icp.label ? (
              <p className="ground-band-pos">{icp.positioning}</p>
            ) : null}
            {icp.measurement ? <ArmRace measurement={icp.measurement} /> : null}
            {sharedPeople.length > 0 ? (
              <div className="ground-shared">
                <span className="ground-shared-label"><Users size={11} aria-hidden />shared people</span>
                {sharedPeople.slice(0, 6).map((p) => (
                  <span key={p.id} className={`gs-person ${p.reach >= 3 ? "gs-hot" : ""}`} title={`${p.label} — in ${p.reach} of this ground's pipelines${p.reach >= 3 ? " · over-contacted" : ""}`}>
                    <span className="gs-dot" />{p.label}<small>{p.reach}×</small>
                  </span>
                ))}
                {sharedPeople.length > 6 ? <span className="gs-more">+{sharedPeople.length - 6}</span> : null}
              </div>
            ) : null}
          </div>
          <div className="ground-cards">
            {icp.pipelines.map((p) => (
              <PipelineCard
                key={p.channelId}
                pipeline={p}
                icpLabel={icp.label}
                sharesWith={[...(shareInfo.siblings.get(p.channelId) ?? [])]}
                sharedCount={shareInfo.count.get(p.channelId) ?? 0}
                onOpen={() => onOpenChannel(p.channelId)}
              />
            ))}
          </div>
        </section>
        );
      })}
    </div>
  );
}
