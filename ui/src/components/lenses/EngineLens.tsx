// EngineLens — the GTM engine view. The whole go-to-market as one canvas: every channel as a
// frosted node, the real links between channels drawn as "feeds", and a top pulse strip of engine
// vitals. The founder's overview altitude — read the whole system at a glance and reach in.
//
// Two kinds of feed:
//   • undirected (faint, unlabeled-by-direction) — channels that touch the same prospects/claims.
//   • directional (arrowed) — the founder DREW it: one channel pulls another's output. Drag from a
//     node's output handle onto another node to wire it (the "derived source"); the arrow appears.
//
// The surface ROUTES YOU to what needs you: blocked/waiting channels are promoted into a focal tier.
//
// Honest by construction: node state and the pulse derive from real channel signal; undirected feeds
// from real shared entities; directional feeds are real persisted topology. Nothing is seeded, and
// drawing a feed only declares where input comes from — the founder gate still gates every send.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChannelMeta, ChannelFeed, DirectedFeed } from "@/types";
import "./EngineLens.css";

type ChannelState = "live" | "needs" | "blocked" | "idle";
type Placed = { x: number; y: number; w: number; h: number };
type Tier = { key: string; label: string | null; channels: ChannelMeta[]; w: number; h: number; cols: number };

const STATE_LABEL: Record<ChannelState, string> = { live: "live", needs: "needs you", blocked: "blocked", idle: "idle" };
const SEVERITY: Record<ChannelState, number> = { blocked: 0, needs: 1, live: 2, idle: 3 };

// What a channel actually DID with the items it produced, read in funnel order so the strip reads
// left-to-right like the motion itself ("12 found · 8 drafted · 5 staged"). Raw category keys never
// reach the founder. Only producing categories appear; categories that made nothing are dropped.
const PRODUCED_VERB: Record<string, string> = {
  source: "found", enrich: "enriched", filter: "kept",
  generate: "drafted", gate: "staged", execute: "ready", measure: "measured",
};
const PRODUCED_ORDER = ["source", "enrich", "filter", "generate", "gate", "execute", "measure"];

function producedChips(byCategory: Record<string, number>): { label: string; count: number }[] {
  return PRODUCED_ORDER
    .filter((cat) => (byCategory[cat] ?? 0) > 0)
    .map((cat) => ({ label: PRODUCED_VERB[cat] ?? cat, count: byCategory[cat] }));
}

function channelState(ch: ChannelMeta): ChannelState {
  // The founder gate is the happy path, not a failure — a run that staged items and stopped at the
  // wall reports lastRunOk:false (it never completed, by design). Check the gate BEFORE the error
  // state so "your review is required" reads as amber "needs you", never red "blocked".
  if (ch.pendingGates > 0 || ch.status === "waiting") return "needs";
  if (ch.status === "error" || ch.lastRunOk === false) return "blocked";
  if (ch.runCount > 0) return "live";
  return "idle";
}

const ATT_W = 300, ATT_H = 158;
const CALM_W = 248, CALM_H = 134;
const COL_GAP = 72, ROW_GAP = 60, TIER_GAP = 40, LABEL_H = 30;

function layoutTiers(tiers: Tier[]): {
  pos: Map<string, Placed>;
  labels: { key: string; label: string; count: number; y: number }[];
  width: number;
  height: number;
} {
  let canvasW = 0;
  for (const t of tiers) {
    const inRow = Math.min(t.cols, t.channels.length);
    if (inRow > 0) canvasW = Math.max(canvasW, inRow * t.w + (inRow - 1) * COL_GAP);
  }
  const pos = new Map<string, Placed>();
  const labels: { key: string; label: string; count: number; y: number }[] = [];
  let y = 0;
  for (const t of tiers) {
    if (!t.channels.length) continue;
    if (t.label) { labels.push({ key: t.key, label: t.label, count: t.channels.length, y }); y += LABEL_H; }
    const rows = Math.ceil(t.channels.length / t.cols);
    t.channels.forEach((ch, i) => {
      const r = Math.floor(i / t.cols), c = i % t.cols;
      const inRow = Math.min(t.cols, t.channels.length - r * t.cols);
      const rowW = inRow * t.w + (inRow - 1) * COL_GAP;
      const x0 = (canvasW - rowW) / 2;
      pos.set(ch.id, { x: x0 + c * (t.w + COL_GAP), y: y + r * (t.h + ROW_GAP), w: t.w, h: t.h });
    });
    y += rows * t.h + (rows - 1) * ROW_GAP + TIER_GAP;
  }
  return { pos, labels, width: canvasW, height: Math.max(0, y - TIER_GAP) };
}

const center = (b: Placed) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

// The point on box `b`'s perimeter aimed at (tx,ty) — so an arrow lands on the edge, not under the card.
function edgePoint(b: Placed, tx: number, ty: number): { x: number; y: number } {
  const c = center(b);
  const dx = tx - c.x, dy = ty - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx === 0 ? Infinity : (b.w / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (b.h / 2) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

function curve(ax: number, ay: number, bx: number, by: number): string {
  const mx = (ax + bx) / 2;
  return `M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`;
}

export function EngineLens({
  channels, channelFeeds, directedFeeds, activeChannelId, onDeriveChannel, onOpenChannel,
  icpLabel = null, claimLabel = null,
}: {
  channels: ChannelMeta[];
  channelFeeds: ChannelFeed[];
  directedFeeds: DirectedFeed[];
  activeChannelId: string | null;
  onDeriveChannel: (toChannelId: string, fromChannelId: string) => void;
  onOpenChannel: (channelId: string) => void;
  // The shared context every channel inherits — the ICP and the headline claim. Folded in from the
  // retired portfolio-map lens so this single overview carries both the network AND its context.
  icpLabel?: string | null;
  claimLabel?: string | null;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ fromId: string; x: number; y: number } | null>(null);

  const built = useMemo(() => channels.filter((ch) => ch.nodeCount > 0), [channels]);

  const { layout, stateOf } = useMemo(() => {
    const stateOf = new Map<string, ChannelState>(built.map((ch) => [ch.id, channelState(ch)]));
    const bySeverity = (a: ChannelMeta, b: ChannelMeta) => SEVERITY[stateOf.get(a.id)!] - SEVERITY[stateOf.get(b.id)!];
    const attention = built.filter((ch) => ["blocked", "needs"].includes(stateOf.get(ch.id)!)).sort(bySeverity);
    const calm = built.filter((ch) => ["live", "idle"].includes(stateOf.get(ch.id)!)).sort(bySeverity);
    const calmLabel = attention.length && calm.length
      ? (calm.some((ch) => stateOf.get(ch.id) === "live") ? "Running" : "Idle")
      : null;
    const tiers: Tier[] = [
      { key: "attention", label: attention.length ? "Needs you" : null, channels: attention, w: ATT_W, h: ATT_H, cols: 3 },
      { key: "calm", label: calmLabel, channels: calm, w: CALM_W, h: CALM_H, cols: 4 },
    ];
    return { layout: layoutTiers(tiers), stateOf };
  }, [built]);

  const present = useMemo(() => new Set(built.map((ch) => ch.id)), [built]);
  const feeds = useMemo(
    () => channelFeeds.filter((f) => present.has(f.fromChannel) && present.has(f.toChannel)).slice(0, 8),
    [channelFeeds, present],
  );
  const directed = useMemo(
    () => directedFeeds.filter((f) => present.has(f.fromChannel) && present.has(f.toChannel)),
    [directedFeeds, present],
  );

  // Drag-to-connect: track the pointer on the window so the line follows even off a node, and on
  // release wire the channel under the pointer to pull the dragged channel's output.
  useEffect(() => {
    if (!drag) return;
    const toCanvas = (e: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null;
    };
    const move = (e: PointerEvent) => { const p = toCanvas(e); if (p) setDrag((d) => (d ? { ...d, ...p } : d)); };
    const up = (e: PointerEvent) => {
      const p = toCanvas(e);
      if (p) {
        const target = built.find((ch) => {
          const b = layout.pos.get(ch.id);
          return b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
        });
        if (target && target.id !== drag.fromId) onDeriveChannel(target.id, drag.fromId);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, built, layout, onDeriveChannel]);

  if (!built.length) {
    return (
      <div className="canvas-empty">
        <strong>No channels yet</strong>
        <span>Build a channel and the engine view shows it here, with its live links to the rest.</span>
      </div>
    );
  }

  return (
    <div className="engine-lens">
      {(icpLabel || claimLabel) && (
        <div className="portfolio-head">
          {icpLabel && (
            <div className="portfolio-head-row">
              <span className="portfolio-head-eyebrow">ICP</span>
              <span className="portfolio-head-value">{icpLabel}</span>
            </div>
          )}
          {claimLabel && (
            <div className="portfolio-head-row">
              <span className="portfolio-head-eyebrow">Claim</span>
              <span className="portfolio-head-value">{claimLabel}</span>
            </div>
          )}
        </div>
      )}
      <div className="engine-canvas-scroll">
        <div ref={canvasRef} className={`engine-canvas ${drag ? "dragging" : ""}`} style={{ width: layout.width, height: layout.height }}>
          <svg className="engine-wires" width={layout.width} height={layout.height} aria-hidden="true">
            <defs>
              <marker id="engine-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" className="engine-arrow-head" />
              </marker>
            </defs>

            {/* undirected shared-entity feeds */}
            {feeds.map((f) => {
              const a = layout.pos.get(f.fromChannel), b = layout.pos.get(f.toChannel);
              if (!a || !b) return null;
              const ca = center(a), cb = center(b);
              const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
              return (
                <g key={`u-${f.fromChannel}-${f.toChannel}`}>
                  <path className="engine-wire" d={curve(ca.x, ca.y, cb.x, cb.y)} />
                  <foreignObject x={mid.x - 70} y={mid.y - 12} width="140" height="24">
                    <div className="engine-feed-chip" title={f.label}>{f.label}</div>
                  </foreignObject>
                </g>
              );
            })}

            {/* directional, founder-drawn feeds (an arrow from producer to consumer) */}
            {directed.map((f) => {
              const a = layout.pos.get(f.fromChannel), b = layout.pos.get(f.toChannel);
              if (!a || !b) return null;
              const ca = center(a), cb = center(b);
              const start = edgePoint(a, cb.x, cb.y);
              const end = edgePoint(b, ca.x, ca.y);
              const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
              return (
                <g key={`d-${f.fromChannel}-${f.toChannel}`}>
                  <path className="engine-wire-directed" d={curve(start.x, start.y, end.x, end.y)} markerEnd="url(#engine-arrow)" />
                  <foreignObject x={mid.x - 44} y={mid.y - 12} width="88" height="24">
                    <div className="engine-feed-chip directed" title="This channel pulls the other channel's output">feeds output</div>
                  </foreignObject>
                </g>
              );
            })}

            {/* the live line while dragging a new feed */}
            {drag && (() => {
              const a = layout.pos.get(drag.fromId);
              if (!a) return null;
              return <path className="engine-wire-drag" d={`M ${a.x + a.w} ${a.y + a.h / 2} L ${drag.x} ${drag.y}`} markerEnd="url(#engine-arrow)" />;
            })()}
          </svg>

          {layout.labels.map((l) => (
            <div key={l.key} className="engine-tier-label" style={{ left: 0, top: l.y, width: layout.width }}>
              {l.label} <span className="engine-tier-count">{l.count}</span>
            </div>
          ))}

          {built.map((ch) => {
            const p = layout.pos.get(ch.id);
            if (!p) return null;
            const state = stateOf.get(ch.id)!;
            const focal = state === "blocked" || state === "needs";
            return (
              <button
                key={ch.id}
                type="button"
                className={`engine-node state-${state} ${focal ? "focal" : ""} ${ch.id === activeChannelId ? "active" : ""}`}
                style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
                onClick={() => { if (!drag) onOpenChannel(ch.id); }}
              >
                <span className="engine-node-top">
                  <span className="engine-node-kind">{ch.kind || "channel"}</span>
                  <span className={`engine-node-state state-${state}`}>
                    <span className="dot" /> {STATE_LABEL[state]}
                  </span>
                </span>
                <span className="engine-node-name">{ch.name}</span>
                <span className="engine-node-obj">{ch.objective || "No objective set"}</span>
                {ch.lastRunResult && ch.lastRunResult.produced > 0 && (
                  <span className="engine-node-produced">
                    {producedChips(ch.lastRunResult.byCategory).map((c) => (
                      <span key={c.label} className="engine-produced-chip">
                        <span className="engine-produced-count">{c.count}</span> {c.label}
                      </span>
                    ))}
                  </span>
                )}
                <span className="engine-node-foot">
                  <span>{ch.nodeCount} step{ch.nodeCount === 1 ? "" : "s"}</span>
                  <span className="sep">·</span>
                  <span>{ch.runCount > 0 ? `${ch.runCount} run${ch.runCount === 1 ? "" : "s"}` : "never run"}</span>
                  {ch.pendingGates > 0 && <span className="engine-node-gate">{ch.pendingGates} at gate</span>}
                </span>
              </button>
            );
          })}

          {/* output handles — drag one onto another channel to feed it (separate layer so the node
              stays a semantic button without a nested interactive child). */}
          {built.map((ch) => {
            const p = layout.pos.get(ch.id);
            if (!p) return null;
            return (
              <span
                key={`out-${ch.id}`}
                className="engine-node-out"
                title="Drag onto another channel to feed it this channel's output"
                style={{ left: p.x + p.w - 7, top: p.y + p.h / 2 - 7 }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  const rect = canvasRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setDrag({ fromId: ch.id, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
