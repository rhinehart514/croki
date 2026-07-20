import { useCallback, useEffect, useState } from "react";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import {
  targetArchitecture,
  targetBet,
  targetTeammates,
  targetTheory,
  targetWork,
  type CanvasSelection,
} from "@/components/firm/directionTarget";
import type { GeneratedAnswerQuestion } from "./GeneratedAnswer";

export function canvasScopeTitle(nodes: AtlasNode[], id: string): string {
  const node = nodes.find((candidate) => candidate.id === id);
  const title = node && typeof node.data.title === "string" ? node.data.title.trim() : "";
  return title || id;
}

export function useCanvasSelection({
  nodes,
  projection,
  lens,
  selection,
  answer,
  lensId,
  onSelect,
  onDescend,
  setAnswer,
}: {
  nodes: AtlasNode[];
  projection: FirmArchitectureProjection | null;
  lens: FirmLens | null;
  selection: CanvasSelection;
  answer: GeneratedAnswerQuestion | null;
  lensId: string | null;
  onSelect: (selection: CanvasSelection) => void;
  onDescend?: (selection: CanvasSelection) => void;
  setAnswer: (question: GeneratedAnswerQuestion | null) => void;
}) {
  const selectedNodeId = selection?.betId ? `bet:${selection.betId}` : null;
  const resolveTarget = useCallback((id: string): CanvasSelection => {
    if (id.startsWith("bet:")) return targetBet(id.slice("bet:".length));
    if (id.startsWith("work:")) {
      const workRef = id.slice("work:".length);
      const join = projection?.joins.work.find((candidate) => candidate.id === workRef || candidate.workRef === workRef);
      const betId = join?.betId ?? lens?.bets.find((bet) => (bet.staged ?? []).some((staged) => staged.id === workRef))?.id;
      return betId ? targetWork(betId, workRef) : null;
    }
    if (id.startsWith("outcome:")) {
      const outcomeId = id.slice("outcome:".length);
      const join = projection?.joins.outcomes.find((candidate) => candidate.outcomeId === outcomeId || candidate.id === outcomeId);
      const betId = join?.betId ?? (lens?.outcomes ?? []).find((outcome) => outcome.id === outcomeId)?.betId;
      return betId ? targetBet(betId) : null;
    }
    if (id.startsWith("crew:")) return targetTeammates([id.slice("crew:".length)]);
    if (id.startsWith("architecture:")) return projection ? targetArchitecture(id.slice("architecture:".length), projection.revision) : null;
    if (id.startsWith("theory:")) {
      const theory = projection?.workingTheory;
      const subject = theory?.subjects.find((candidate) => candidate.id === id.slice("theory:".length));
      return theory && subject ? targetTheory(theory.id, subject.id, theory.baseRevision, subject.name) : null;
    }
    return null;
  }, [lens, projection]);

  const selectNode = useCallback((id: string) => {
    if (id === "atlas:intent") return onSelect(null);
    onSelect(resolveTarget(id));
  }, [onSelect, resolveTarget]);
  const descendNode = useCallback((id: string) => {
    if (id === "atlas:intent") return;
    const target = resolveTarget(id);
    if (target && onDescend) onDescend(target);
  }, [onDescend, resolveTarget]);

  const [outlineOpen, setOutlineOpen] = useState(false);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.matches("input, textarea, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (key === "o") { event.preventDefault(); setOutlineOpen((open) => !open); }
      else if (key === "a" && selectedNodeId && !answer && !lensId) {
        event.preventDefault();
        setAnswer({ originId: selectedNodeId, prompt: `What bears on ${canvasScopeTitle(nodes, selectedNodeId)}?` });
      } else if (event.key === "Escape" && outlineOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOutlineOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [outlineOpen, selectedNodeId, answer, lensId, nodes, setAnswer]);

  return { selectedNodeId, selectNode, descendNode, outlineOpen, setOutlineOpen };
}
