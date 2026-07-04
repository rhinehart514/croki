// boardModel — the read-side model for the GTM board lens.
//
// It fetches GET /api/projects/:id/board (the nine LayerBelief bands, derived from real state in
// brain/src/board.mjs) and hands the lens a typed, loading/empty/error-aware view. It also owns the
// pure display vocabulary the board renders with: each layer's name + sublabel. NOTHING here writes,
// gates, or triggers a run — the board is a pure read.

import { useEffect, useState } from "react";
import { getBoard } from "@/api";
import type { BoardView } from "@/types";

// (The old groundingBadge / confidenceBand display helpers were removed: nothing rendered them
// anymore, and their "blind" / "derived" badge words are engine vocabulary a founder surface must
// not speak. A future badge derives its words in plain language from the same real fields.)

// ── The fetch hook ──────────────────────────────────────────────────────────────
type BoardState =
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
