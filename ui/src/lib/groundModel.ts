// groundModel — the read-side model for the L0 ground lens (the far-zoom foundation of the
// one-canvas altitude stack).
//
// It shapes the ALREADY-LOADED GTM object model (channels, people, claims, the board, and the
// backend's ICP grouping) into ICP experiment-grounds: each ICP ground carries the pipelines that
// activate over it as weighted lines, races them as arms on their real throughput, and the People
// shared across those pipelines become the junctions between them. This is the shared kernel made
// visible — one project-owned ICP, and pipelines are activations (views) over it. NOTHING here
// fetches, writes, gates, or triggers a run — every number is derived from real channel/run/appearance
// state, never seeded. When the backend has not yet grouped pipelines by the ICP they test, it falls
// back HONESTLY to a single "primary" ground (the shared-context ICP holding every pipeline) rather
// than inventing several — it never fabricates a pipeline, an arm reading, or a junction.
//
// ── Integrator contract ──────────────────────────────────────────────────────────
// EXACT hook signature (mirrors boardModel.ts useBoard: projectId gates loading/empty, the rest is the
// loaded model already held in GtmCanvasModel). `icpGrouping` is optional and back-compatible — a caller
// still on the five-arg form keeps working and gets the honest single-ground fallback:
//
//   useGround(
//     projectId: string | null,
//     channels: ChannelMeta[],
//     people: Person[],
//     claims: Claim[],
//     board: BoardView | null,
//     icpGrouping?: IcpGrouping | null,   // from GET /api/projects/:id/board → board.icpGrouping
//   ): GroundState
//
// See GroundLens.tsx for the one-line JSX mount.

import { useMemo } from "react";
import type { BoardView, ChannelMeta, Claim, Person } from "@/types";

// ── The backend ICP grouping shape (mirrors board.mjs getPipelineIcpGrouping) ────
// One ground per ICP the project tests: the base "stated" ground holds every pipeline; each
// ICP-targeted experiment is an extra ground racing the pipelines it grouped as arms. Declared here
// (not imported from @/types) so this model stays self-contained while the shared type catches up.
export type IcpGround = {
  icpKey: string | null;
  icpBelief: string | null;
  grounded: boolean;
  // Where this ground came from: "stated" (the project's ICP), "experiment" (an ICP-targeted
  // experiment racing its arms), "explicit-link" (pipelines the founder bound to one ICP key). Open
  // string — the backend may grow new sources and the lens must not drop them.
  source: string;
  experimentId?: string | null;
  channelIds: string[];
  channelNames: string[];
  channelCount: number;
};

export type IcpGrouping = { grounds: IcpGround[] };

// ── The belief state of one pipeline, derived from real channel/run state ────────
// blind      — no graph and no run behind it yet (nothing to believe).
// assumed    — a graph is built but has never been run (an untested belief).
// testing    — it has run at least once (live signal, not yet blessed).
// validated  — the founder explicitly promoted it up the autonomy ladder (a blessed pattern).
export type GroundBeliefState = "blind" | "assumed" | "testing" | "validated";

export type GroundPipeline = {
  channelId: string;
  name: string;
  // 0–1, drives stroke weight + ink darkness (NEVER hue). Derived from run signal + autonomy, honest.
  conviction: number;
  beliefState: GroundBeliefState;
  // Items parked at this pipeline's founder gate — the amber "needs you" count. `channel.pendingGates`.
  needsYouCount: number;
  // Real throughput signal: this pipeline's last run completed and produced flow. Drives the moving
  // "now" ink dot. False for anything never run, failed, or still empty.
  live: boolean;
  // How many steps this pipeline is built from (`channel.nodeCount`) — the honest size read on the card.
  steps: number;
  // Real measured signals used to race arms — items the last run staged, and how many times it ran.
  produced: number;
  runs: number;
};

// One arm in a ground's race — a pipeline measured on the ground's chosen signal. `value` is the real
// number (staged items, or runs), `isLeader` marks the strongest, `proven` is true only when the
// founder validated that pipeline (an autonomy promotion) — the one thing green may ever mean here.
export type GroundArm = {
  channelId: string;
  label: string;
  value: number;
  isLeader: boolean;
  proven: boolean;
};

// The arm-comparison read for a ground with 2+ pipelines. `signal` says what the bars measure;
// `decided` is false when nothing has run yet (honest-blind — no arm leads).
export type GroundMeasurement = {
  signal: "staged" | "runs";
  arms: GroundArm[];
  max: number;
  decided: boolean;
};

export type GroundICP = {
  id: string;
  label: string;
  // A one-line positioning read — project-level BASELINE context, carried only on the stated base
  // ground (once), never parroted onto every band.
  positioning: string | null;
  // "stated" — the project's single stated ICP (base ground). "experiment" — an ICP-targeted
  // experiment racing its grouped pipelines as arms. "explicit-link" — pipelines the founder bound to
  // one ICP key. Open string; unknown sources still render.
  source: string;
  experimentId: string | null;
  // Whether the ICP is actually stated/grounded (false = honest-blank "Your ICP" placeholder ground).
  grounded: boolean;
  pipelines: GroundPipeline[];
  // The arm race across this ground's pipelines — null when there's only one pipeline (no race).
  measurement: GroundMeasurement | null;
};

// A shared entity that appears in two or more pipelines — the junction dot between their lanes.
// `pipelineIds` are the channelIds it touches (matched against the flattened pipeline list). Only
// People are derivable as real junctions from the frontend model today (via Person.appearances);
// "claim" is carried in the type so the same render lights up once the backend links claims to
// channels, but no claim junction is fabricated in the meantime.
export type GroundJunction = {
  type: "person" | "claim";
  id: string;
  label: string;
  pipelineIds: string[];
};

export type GroundModel = {
  icps: GroundICP[];
  junctions: GroundJunction[];
};

export type GroundState =
  | { status: "loading"; model: null; error: null }
  | { status: "empty"; model: null; error: null }
  | { status: "ready"; model: GroundModel; error: null }
  | { status: "error"; model: null; error: string };

// ── Pure derivations (exported so the lens / tests can reuse them) ───────────────

// One channel's real state → its belief on the ground. Autonomy is a founder act, so a promoted
// pipeline reads validated; otherwise run/graph presence decides.
export function beliefStateOf(channel: ChannelMeta): GroundBeliefState {
  if (channel.autonomy === "trusted" || channel.autonomy === "autonomous") return "validated";
  if (channel.runCount > 0) return "testing";
  if (channel.nodeCount > 0) return "assumed";
  return "blind";
}

// Conviction 0–1 from honest signals: a floor per belief state, lifted by real throughput (items the
// last run produced) and by a founder promotion. Clamped. Never random, never seeded.
export function convictionOf(channel: ChannelMeta): number {
  const belief = beliefStateOf(channel);
  const floor =
    belief === "validated" ? 0.7
    : belief === "testing" ? 0.42
    : belief === "assumed" ? 0.3
    : 0.14;
  const produced = channel.lastRunResult?.produced ?? 0;
  // Throughput lift saturates — 20+ produced items is "plenty" for a far-zoom weight read.
  const throughput = Math.min(produced / 20, 1) * 0.28;
  return Math.min(floor + throughput, 1);
}

function pipelineLive(channel: ChannelMeta): boolean {
  return channel.lastRunOk === true && channel.status !== "error" && (channel.lastRunResult?.produced ?? 0) > 0;
}

function pipelineOf(channel: ChannelMeta): GroundPipeline {
  return {
    channelId: channel.id,
    name: channel.name,
    conviction: convictionOf(channel),
    beliefState: beliefStateOf(channel),
    needsYouCount: channel.pendingGates,
    live: pipelineLive(channel),
    steps: channel.nodeCount,
    produced: channel.lastRunResult?.produced ?? 0,
    runs: channel.runCount,
  };
}

// The pipeline's state in plain words, for the overview card — what happened, never internal
// vocabulary or a bare score. Gate-waiting is deliberately NOT repeated here: the amber "waiting on
// you" count next to it is the founder-actionable number. Every line derives from real state.
export function pipelineStatusLine(p: GroundPipeline): string {
  if (p.beliefState === "validated") return "promoted — runs your approved pattern";
  if (p.live) return "ran clean — work is moving through";
  if (p.runs > 0) return "has run";
  if (p.steps > 0) return "built — hasn't run yet";
  return "not shaped yet";
}

// The arm race for a ground: pick the honest signal (staged items if any arm produced, else runs if
// any ran, else nothing has run → decided:false, no leader). Value = the real number; the leader is
// the single strongest; `proven` (green-eligible) is reserved for a founder-validated pipeline. Never
// invents a winner — a tie leaves the first arm as leader, a blind ground leaves none.
export function measurementOf(pipelines: GroundPipeline[]): GroundMeasurement | null {
  if (pipelines.length < 2) return null;
  const staged = pipelines.map((p) => p.produced);
  const runs = pipelines.map((p) => p.runs);
  let signal: "staged" | "runs";
  let values: number[];
  if (staged.some((v) => v > 0)) {
    signal = "staged";
    values = staged;
  } else if (runs.some((v) => v > 0)) {
    signal = "runs";
    values = runs;
  } else {
    // Honest-blind: 2+ arms but nothing has run — show the arms, name no leader.
    return {
      signal: "staged",
      arms: pipelines.map((p) => ({ channelId: p.channelId, label: p.name, value: 0, isLeader: false, proven: false })),
      max: 0,
      decided: false,
    };
  }
  const max = Math.max(...values);
  let leaderTaken = false;
  const arms: GroundArm[] = pipelines.map((p, i) => {
    const isLeader = !leaderTaken && values[i] === max && max > 0;
    if (isLeader) leaderTaken = true;
    return { channelId: p.channelId, label: p.name, value: values[i], isLeader, proven: p.beliefState === "validated" };
  });
  return { signal, arms, max, decided: max > 0 };
}

// Pull a readable line out of the loosely-typed shared ICP bag (mirrors GtmCanvas.readable). Returns
// null if nothing legible is there.
function readable(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of ["label", "name", "segment", "title", "who", "summary", "statement", "text", "description"]) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

// A positioning one-liner for the ground header: the board's positioning belief, else the first
// claim, else null. Real derived state — never invented.
function positioningLine(board: BoardView | null, claims: Claim[]): string | null {
  const positioning = board?.layers.find((l) => l.layer === "positioning")?.belief;
  if (positioning && positioning.trim()) return positioning.trim();
  const claim = claims[0]?.text;
  return claim && claim.trim() ? claim.trim() : null;
}

// People appearing across 2+ of the given pipelines → real junction dots. A Person carries per-channel
// appearances, so this is grounded, not guessed. Scoped to one ground's pipeline set so a tie is only
// drawn between cards that actually sit side by side in the same band.
function personJunctions(people: Person[], channelIds: Set<string>): GroundJunction[] {
  const out: GroundJunction[] = [];
  for (const person of people) {
    const touched = new Set<string>();
    for (const appearance of person.appearances) {
      if (appearance.channelId && channelIds.has(appearance.channelId)) touched.add(appearance.channelId);
    }
    if (touched.size >= 2) {
      out.push({
        type: "person",
        id: person.id,
        label: person.handle || person.name || person.org || "someone",
        pipelineIds: [...touched],
      });
    }
  }
  return out;
}

// ── The model builder ────────────────────────────────────────────────────────────
// Pure: the same inputs always give the same ground. When the backend `icpGrouping` is present, it
// drives the bands — one GroundICP per ICP ground, each holding the real pipelines that activate over
// it (the base stated ICP holds every pipeline; each ICP-targeted experiment is its own ground racing
// its arms). When it is absent (or resolves to nothing), it falls back to a single honest "primary"
// ground over the shared-context ICP. Junctions are scoped per ground so a shared-people tie only links
// cards in the same band.
export function buildGroundModel(
  channels: ChannelMeta[],
  people: Person[],
  claims: Claim[],
  board: BoardView | null,
  icpGrouping?: IcpGrouping | null,
): GroundModel {
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const positioning = positioningLine(board, claims);

  let icps: GroundICP[] = [];
  const grounds = icpGrouping?.grounds ?? [];
  if (grounds.length > 0) {
    icps = grounds
      .map((g, i) => {
        const pipelines = g.channelIds
          .map((id) => channelById.get(id))
          .filter((c): c is ChannelMeta => Boolean(c))
          .map(pipelineOf);
        // The source joins the key so two grounds can never collide (a founder may explicitly link
        // pipelines to the SAME key as the stated ICP — both bands render, each under its own id).
        const id =
          g.source === "experiment" && g.experimentId ? `exp:${g.experimentId}`
          : g.icpKey ? `${g.source}:icp:${g.icpKey}`
          : `ground-${i}`;
        return {
          id,
          label: g.icpBelief || g.icpKey || "Your ICP",
          // Project positioning is baseline context at most: it rides the stated base ground once,
          // never every band — repeated on each it would just parrot the settings paragraph back.
          positioning: g.source === "stated" ? positioning : null,
          source: g.source,
          experimentId: g.experimentId ?? null,
          grounded: g.grounded,
          pipelines,
          measurement: measurementOf(pipelines),
        };
      })
      // A ground with no resolvable pipelines has nothing to place — drop it rather than show an empty band.
      .filter((g) => g.pipelines.length > 0);
  }

  // Honest fallback: the backend has not grouped by ICP yet (or grouped to nothing) → one primary
  // ground over the stated ICP, holding every pipeline.
  if (icps.length === 0) {
    const label = readable(board?.layers.find((l) => l.layer === "icp")?.belief) ?? readable(claims[0]) ?? "Your ICP";
    const pipelines = channels.map(pipelineOf);
    icps = [
      {
        id: "primary",
        label,
        positioning,
        source: "stated",
        experimentId: null,
        grounded: label !== "Your ICP",
        pipelines,
        measurement: measurementOf(pipelines),
      },
    ];
  }

  const junctions: GroundJunction[] = [];
  for (const ground of icps) {
    const ids = new Set(ground.pipelines.map((p) => p.channelId));
    junctions.push(...personJunctions(people, ids));
  }
  return { icps, junctions };
}

// ── The hook ──────────────────────────────────────────────────────────────────────
// Mirrors useBoard's projectId gating: null projectId → honest empty; no built pipelines → empty (the
// ground has nothing to show yet, and it must never seed one). Otherwise ready. It reads state already
// loaded upstream, so there is no async fetch and no loading/error path today — those variants stay in
// GroundState for parity with useBoard and for a future dedicated endpoint.
export function useGround(
  projectId: string | null,
  channels: ChannelMeta[],
  people: Person[],
  claims: Claim[],
  board: BoardView | null,
  icpGrouping?: IcpGrouping | null,
): GroundState {
  return useMemo<GroundState>(() => {
    if (!projectId) return { status: "empty", model: null, error: null };
    if (channels.length === 0) return { status: "empty", model: null, error: null };
    return { status: "ready", model: buildGroundModel(channels, people, claims, board, icpGrouping), error: null };
  }, [projectId, channels, people, claims, board, icpGrouping]);
}
