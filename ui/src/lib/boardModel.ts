// boardModel — the read-side model for the GTM board lens.
//
// It fetches GET /api/projects/:id/board (the nine LayerBelief bands, derived from real state in
// brain/src/board.mjs) and hands the lens a typed, loading/empty/error-aware view. It also owns the
// pure display vocabulary the board renders with: each layer's name + sublabel, and the mapping from
// a belief's real groundingMode / status into the board's grounded / leaning / assumed / blind
// badge. NOTHING here writes, gates, or triggers a run — the board is a pure read.

import { useEffect, useState } from "react";
import { getBoard } from "@/api";
import type { BoardView, LayerBelief } from "@/types";

// ── Board layer, extended with the run-state fields board.mjs derives ──────────
// The base LayerBelief type mirrors board.mjs's core shape; these two fields are the run-derived
// extras the board reads live (still a pure read — derived, never seeded). `moving` marks a
// run-derived layer that currently has live run signal behind it; `tiers` is the pipelines layer's
// operational split (needs-you / live / at-gate), null when there are no pipelines.
export type PipelineTiers = { needsYou: number; live: number; atGate: number };
export type BoardLayer = LayerBelief & { moving?: boolean; tiers?: PipelineTiers | null };

// Is this a run-derived layer (motion / loop), as opposed to a founder-stated strategy layer? The
// "moving vs static" marker only shows on these — a stated belief is never "moving".
export function isRunDerived(layer: LayerBelief): boolean {
  return layer.groundingMode !== "stated";
}

// ── Display metadata, keyed by the real `layer` field getBoard() returns ───────
// Number + name + one-line sublabel for each band, in board order (Strategy 1-4, Motion 5-6,
// Loop 7-9). Faithful to the approved 01-board.html names; the keys are board.mjs's real layers.
export type LayerMeta = { n: number; name: string; sub: string };

export const LAYER_META: Record<string, LayerMeta> = {
  icp: { n: 1, name: "Market / ICP", sub: "center of gravity" },
  trigger: { n: 2, name: "Problem & Trigger", sub: "why-now ladder" },
  positioning: { n: 3, name: "Positioning", sub: "the one-liner" },
  offer: { n: 4, name: "Offer", sub: "value escalation" },
  channels: { n: 5, name: "Pipelines", sub: "arms of the ICP test" },
  artifacts: { n: 6, name: "Plays & Assets", sub: "touches & shared assets" },
  people: { n: 7, name: "People", sub: "survival & the pinch" },
  measure: { n: 8, name: "Measurement", sub: "can we prove it?" },
  learn: { n: 9, name: "Learning", sub: "verdict ledger" },
};

export function layerMeta(layer: string): LayerMeta {
  return LAYER_META[layer] ?? { n: 0, name: layer, sub: "" };
}

// ── The grounding badge ────────────────────────────────────────────────────────
// One belief's real groundingMode + status → the board's badge vocabulary. Amber is NEVER produced
// here: amber belongs to the founder gate alone, and the board carries no gate-pending signal, so it
// stays grounded / leaning / assumed / blind. (See 01-board.html's marker legend.)
export type BadgeTone = "grounded" | "lean" | "assumed" | "blind";
export type GroundingBadge = { tone: BadgeTone; label: string };

export function groundingBadge(layer: LayerBelief): GroundingBadge {
  if (!layer.belief) return { tone: "blind", label: "blind" };
  if (layer.status === "validated") return { tone: "grounded", label: "grounded" };
  if (layer.status === "testing") return { tone: "lean", label: "testing" };
  // assumed — surface HOW it's grounded (founder-stated, gate-produced, or run-derived).
  const label =
    layer.groundingMode === "derived" ? "derived"
    : layer.groundingMode === "gated" ? "staged"
    : "stated";
  return { tone: "assumed", label };
}

// A coarse confidence band for the pill — keeps the number honest while reading at a glance.
export function confidenceBand(confidence: number): "high" | "mid" | "low" | "none" {
  if (confidence <= 0) return "none";
  if (confidence >= 67) return "high";
  if (confidence >= 34) return "mid";
  return "low";
}

// ── The fetch hook ──────────────────────────────────────────────────────────────
export type BoardState =
  | { status: "loading"; board: null; error: null }
  | { status: "empty"; board: null; error: null }
  | { status: "ready"; board: BoardView; error: null }
  | { status: "error"; board: null; error: string };

// Fetch the board for a project. Re-fetches when projectId changes OR when `refreshKey` is bumped — the
// latter is how a founder verdict (or a fresh grouping) reloads the board so a belief visibly flips
// from testing to validated. Ignores a stale resolution after the project switched out from under it. A
// null projectId reports empty (nothing grounded yet).
export function useBoard(projectId: string | null, refreshKey = 0): BoardState {
  // The fetched outcome, tagged with the projectId it belongs to. setState happens ONLY inside the
  // async callbacks (never synchronously in the effect body), so loading/empty are derived in render.
  const [fetched, setFetched] = useState<{ projectId: string; state: BoardState } | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    getBoard(projectId)
      .then((board) => {
        // Always ready once fetched — a board with no grounded belief still renders its nine bands in
        // order, each honestly blank, rather than collapsing to a single empty state.
        if (live) setFetched({ projectId, state: { status: "ready", board, error: null } });
      })
      .catch((err: unknown) => {
        if (live) setFetched({ projectId, state: { status: "error", board: null, error: err instanceof Error ? err.message : "Could not load the board." } });
      });
    return () => { live = false; };
  }, [projectId, refreshKey]);

  // No project open yet → honest empty. A result for a stale project (or none yet) → still loading.
  if (!projectId) return { status: "empty", board: null, error: null };
  if (fetched && fetched.projectId === projectId) return fetched.state;
  return { status: "loading", board: null, error: null };
}
