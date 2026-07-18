// GeneratedAnswer — a question's answer is the SAME FLIP, scoped by atlasTrace (spec §4).
//
// When the founder asks a question about an object, the scene does not navigate away: the objects that
// answer it reorganize in place and everything else recedes. Scope = projectAtlasTrace(projection, lens,
// originId) — the trace of objects that bear on the origin. In-scope nodes reorganize into an
// evidence-strength reading (the Understand arrangement over the trace subset); out-of-scope nodes fade to
// 0.35 rather than disappear (they are context, not deleted). Dismiss is the SAME instant restore to the
// exact prior frame that a lens exit uses — the founder pays nothing for asking.
//
// Three word-based exits, all writing to the brain views substrate — NEVER positions:
//   • save-as-live-view  → saveLiveView(arrangement id + atlasTrace scope refs). Reopening re-runs the
//     arrangement over the founder's CURRENT positions; the route rejects any positions field.
//   • capture-snapshot   → captureSnapshotView(manifest: arrangement + scope; rasterization deferred).
//   • promote-finding    → promoteViewFinding(statement + subject refs), the existing promote path.
//
// This overlay owns the scoped FLIP + fade and the three exits; it never touches placement. The parent
// applies scoped positions through setNodes (the controlled array), exactly as the lens does.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Node, ReactFlowInstance, Viewport } from "@xyflow/react";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import { projectAtlasTrace } from "@/components/atlas/atlasTrace";
import { ATLAS_EASE } from "@/components/atlas/atlasMotion";
import { saveLiveView, captureSnapshotView, promoteViewFinding } from "@/api";
import { foldPlacement, type SeededPositions } from "./canvasSeedLayout";
import { resolveTerritories } from "./canvasTerritory";
import { arrangeLens } from "./lensArrangement";
import "./generated-answer.css";

const FLIP_MS = 400;
const EASE_CSS = `cubic-bezier(${ATLAS_EASE.join(",")})`;
const OUT_OF_SCOPE_OPACITY = "0.35";

// The scope arrangement is named so a saved live view can re-run the SAME arrangement over the founder's
// current positions. This id is the durable handle the views substrate stores.
const ANSWER_ARRANGEMENT = "understand" as const;

// atlasTrace emits UI ids; the views substrate only accepts DURABLE refs (bet / outcome / architecture).
// UI pseudo-refs (atlas:wall, atlas:intent, work:*) are not loadable and the route rejects them, so the
// saved scope carries only the durable subset. This mirrors views-store.isDurableRef.
function durableScopeRefs(ids: Iterable<string>): string[] {
  const refs: string[] = [];
  for (const id of ids) {
    if (id.startsWith("bet:") || id.startsWith("outcome:") || id.startsWith("architecture:")) refs.push(id);
  }
  return [...new Set(refs)];
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function nodeElements(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]")];
}

function snapshotRects(): Map<string, { left: number; top: number }> {
  const rects = new Map<string, { left: number; top: number }>();
  for (const element of nodeElements()) {
    const id = element.getAttribute("data-id");
    if (!id) continue;
    const rect = element.getBoundingClientRect();
    rects.set(id, { left: rect.left, top: rect.top });
  }
  return rects;
}

export type GeneratedAnswerQuestion = { originId: string; prompt: string };

export function GeneratedAnswer({
  ventureId,
  question,
  sceneNodes,
  placementPositions,
  lens,
  projection,
  instance,
  setNodes,
  onDismiss,
}: {
  ventureId: string;
  question: GeneratedAnswerQuestion | null;
  sceneNodes: AtlasNode[];
  placementPositions: SeededPositions;
  lens: FirmLens | null;
  projection: FirmArchitectureProjection | null;
  instance: ReactFlowInstance | null;
  setNodes: (updater: (nodes: AtlasNode[]) => AtlasNode[]) => void;
  onDismiss: () => void;
}) {
  const freeViewportRef = useRef<Viewport | null>(null);
  const scopeRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exitState, setExitState] = useState<null | "saved" | "captured" | "promoted" | "error">(null);
  const [busy, setBusy] = useState(false);

  const clearPending = useCallback(() => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (timerRef.current != null) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  // Apply the scoped answer: in-scope nodes reorganize (Understand over the trace subset), out-of-scope
  // nodes fade. Positions go through setNodes ONLY — never placement.
  const applyAnswer = useCallback((originId: string) => {
    if (!lens || !projection) return;
    clearPending();
    const before = snapshotRects();
    if (instance && freeViewportRef.current === null) freeViewportRef.current = instance.getViewport();

    const scope = projectAtlasTrace(projection, lens, originId);
    scopeRef.current = scope;
    const inScope = sceneNodes.filter((node) => scope.has(node.id));
    const territory = resolveTerritories(inScope as unknown as Node[]);
    const positions = arrangeLens(ANSWER_ARRANGEMENT, inScope as unknown as Node[], { territory, projection, lens });

    setNodes((nodes) => nodes.map((node) => (
      positions[node.id] ? { ...node, position: positions[node.id] } : node
    )));

    // Fade out-of-scope nodes; keep in-scope at full opacity. Applied to the DOM directly so it rides the
    // same paint as the FLIP and reverses cleanly on dismiss.
    const fade = () => {
      for (const element of nodeElements()) {
        const id = element.getAttribute("data-id");
        element.style.opacity = id && scope.has(id) ? "" : OUT_OF_SCOPE_OPACITY;
      }
    };

    if (prefersReducedMotion()) { fade(); return; }

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const after = snapshotRects();
      const elements = nodeElements();
      // The FLIP transform rides the node's INNER child, never the .react-flow__node wrapper React Flow
      // controls (fighting it corrupts placement). Opacity rides the wrapper (React Flow leaves it alone).
      for (const element of elements) {
        const id = element.getAttribute("data-id");
        const inner = element.firstElementChild as HTMLElement | null;
        if (!id || !inner) continue;
        const start = before.get(id);
        const end = after.get(id);
        if (!start || !end) continue;
        const dx = start.left - end.left;
        const dy = start.top - end.top;
        if (dx === 0 && dy === 0) continue;
        inner.style.transition = "none";
        inner.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        fade();
        for (const element of elements) {
          element.style.transition = `opacity ${FLIP_MS}ms ${EASE_CSS}`;
          const inner = element.firstElementChild as HTMLElement | null;
          if (inner) { inner.style.transition = `transform ${FLIP_MS}ms ${EASE_CSS}`; inner.style.transform = ""; }
        }
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          for (const element of nodeElements()) {
            element.style.transition = "";
            const inner = element.firstElementChild as HTMLElement | null;
            if (inner) inner.style.transition = "";
          }
        }, FLIP_MS + 40);
      });
    });
  }, [clearPending, instance, lens, projection, sceneNodes, setNodes]);

  // Instant restore to the exact prior frame: founder positions from foldPlacement, camera to the free
  // viewport, opacities + FLIP transforms cleared. The same duration:0 covenant a lens exit uses. This is
  // driven by `question` going null (below), so BOTH the Dismiss button AND a parent-driven preempt (a lens
  // entered while the answer is open) restore the exact free frame — the parent never has to reach in.
  const restore = useCallback(() => {
    clearPending();
    for (const element of nodeElements()) {
      element.style.transition = "";
      element.style.opacity = "";
      const inner = element.firstElementChild as HTMLElement | null;
      if (inner) { inner.style.transition = ""; inner.style.transform = ""; }
    }
    const positions = foldPlacement(sceneNodes as unknown as Node[], placementPositions);
    setNodes((nodes) => nodes.map((node) => (
      positions[node.id] ? { ...node, position: positions[node.id] } : node
    )));
    // Return the camera to the exact free viewport captured before the answer, instantly.
    if (instance && freeViewportRef.current) instance.setViewport(freeViewportRef.current, { duration: 0 });
    freeViewportRef.current = null;
    scopeRef.current = new Set();
    setExitState(null);
  }, [clearPending, instance, placementPositions, sceneNodes, setNodes]);

  // Drive the answer from `question`: a set question applies the scoped FLIP; the transition BACK to null
  // restores the exact prior frame — no matter who cleared it (the Dismiss button sets it null through
  // onDismiss; a lens preempt does the same from the stage). Guarded so a fresh mount (question already
  // null) never runs a spurious restore.
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (question) { wasActiveRef.current = true; applyAnswer(question.originId); }
    else if (wasActiveRef.current) { wasActiveRef.current = false; restore(); }
    return () => clearPending();
    // applyAnswer/restore are stable in practice; re-run only on a new question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  const scopeRefs = useCallback(() => durableScopeRefs(scopeRef.current), []);

  const onSaveLiveView = useCallback(async () => {
    if (!question || busy) return;
    setBusy(true);
    try {
      await saveLiveView(ventureId, {
        name: question.prompt.slice(0, 80) || "Saved view",
        arrangement: ANSWER_ARRANGEMENT,
        rootRefs: scopeRefs(),
      });
      setExitState("saved");
    } catch { setExitState("error"); } finally { setBusy(false); }
  }, [busy, question, scopeRefs, ventureId]);

  const onCaptureSnapshot = useCallback(async () => {
    if (!question || busy) return;
    setBusy(true);
    try {
      await captureSnapshotView(ventureId, {
        name: question.prompt.slice(0, 80) || "Snapshot",
        arrangement: ANSWER_ARRANGEMENT,
        rootRefs: scopeRefs(),
      });
      setExitState("captured");
    } catch { setExitState("error"); } finally { setBusy(false); }
  }, [busy, question, scopeRefs, ventureId]);

  const onPromoteFinding = useCallback(async () => {
    if (!question || busy) return;
    setBusy(true);
    try {
      await promoteViewFinding(ventureId, {
        statement: question.prompt.slice(0, 200),
        subjectRefs: scopeRefs(),
      });
      setExitState("promoted");
    } catch { setExitState("error"); } finally { setBusy(false); }
  }, [busy, question, scopeRefs, ventureId]);

  if (!question) return null;

  const status = exitState === "saved" ? "Saved as a live view."
    : exitState === "captured" ? "Captured a snapshot."
    : exitState === "promoted" ? "Promoted to a finding."
    : exitState === "error" ? "That could not be saved."
    : null;

  return (
    <div className="generated-answer" role="region" aria-label="Generated answer">
      <p className="generated-answer-prompt">{question.prompt}</p>
      <div className="generated-answer-exits">
        <button type="button" className="generated-answer-exit" disabled={busy} onClick={onSaveLiveView}>
          Save as live view
        </button>
        <button type="button" className="generated-answer-exit" disabled={busy} onClick={onCaptureSnapshot}>
          Capture snapshot
        </button>
        <button type="button" className="generated-answer-exit" disabled={busy} onClick={onPromoteFinding}>
          Promote finding
        </button>
        <button type="button" className="generated-answer-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {status ? <p className="generated-answer-status" aria-live="polite">{status}</p> : null}
    </div>
  );
}
