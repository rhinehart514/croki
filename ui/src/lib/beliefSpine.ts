// beliefSpine — the read-side model for the L1 belief-spine lens.
//
// L1 is the nine-layer board (brain/src/board.mjs) SCOPED TO ONE pipeline, folded down to the five
// faces of that pipeline's journey: Who (trigger) → What you say (positioning + offer) → Who you
// reached (people) → Did it work (measure) → the Verdict (learn). Each face carries a belief, a
// confidence, a status, and how it's grounded.
//
// This file owns: the typed spine shape, the fetch hook (loading / empty / ready / error, mirroring
// boardModel.ts's useBoard), the per-face display vocabulary, and the pure mapping from a face's real
// status/grounding into the spine's badge tone. NOTHING here writes, gates, or triggers a run — L1 is
// a pure read, exactly like the board.

import { useEffect, useState } from "react";
import { identityHeaders } from "@/lib/identity";
import type { BoardGroundingMode, BoardLayerStatus } from "@/types";

// ── The spine shape (mirrors the backend /spine contract) ──────────────────────
// One face of the pipeline's belief journey. Same core fields as a board LayerBelief, minus the
// board-only phase/experiments/evidence — a face is the folded-down belief, not the full band.
export type SpineFace = {
  // The founder's current belief at this face, or null when nothing is grounded yet (blind).
  belief: string | null;
  confidence: number; // 0-100, derived from real signal
  status: BoardLayerStatus;
  groundingMode: BoardGroundingMode;
};

// The five faces of one pipeline, in journey order. Keyed by face name so the renderer can walk
// FACE_ORDER and read each honestly.
export type PipelineSpine = {
  who: SpineFace;
  say: SpineFace;
  reached: SpineFace;
  worked: SpineFace;
  verdict: SpineFace;
};

// The fetch response from GET /api/projects/:id/pipelines/:channelId/spine.
// The backend keys the five faces under `faces` (board.mjs getPipelineBeliefSpine); this mirrors it.
export type SpineView = {
  projectId: string;
  channelId: string;
  channelName?: string;
  faces: PipelineSpine;
};

// ── The fetch ───────────────────────────────────────────────────────────────────
// Self-contained so this lens builds without an api.ts edit (file ownership keeps api.ts untouched).
// Mirrors api.ts's `get<T>` exactly — same identity headers, same error shape. The integrator MAY
// lift this to api.ts as a one-liner (see BeliefSpine.tsx's header) and swap the import; behaviour is
// identical either way.
export async function getSpine(projectId: string, channelId: string): Promise<SpineView> {
  const path = `/api/projects/${encodeURIComponent(projectId)}/pipelines/${encodeURIComponent(channelId)}/spine`;
  const res = await fetch(path, { headers: { ...identityHeaders() } });
  if (!res.ok) throw new Error(`${path} failed (${res.status}).`);
  return res.json() as Promise<SpineView>;
}

// ── Display metadata, keyed by face ────────────────────────────────────────────
// Each face's mono role label (matching the L1 mockup exactly) plus a friendly name for aria/tooltip.
export type FaceKey = keyof PipelineSpine;
export type FaceMeta = { key: FaceKey; role: string; label: string };

export const FACE_META: Record<FaceKey, FaceMeta> = {
  who: { key: "who", role: "Who · trigger", label: "Who you're targeting" },
  say: { key: "say", role: "What you say · positioning", label: "What you say" },
  reached: { key: "reached", role: "Who you reached · people", label: "Who you reached" },
  worked: { key: "worked", role: "Did it work · measure", label: "Did it work" },
  verdict: { key: "verdict", role: "Verdict · learn", label: "The verdict" },
};

// Journey order — the row reads left to right in this order.
export const FACE_ORDER: FaceKey[] = ["who", "say", "reached", "worked", "verdict"];

export function faceMeta(key: FaceKey): FaceMeta {
  return FACE_META[key];
}

// ── The face badge ─────────────────────────────────────────────────────────────
// One face's real status + grounding → the spine's badge vocabulary. Amber is NEVER produced here:
// amber belongs to the founder gate alone. Mirrors boardModel.ts groundingBadge, but typed for a
// SpineFace (which carries no board phase/experiments/evidence, so it can't reuse that signature).
export type SpineTone = "proven" | "testing" | "assumed" | "blind";
export type SpineBadge = { tone: SpineTone; label: string };

export function faceBadge(face: SpineFace): SpineBadge {
  if (!face.belief) return { tone: "blind", label: "blind" };
  if (face.status === "validated") return { tone: "proven", label: "validated" };
  if (face.status === "testing") return { tone: "testing", label: "testing" };
  // assumed — surface HOW it's grounded (founder-stated, gate-produced, or run-derived).
  const label =
    face.groundingMode === "derived" ? "derived"
    : face.groundingMode === "gated" ? "staged"
    : "stated";
  return { tone: "assumed", label };
}

// The confidence read, kept honest: a face with no signal shows "—", never a fake 0-as-a-number.
export function confidenceLabel(confidence: number): string {
  return confidence > 0 ? String(Math.round(confidence)) : "—";
}

// ── The fetch hook ──────────────────────────────────────────────────────────────
export type SpineState =
  | { status: "loading"; spine: null; error: null }
  | { status: "empty"; spine: null; error: null }
  | { status: "ready"; spine: PipelineSpine; error: null }
  | { status: "error"; spine: null; error: string };

// Fetch the spine for one pipeline. Re-fetches when projectId / channelId change OR when `refreshKey`
// is bumped (reserved for a future gate-verdict reload, so a face can visibly flip from testing to
// validated). Ignores a stale resolution after the pipeline switched out from under it. A null
// projectId OR channelId reports empty (no pipeline chosen yet). Mirrors boardModel.ts useBoard.
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
        // Always ready once fetched — a spine with no grounded face still renders its five faces in
        // order, each honestly blank, rather than collapsing to a single empty state.
        if (live) {
          setFetched({ projectId, channelId, state: { status: "ready", spine: view.faces, error: null } });
        }
      })
      .catch((err: unknown) => {
        if (live) {
          setFetched({
            projectId,
            channelId,
            state: {
              status: "error",
              spine: null,
              error: err instanceof Error ? err.message : "Could not load the spine.",
            },
          });
        }
      });
    return () => { live = false; };
  }, [projectId, channelId, refreshKey]);

  // No pipeline chosen yet → honest empty. A result for a stale project/pipeline → still loading.
  if (!projectId || !channelId) return { status: "empty", spine: null, error: null };
  if (fetched && fetched.projectId === projectId && fetched.channelId === channelId) return fetched.state;
  return { status: "loading", spine: null, error: null };
}
