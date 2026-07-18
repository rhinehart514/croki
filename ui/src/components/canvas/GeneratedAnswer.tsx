// RelatedContext — a deterministic TRACE of what already connects to a selected object (not a generated
// interpretation, and NOT a source of durable truth).
//
// When the founder asks to see what relates to an object, the scene does not navigate away: the objects
// connected to it reorganize in place and everything else recedes. Scope = projectAtlasTrace(projection,
// lens, originId) — the trace of objects that already bear on the origin, read straight from existing graph
// relationships. No model runs; nothing is concluded. In-scope nodes reorganize into an evidence-strength
// reading; out-of-scope nodes fade to 0.35 rather than disappear (they are context, not deleted). Dismiss
// is the SAME instant restore to the exact prior frame a lens exit uses — the founder pays nothing to look.
//
// TRUTH BOUNDARY (Product Law: facts / evidence / interpretation / action stay distinct): this surface only
// REARRANGES the view to highlight existing relationships. It promotes NOTHING to durable venture truth —
// an earlier version wrote the founder's question back as a "finding", which recorded a question as a fact
// and is removed. Saving/snapshotting a view returns only once the views lifecycle (list/reopen/inspect)
// exists to make it a real, revisitable artifact rather than a write-only dead end.
//
// This overlay owns the scoped FLIP + fade; it never touches placement. The parent applies scoped positions
// through setNodes (the controlled array), exactly as the lens does.

import { useCallback, useEffect, useRef } from "react";
import type { Node, ReactFlowInstance, Viewport } from "@xyflow/react";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import { projectAtlasTrace } from "@/components/atlas/atlasTrace";
import { ATLAS_EASE } from "@/components/atlas/atlasMotion";
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
  question,
  sceneNodes,
  placementPositions,
  lens,
  projection,
  instance,
  setNodes,
  onDismiss,
}: {
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

  if (!question) return null;

  return (
    <div className="generated-answer" role="region" aria-label="Related context">
      <p className="generated-answer-prompt">{question.prompt}</p>
      <div className="generated-answer-exits">
        {/* This surface only highlights EXISTING relationships — it never promotes anything to durable truth
            (the removed "promote finding" recorded the question itself as a fact). Save/snapshot return when
            the views lifecycle exists to make a saved look revisitable rather than a write-only dead end. */}
        <button type="button" className="generated-answer-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
