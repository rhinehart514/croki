export function directSdkConfiguration(persisted, teammateRef, runtime, model) {
  const name = runtime === "codex" ? "Codex" : runtime === "claude-code" ? "Claude Code" : teammateRef;
  const agent = {
    ref: teammateRef,
    name,
    label: "SDK model",
    perspective: null,
    temperament: [],
    contributes: [],
    boundaries: [],
    activation: "direct",
    capabilities: { firmTools: true, additional: [] },
    context: { scope: "venture", instructions: null },
    memory: { scope: "none", instructions: null },
    runtime: { provider: runtime, model },
    budget: { maxSteps: null, dailySpendUsd: null },
    authority: { outwardEffects: "blocked" },
    evaluation: { signals: [], instructions: null },
  };
  return {
    ...persisted,
    presentation: { ...persisted.presentation, participant: "named", participantLabel: "SDK model", collectiveLabel: "Work" },
    organization: { ...persisted.organization, instructions: null, relationships: [] },
    coordination: { ...persisted.coordination, mode: "direct", coordinatorRef: null, maxPasses: 1, protocols: [], stopWhen: [] },
    agents: [agent],
  };
}
