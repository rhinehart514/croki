const starts = new Map<string, number>();

export function startWarmReturn(ventureId: string) {
  if (ventureId) starts.set(ventureId, performance.now());
}

export function finishWarmReturn(ventureId: string): number | null {
  const startedAt = starts.get(ventureId);
  if (startedAt == null) return null;
  starts.delete(ventureId);
  return Math.max(0, performance.now() - startedAt);
}
