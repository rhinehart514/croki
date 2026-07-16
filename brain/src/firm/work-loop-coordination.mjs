// work-loop-coordination.mjs — one generic participant-to-participant deliberation seam.
//
// The caller chooses whom to involve, which configured protocol to use, and the focused question.
// This module supplies no routing table and interprets no personality. It only enforces configured
// membership and the shared pass budget, then runs the requested participant through the ordinary
// work loop so their own runtime, capabilities, authority, and spend rails still apply.

export function buildCoordinationSeam({
  ventureId,
  teammateRef,
  configuration,
  agent,
  coordination,
  options,
  deps,
  drive,
}) {
  const budget = coordination?.budget ?? {
    used: 1,
    max: configuration.coordination.maxPasses,
  };
  const path = coordination?.path ?? [teammateRef];
  const participants = configuration.agents.filter((candidate) => {
    if (candidate.ref === teammateRef || path.includes(candidate.ref)) return false;
    if (candidate.activation === "direct") return false;
    if (candidate.activation === "watch") return configuration.coordination.protocols.includes("watch");
    return true;
  });

  if (budget.used >= budget.max || !participants.length) {
    return { participants, involveParticipant: null };
  }

  return {
    participants,
    involveParticipant: async ({ targetRef, protocol, question, context }) => {
      const target = configuration.agents.find((candidate) => candidate.ref === targetRef);
      if (!target || path.includes(targetRef)) {
        throw new Error(`Participant "${targetRef}" is not available in this coordination pass.`);
      }
      if (!configuration.coordination.protocols.includes(protocol)) {
        throw new Error(`Coordination protocol "${protocol}" is not enabled for this firm.`);
      }
      if (target.activation === "direct") {
        throw new Error(`${target.name} is configured for direct founder direction, not automatic involvement.`);
      }
      if (target.activation === "watch" && protocol !== "watch") {
        throw new Error(`${target.name} is dormant; involve it with the watch protocol when its condition is relevant.`);
      }
      if (budget.used >= budget.max) {
        const error = new Error(`This firm has used its configured ${budget.max} coordination passes.`);
        error.code = "coordination_budget_exhausted";
        throw error;
      }

      budget.used += 1;
      const request = { requestedBy: teammateRef, protocol, question: String(question).trim() };
      const result = await drive({
        ventureId,
        teammateRef: targetRef,
        goal: [
          `${agent.name} is asking for a ${protocol} contribution.`,
          `Focused question: ${request.question}`,
          context ? `Relevant context: ${String(context).trim()}` : null,
          "Contribute your own perspective. Do not merely agree; state what changes the decision, what remains uncertain, or why no further pass is useful.",
        ].filter(Boolean).join("\n"),
        initiatedBy: null,
        coordination: { budget, path: [...path, targetRef], request },
        options,
        deps,
      });
      const answer = result.messages
        .filter((message) => message.teammateRef === targetRef)
        .at(-1)?.content
        ?? String(result.outcome?.summary ?? "").trim();
      return {
        participantRef: targetRef,
        participantName: target.name,
        protocol,
        contribution: answer || "No further contribution.",
        runtime: result.runtime,
        passesUsed: budget.used,
        passesRemaining: Math.max(0, budget.max - budget.used),
      };
    },
  };
}
