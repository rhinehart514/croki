// Compare two persisted graph runs by node graph changes and per-node result deltas. General run
// diffing — not program-specific — behind the operator's compare_runs tool and the server diff route.

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function stable(value) {
  return JSON.stringify(canonical(value));
}

function nodeSnapshotMap(run) {
  return new Map((run?.graphSnapshot?.nodes ?? []).map((node) => [node.id, node]));
}

function resultMap(run) {
  return run?.result?.nodes ?? {};
}

export function compareChannelRuns(before, after) {
  if (!before || !after) throw new Error("Two persisted runs are required.");
  const beforeNodes = nodeSnapshotMap(before);
  const afterNodes = nodeSnapshotMap(after);
  const ids = new Set([...beforeNodes.keys(), ...afterNodes.keys()]);
  const graphChanges = [];
  for (const id of ids) {
    const left = beforeNodes.get(id);
    const right = afterNodes.get(id);
    if (!left) graphChanges.push({ type: "node_added", nodeId: id, after: right });
    else if (!right) graphChanges.push({ type: "node_removed", nodeId: id, before: left });
    else {
      if (left.connector !== right.connector) {
        graphChanges.push({ type: "connector_changed", nodeId: id, before: left.connector, after: right.connector });
      }
      if (stable(left.config) !== stable(right.config)) {
        graphChanges.push({ type: "config_changed", nodeId: id, before: left.config, after: right.config });
      }
      if (left.agentPrompt !== right.agentPrompt) {
        graphChanges.push({ type: "prompt_changed", nodeId: id });
      }
    }
  }
  const beforeResults = resultMap(before);
  const afterResults = resultMap(after);
  const resultIds = new Set([...Object.keys(beforeResults), ...Object.keys(afterResults)]);
  const resultChanges = [...resultIds].map((nodeId) => {
    const left = beforeResults[nodeId];
    const right = afterResults[nodeId];
    return {
      nodeId,
      before: left ? {
        ok: left.ok,
        itemCount: left.items?.length ?? 0,
        pendingReview: left.pendingReview ?? false,
        error: left.error ?? null,
      } : null,
      after: right ? {
        ok: right.ok,
        itemCount: right.items?.length ?? 0,
        pendingReview: right.pendingReview ?? false,
        error: right.error ?? null,
      } : null,
    };
  }).filter((change) => stable(change.before) !== stable(change.after));
  return {
    beforeRunId: before.id,
    afterRunId: after.id,
    beforeRevision: before.graphSnapshot?.revision ?? null,
    afterRevision: after.graphSnapshot?.revision ?? null,
    graphChanges,
    resultChanges,
    summary: `${graphChanges.length} graph change${graphChanges.length === 1 ? "" : "s"} · ${resultChanges.length} result change${resultChanges.length === 1 ? "" : "s"}`,
  };
}
