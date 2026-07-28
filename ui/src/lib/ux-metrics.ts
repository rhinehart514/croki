export type UxMetricName =
  // Historical compatibility only. A citation proved grounding, not user value, so current code no
  // longer emits this event.
  | "first_grounded_value"
  | "first_exact_reviewable_material"
  | "first_verified_result"
  | "founder_turn_acknowledged"
  | "return_first_decision"
  | "proof_opened"
  | "correction_sent"
  | "wall_released"
  | "wall_rejected"
  | "wall_left_pending"
  | "warm_destination_painted"
  | "stale_incident";

export type UxMetric = {
  event: UxMetricName;
  ventureId: string;
  at: string;
  durationMs: number | null;
};

const STORAGE_KEY = "drover:private-ux-metrics:v1";
const MAX_RECORDS = 200;
const onceKeys = new Set<string>();
const returnDecisionTimers = new Map<string, number>();

export function readUxMetrics(): UxMetric[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.event === "string") : [];
  } catch {
    return [];
  }
}

export function recordUxMetric(event: UxMetricName, ventureId: string, durationMs: number | null = null) {
  if (!ventureId) return;
  const record: UxMetric = {
    event,
    ventureId,
    at: new Date().toISOString(),
    durationMs: durationMs === null ? null : Math.max(0, Math.round(durationMs)),
  };
  try {
    const next = [...readUxMetrics(), record].slice(-MAX_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Metrics never interrupt the local workbench.
  }
}

export function recordUxMetricOnce(event: UxMetricName, ventureId: string, durationMs: number | null = null) {
  const key = `${ventureId}:${event}`;
  if (onceKeys.has(key) || readUxMetrics().some((entry) => entry.ventureId === ventureId && entry.event === event)) {
    onceKeys.add(key);
    return;
  }
  onceKeys.add(key);
  recordUxMetric(event, ventureId, durationMs);
}

export function recordCodingValueMilestones(
  ventureId: string,
  state: { exactReviewableMaterial: boolean; verified: boolean },
) {
  if (!state.exactReviewableMaterial) return;
  recordUxMetricOnce("first_exact_reviewable_material", ventureId);
  if (state.verified) recordUxMetricOnce("first_verified_result", ventureId);
}

export function startUxTimer(event: UxMetricName, ventureId: string) {
  const startedAt = performance.now();
  return () => recordUxMetric(event, ventureId, performance.now() - startedAt);
}

export function startReturnDecisionTimer(ventureId: string) {
  if (ventureId && !returnDecisionTimers.has(ventureId)) {
    returnDecisionTimers.set(ventureId, performance.now());
  }
}

export function finishReturnDecisionTimer(ventureId: string) {
  const startedAt = returnDecisionTimers.get(ventureId);
  if (startedAt === undefined) return;
  returnDecisionTimers.delete(ventureId);
  recordUxMetric("return_first_decision", ventureId, performance.now() - startedAt);
}
