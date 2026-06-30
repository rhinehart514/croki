// GtmBoard — the GTM home, board altitude. Zoomed all the way out, the canvas IS a nine-band board of
// go-to-market beliefs, grouped Strategy (1-4) · Motion (5-6) · Loop (7-9). One line per band: number ·
// name · the belief derived from real state · a grounding badge · a confidence pill · a live-experiment
// fork glyph when experiments exist. Matches docs/gtm-board-mockups/01-board.html.
//
// Semantic zoom IS the navigation. Click (or fly via the ladder) into a band and it springs open to
// fill the frame while the other eight collapse to thin labeled peek-rails — the stack order never
// changes. For now the open body is a clean "diagram lands next" placeholder built from the band's
// real belief + experiments, EXCEPT the Channels band, which mounts the existing EngineLens.
//
// Pure read: the board never gates, never triggers a run. Altitude lives in component state (board |
// band) — an accordion, NOT pixel scaling, since a one-line strip and a future diagram share no
// coordinate system.

import { Fragment, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { GtmCanvasModel } from "@/components/canvas/GtmCanvas";
import type { LensProps } from "@/components/canvas/CanvasShell";
import type { LayerBelief } from "@/types";
import { layerMeta, groundingBadge, confidenceBand } from "@/lib/boardModel";
import { useBoard } from "@/lib/boardModel";
import { EngineLens } from "@/components/lenses/EngineLens";
import { AltitudeLadder } from "@/components/lenses/AltitudeLadder";
import { LAYER_DIAGRAMS } from "@/components/lenses/LAYER_DIAGRAMS";
import "./GtmBoard.css";

type Altitude = "board" | "band";

// The open/close spring — a deliberate navigation, so a fast, satisfying settle (~260ms feel).
const ALT_SPRING = { type: "spring" as const, stiffness: 460, damping: 36, mass: 0.85 };
// The body crossfade — quick, no bounce.
const FADE = { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const };

// Pull a readable line out of a loosely-typed shared bag (ICP / claim) for the Channels band's
// EngineLens context header. Mirrors GtmCanvas.readable; kept local so the board owns no shared state.
function readable(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of ["label", "name", "segment", "title", "who", "summary", "statement", "claim", "text", "description"]) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

// The 12px live-experiment fork glyph — a branch splitting into two. Shown only when a band carries
// experiments. Ink only, no amber (amber is the gate's alone).
function ForkGlyph() {
  return (
    <svg className="band-fork" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 11 V6 C3 4 5 4 6 4 H9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6 4 H9 M9 1 L9 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="3" cy="11" r="1.4" fill="currentColor" />
      <circle cx="9.2" cy="1" r="1.3" fill="currentColor" />
      <circle cx="9.2" cy="7" r="1.3" fill="currentColor" />
    </svg>
  );
}

// One band's confidence pill — a coarse band + the real number, never a seeded constant.
function ConfidencePill({ confidence }: { confidence: number }) {
  const band = confidenceBand(confidence);
  return (
    <span className={`band-conf band-conf-${band}`} title={`Confidence ${confidence}`}>
      <span className="band-conf-track"><span className="band-conf-fill" style={{ width: `${Math.max(0, Math.min(100, confidence))}%` }} /></span>
      <span className="band-conf-n">{band === "none" ? "—" : confidence}</span>
    </span>
  );
}

// The one-line strip — the band's line at board altitude and the header at band altitude.
function BandLine({ layer }: { layer: LayerBelief }) {
  const meta = layerMeta(layer.layer);
  const badge = groundingBadge(layer);
  const hasExp = layer.experiments.length > 0;
  return (
    <div className="band-line-inner">
      <div className="band-id">
        <span className="band-num">{meta.n}</span>
        <span className="band-name">{meta.name}<span className="band-sub">{meta.sub}</span></span>
      </div>
      <div className="band-belief">
        {/* The belief crossfades when its status flips (e.g. testing → validated after a verdict). */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={`${layer.status}:${layer.belief ?? ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
          >
            {layer.belief
              ? layer.belief
              : <span className="band-belief-blind">No belief yet — runs will ground this layer.</span>}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="band-markers">
        {hasExp && (
          <span className="band-exp" title={`${layer.experiments.length} live experiment${layer.experiments.length === 1 ? "" : "s"}`}>
            <ForkGlyph />
          </span>
        )}
        <ConfidencePill confidence={layer.confidence} />
        <span className={`band-badge badge-${badge.tone}`}><span className="badge-dot" />{badge.label}</span>
      </div>
    </div>
  );
}

// The open band body. Channels mounts the real EngineLens; a band with a registered diagram (e.g.
// Market / ICP → ArmComparison) mounts that; every other layer shows the honest placeholder built from
// its real belief + experiments — "diagram lands next".
function BandBody({
  layer, model, selected, onSelect, onVerdict,
}: {
  layer: LayerBelief;
  model: GtmCanvasModel;
  selected: string | null;
  onSelect: (id: string) => void;
  onVerdict: () => void;
}) {
  const meta = layerMeta(layer.layer);

  if (layer.layer === "channels") {
    return (
      <div className="band-body-engine">
        <EngineLens
          channels={model.channels}
          channelFeeds={model.channelFeeds}
          directedFeeds={model.directedFeeds}
          activeChannelId={model.activeChannelId}
          onDeriveChannel={model.onDeriveChannel}
          onOpenChannel={model.onOpenChannel}
          icpLabel={readable(model.icp)}
          claimLabel={readable(model.claims[0])}
        />
      </div>
    );
  }

  const Diagram = LAYER_DIAGRAMS[layer.layer];
  if (Diagram) {
    return (
      <div className="band-body-diagram">
        <Diagram
          layer={layer.layer}
          belief={layer}
          experiments={layer.experiments}
          selected={selected}
          onSelect={onSelect}
          projectId={model.projectId}
          onVerdict={onVerdict}
        />
      </div>
    );
  }

  return (
    <div className="band-placeholder">
      <div className="band-placeholder-belief">
        {layer.belief ? <span>{layer.belief}</span> : <span className="band-belief-blind">No belief grounded here yet.</span>}
      </div>
      {layer.evidence.length > 0 && (
        <ul className="band-evidence">
          {layer.evidence.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      {layer.experiments.length > 0 && (
        <div className="band-exp-list">
          <span className="band-exp-eyebrow">{layer.experiments.length} live experiment{layer.experiments.length === 1 ? "" : "s"}</span>
          <ul>
            {layer.experiments.slice(0, 4).map((e) => (
              <li key={e.id}>{e.hypothesis || e.variable || e.id}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="band-placeholder-foot">{meta.name} — diagram lands next</div>
    </div>
  );
}

export function GtmBoardLens({ model, selected, onSelect }: LensProps<GtmCanvasModel, never>) {
  // A founder verdict (or a fresh grouping) bumps this so the board re-reads and the belief visibly
  // flips on the band. The diagram calls onVerdict() after a successful write.
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useBoard(model.projectId, refreshKey);
  const [altitude, setAltitude] = useState<Altitude>("board");
  const [focusedLayer, setFocusedLayer] = useState<string | null>(null);

  if (state.status === "loading") {
    return <div className="board-status"><span className="board-status-spin" /><strong>Reading the board…</strong></div>;
  }
  if (state.status === "empty") {
    return (
      <div className="board-status">
        <strong>No board yet</strong>
        <span>Open a product and its nine belief layers show here — each line derived from real state.</span>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="board-status">
        <strong>Couldn't read the board</strong>
        <span>{state.error}</span>
      </div>
    );
  }

  const { layers } = state.board;

  const openBand = (layer: string) => { setFocusedLayer(layer); setAltitude("band"); };
  const toBoard = () => { setAltitude("board"); setFocusedLayer(null); };
  const flyTo = (layer: string) => { setFocusedLayer(layer); setAltitude("band"); };
  const onVerdict = () => setRefreshKey((k) => k + 1);

  // Focus-to-trace: when the selected object is a Market/ICP experiment, the Channels band is the motion
  // it tests, so we staple them — the Channels rail lights as the bottom of the trace.
  const selectedLayer = selected
    ? layers.find((l) => l.experiments.some((e) => e.id === selected))?.layer ?? null
    : null;
  const tracedChannels = selectedLayer === "icp";

  return (
    <div className={`gtm-board alt-${altitude}`}>
      <AltitudeLadder layers={layers} focusedLayer={altitude === "band" ? focusedLayer : null} onFly={flyTo} />

      <div className="board-stage">
        <div className="board-stage-head">
          <div>
            <h1 className="board-title">{altitude === "board" ? "The board" : layerMeta(focusedLayer ?? "").name}</h1>
            <div className="board-lede">
              {altitude === "board"
                ? "Nine beliefs, one per layer — each line derived from real state. Open a band to drop into it."
                : layerMeta(focusedLayer ?? "").sub}
            </div>
          </div>
          {altitude === "board" ? (
            <span className="board-alt-pill">altitude: board</span>
          ) : (
            <button type="button" className="board-alt-pill board-alt-pill-btn" onClick={toBoard} title="Zoom back out to the board">
              &#8598; back to board
            </button>
          )}
        </div>

        <motion.div className="board-bands" data-altitude={altitude}>
          {layers.map((l, i) => {
            const meta = layerMeta(l.layer);
            const isFocused = altitude === "band" && focusedLayer === l.layer;
            const mode = altitude === "board" ? "strip" : isFocused ? "open" : "rail";
            const phaseStart = i === 0 || layers[i - 1].phase !== l.phase;
            return (
              <Fragment key={l.layer}>
                <AnimatePresence>
                  {altitude === "board" && phaseStart && (
                    <motion.div
                      key={`ph-${l.phase}`}
                      className="board-phase-head"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={FADE}
                      layout
                    >
                      <span className="board-phase-label">{l.phase}</span>
                      <span className="board-phase-rule" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.div
                  layout
                  transition={ALT_SPRING}
                  className={`band band-${mode}${l.belief ? "" : " band-blind"}${l.layer === "channels" && tracedChannels ? " band-traced" : ""}`}
                >
                  <button
                    type="button"
                    className="band-line"
                    onClick={() => (mode === "open" ? toBoard() : openBand(l.layer))}
                    title={mode === "open" ? "Zoom back out" : `Open ${meta.name}`}
                  >
                    <BandLine layer={l} />
                  </button>

                  <AnimatePresence>
                    {isFocused && (
                      <motion.div
                        key="body"
                        className="band-body"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={FADE}
                      >
                        <BandBody layer={l} model={model} selected={selected} onSelect={onSelect} onVerdict={onVerdict} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </Fragment>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
