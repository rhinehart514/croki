export type DirectionTarget = {
  betId: string | null;
  workRef: string | null;
  teammateRefs: string[];
  architectureId?: string | null;
  architectureStepId?: string | null;
  architectureRevision?: number | null;
  theoryId?: string | null;
  theorySubjectId?: string | null;
  theoryRevision?: number | null;
  theoryLabel?: string | null;
};

export type CanvasSelection = DirectionTarget | null;

function refs(values: string[] = []): string[] {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

export function normalizeDirectionTarget(value: Partial<DirectionTarget> | null | undefined): CanvasSelection {
  if (!value) return null;
  const betId = String(value.betId ?? "").trim() || null;
  const workRef = betId ? (String(value.workRef ?? "").trim() || null) : null;
  const teammateRefs = refs(value.teammateRefs);
  const architectureId = String(value.architectureId ?? "").trim() || null;
  const architectureStepId = architectureId ? (String(value.architectureStepId ?? "").trim() || null) : null;
  const architectureRevision = architectureId && Number.isFinite(value.architectureRevision)
    ? Number(value.architectureRevision)
    : null;
  const theoryId = String(value.theoryId ?? "").trim() || null;
  const theorySubjectId = theoryId ? (String(value.theorySubjectId ?? "").trim() || null) : null;
  const theoryRevision = theoryId && Number.isFinite(value.theoryRevision) ? Number(value.theoryRevision) : null;
  const theoryLabel = theoryId ? (String(value.theoryLabel ?? "").trim() || null) : null;
  return betId || workRef || teammateRefs.length || architectureId || (theoryId && theorySubjectId)
    ? {
      betId,
      workRef,
      teammateRefs,
      ...(architectureId ? { architectureId, architectureStepId, architectureRevision } : {}),
      ...(theoryId && theorySubjectId ? { theoryId, theorySubjectId, theoryRevision, theoryLabel } : {}),
    }
    : null;
}

export function targetTheory(
  theoryId: string,
  subjectId: string,
  theoryRevision: number,
  theoryLabel: string,
): DirectionTarget {
  return {
    betId: null,
    workRef: null,
    teammateRefs: [],
    theoryId,
    theorySubjectId: subjectId,
    theoryRevision,
    theoryLabel,
  };
}

export function targetBet(betId: string): DirectionTarget {
  return { betId, workRef: null, teammateRefs: [] };
}

export function targetWork(betId: string, workRef: string): DirectionTarget {
  return { betId, workRef, teammateRefs: [] };
}

export function targetTeammates(teammateRefs: string[]): CanvasSelection {
  return normalizeDirectionTarget({ betId: null, workRef: null, teammateRefs });
}

export function targetArchitecture(
  architectureId: string,
  architectureRevision: number,
  architectureStepId?: string | null,
): DirectionTarget {
  return {
    betId: null,
    workRef: null,
    teammateRefs: [],
    architectureId,
    architectureStepId: architectureStepId ?? null,
    architectureRevision,
  };
}

export function toggleTargetTeammate(target: CanvasSelection, teammateRef: string): CanvasSelection {
  const current = target?.teammateRefs ?? [];
  const teammateRefs = current.includes(teammateRef)
    ? current.filter((ref) => ref !== teammateRef)
    : [...current, teammateRef];
  return normalizeDirectionTarget({
    betId: target?.betId ?? null,
    workRef: target?.workRef ?? null,
    teammateRefs,
    architectureId: target?.architectureId ?? null,
    architectureStepId: target?.architectureStepId ?? null,
    architectureRevision: target?.architectureRevision ?? null,
    theoryId: target?.theoryId ?? null,
    theorySubjectId: target?.theorySubjectId ?? null,
    theoryRevision: target?.theoryRevision ?? null,
    theoryLabel: target?.theoryLabel ?? null,
  });
}

export function sameDirectionTarget(left: CanvasSelection, right: CanvasSelection): boolean {
  return (left?.betId ?? null) === (right?.betId ?? null)
    && (left?.workRef ?? null) === (right?.workRef ?? null)
    && (left?.architectureId ?? null) === (right?.architectureId ?? null)
    && (left?.architectureStepId ?? null) === (right?.architectureStepId ?? null)
    && (left?.architectureRevision ?? null) === (right?.architectureRevision ?? null)
    && (left?.theoryId ?? null) === (right?.theoryId ?? null)
    && (left?.theorySubjectId ?? null) === (right?.theorySubjectId ?? null)
    && (left?.theoryRevision ?? null) === (right?.theoryRevision ?? null)
    && JSON.stringify(left?.teammateRefs ?? []) === JSON.stringify(right?.teammateRefs ?? []);
}
