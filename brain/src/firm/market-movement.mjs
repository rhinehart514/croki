import { buildReleaseIndex } from "./release-index.mjs";
import { getSemanticModel } from "./semantic-model-store.mjs";
import { listVentureDocs } from "./venture-store.mjs";
import { buildWorkIndex } from "./work-index.mjs";

export function buildMarketMovementIndex(ventureId, options = {}) {
  const model = getSemanticModel(ventureId, options);
  const legacy = buildReleaseIndex(ventureId, options);
  const work = buildWorkIndex(ventureId, options);
  const observations = listVentureDocs(ventureId, "observationContracts", options);
  const outcomes = listVentureDocs(ventureId, "outcomes", options);
  const actions = model.outwardActions.map((action) => {
    const actionObservations = observations
      .filter((entry) => entry.actionRef === `outward-action:${action.id}`)
      .sort((left, right) => String(right.grantedAt).localeCompare(String(left.grantedAt)));
    const latestObservation = actionObservations[0] ?? null;
    const actionOutcomes = outcomes.filter((entry) => entry.actionRef === `outward-action:${action.id}`);
    const latestOutcome = actionOutcomes.sort((left, right) => String(right.observedAt).localeCompare(String(left.observedAt)))[0] ?? null;
    const state = action.executedAt == null
      ? action.executionLease ? "execution-unknown" : action.lastExecutionError ? "execution-failed" : "needs-founder"
      : latestObservation?.lastResult?.state === "failed"
        ? "observation-failed"
        : latestOutcome?.state === "silence"
          ? "silent"
          : action.outcomeRefs.length ? "returned" : "in-world";
    return {
      ...structuredClone(action),
      state,
      observations: structuredClone(actionObservations),
      latestObservation: structuredClone(latestObservation),
      latestOutcome: structuredClone(latestOutcome),
    };
  });
  const legacyReleases = legacy.releases
    .filter((release) => !actions.some((action) => action.subjectRefs.includes(release.releaseRef)))
    .map((release) => ({
      id: `legacy-${release.id}`,
      kind: "product-release",
      subjectRefs: [release.releaseRef],
      branchRefs: [], motionRefs: [], productDeltaRefs: release.relatedObjectRefs,
      workRefs: release.runRefs,
      decisionRef: release.decisions[0]?.id ? `decision:${release.decisions[0].id}` : `object:${release.id}`,
      executedAt: release.lifecycle === "in-market" ? release.updatedAt : null,
      executorReceipt: null,
      observationRefs: release.observations.map((entry) => `observation:${entry.id}`),
      outcomeRefs: release.outcomes.map((entry) => `outcome:${entry.id}`),
      state: release.attention.length ? "needs-founder" : release.lifecycle === "in-market" ? "in-world" : "prepared",
      compatibility: { releaseRef: release.releaseRef },
    }));
  return {
    ventureId,
    revision: model.revision,
    actions: [...actions, ...legacyReleases].sort((a, b) => String(b.executedAt ?? "").localeCompare(String(a.executedAt ?? ""))),
    modelBranches: structuredClone(model.modelBranches),
    liveWork: work.items.filter((item) => item.activity !== "idle" || item.attention != null),
  };
}
