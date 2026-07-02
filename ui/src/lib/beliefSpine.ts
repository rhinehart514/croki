// beliefSpine — the read-side model for the strip over ONE open pipeline.
//
// The strip is DERIVED from that pipeline's own composed graph and its real run/gate state
// (brain/src/board.mjs getPipelineBeliefSpine): one card per composed step, titled in the pipeline's
// own words, each stating in plain words what actually happened there — what came in, what was
// drafted, what waits at the founder gate, what moved after approval, what came back — plus a closing
// "What you've decided" card only when real conclusions exist. There is no fixed face skeleton here:
// a broadcast pipeline shows the outcomes its own motion produces.
//
// This file owns: the typed card shape, the fetch, and the fetch hook (loading / empty / ready /
// error, mirroring boardModel.ts's useBoard). NOTHING here writes, gates, or triggers a run — the
// strip is a pure read, exactly like the board.

import { useEffect, useState } from "react";
import { identityHeaders } from "@/lib/identity";

// ── The card shape (mirrors the backend /spine contract) ────────────────────────
// One composed step of the pipeline, in plain words about what really happened there.
export type SpineCard = {
  id: string;
  // The step in the pipeline's own words — the label its composition chose.
  title: string;
  // What actually happened here, or (empty: true) what hasn't and what would fill it.
  body: string;
  // A short line of the step's real output — e.g. how the drafted post actually reads.
  detail?: string | null;
  // Items waiting on the founder's decision at this step (gate steps only) — the number he acts on.
  needsYou?: number;
  // True when nothing has happened at this step yet; the body says so honestly.
  empty?: boolean;
};

// The fetch response from GET /api/projects/:id/pipelines/:channelId/spine.
export type SpineView = {
  projectId: string;
  channelId: string;
  channelName?: string;
  cards: SpineCard[];
};

// ── The fetch ───────────────────────────────────────────────────────────────────
// Self-contained so this lens builds without an api.ts edit (file ownership keeps api.ts untouched).
// Mirrors api.ts's `get<T>` exactly — same identity headers, same error shape.
export async function getSpine(projectId: string, channelId: string): Promise<SpineView> {
  const path = `/api/projects/${encodeURIComponent(projectId)}/pipelines/${encodeURIComponent(channelId)}/spine`;
  const res = await fetch(path, { headers: { ...identityHeaders() } });
  if (!res.ok) throw new Error(`${path} failed (${res.status}).`);
  return res.json() as Promise<SpineView>;
}

// ── The fetch hook ──────────────────────────────────────────────────────────────
export type SpineState =
  | { status: "loading"; cards: null; error: null }
  | { status: "empty"; cards: null; error: null }
  | { status: "ready"; cards: SpineCard[]; error: null }
  | { status: "error"; cards: null; error: string };

// Fetch the strip for one pipeline. Re-fetches when projectId / channelId change OR when `refreshKey`
// is bumped (so a gate decision can visibly land on the strip). Ignores a stale resolution after the
// pipeline switched out from under it. A null projectId OR channelId reports empty (no pipeline
// chosen yet). Mirrors boardModel.ts useBoard.
export function useSpine(
  projectId: string | null,
  channelId: string | null,
  refreshKey = 0,
): SpineState {
  const [fetched, setFetched] = useState<
    { projectId: string; channelId: string; state: SpineState } | null
  >(null);

  useEffect(() => {
    if (!projectId || !channelId) return;
    let live = true;
    getSpine(projectId, channelId)
      .then((view) => {
        if (live) {
          setFetched({
            projectId,
            channelId,
            state: { status: "ready", cards: Array.isArray(view.cards) ? view.cards : [], error: null },
          });
        }
      })
      .catch((err: unknown) => {
        if (live) {
          setFetched({
            projectId,
            channelId,
            state: {
              status: "error",
              cards: null,
              error: err instanceof Error ? err.message : "Could not read this pipeline.",
            },
          });
        }
      });
    return () => { live = false; };
  }, [projectId, channelId, refreshKey]);

  // No pipeline chosen yet → honest empty. A result for a stale project/pipeline → still loading.
  if (!projectId || !channelId) return { status: "empty", cards: null, error: null };
  if (fetched && fetched.projectId === projectId && fetched.channelId === channelId) return fetched.state;
  return { status: "loading", cards: null, error: null };
}
