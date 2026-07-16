// direction-routing.mjs — decide which teammate claims a founder's direction, with a one-line why
// (build contract §4A.1). Net-new: driveTeammate() takes teammateRef as an input; nothing server-side
// decided WHO should take a direction. This module is that decision, and only that decision — it never
// drives; the work loop is untouched. Routing decides WHO; driveTeammate stays the one place work runs.
//
// DETERMINISTIC-FIRST (engineering doctrine: if code can answer, code answers). The model is used only
// for the genuinely fuzzy case — matching free-text intent against several crew members' lenses. Every
// cheaper answer is taken first without a model call:
//   • an explicitly targeted teammate → claimed directly, no model
//   • a crew of one → that one claims, no model
//   • low/failed model confidence → the configured coordinator (or the first direct participant) claims
// The model call itself is injectable (deps.classify) and defaulted to a no-op that returns null, so a
// test never reaches the network and production wires the real bounded classifier at the route.

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// The deterministic fallback claimant, matching work-routes.mjs's long-standing derivation exactly: the
// configured coordinator if there is one, else the first participant that answers direction directly.
// Returns null when no coordinator and no direct participant exists — a relevance-only firm with no
// coordinator is NOT silently woken (the route surfaces "no configured participant"); routing must never
// invent an activation path the prior behavior refused.
function defaultClaimant(configuration) {
  const agents = configuration?.agents ?? [];
  if (!agents.length) return null;
  const coordinatorRef = trimOrNull(configuration?.coordination?.coordinatorRef);
  if (coordinatorRef) {
    const coordinator = agents.find((agent) => agent.ref === coordinatorRef);
    if (coordinator) return coordinator;
  }
  return agents.find((agent) => agent.activation === "direct" || agent.activation === "direct-or-relevant")
    ?? null;
}

// A short lens descriptor per teammate — what the model matches a direction against. Kept small and
// bounded (name + perspective + what they contribute + evaluation signals), never the whole soul.
function crewDescriptors(configuration) {
  return (configuration?.agents ?? []).map((agent) => ({
    ref: agent.ref,
    name: agent.name || agent.ref,
    perspective: agent.perspective || null,
    contributes: agent.contributes || [],
    evaluationSignals: agent.evaluation?.signals || [],
  }));
}

function claimReason(agent, { direct = false } = {}) {
  const name = agent.name || agent.ref;
  if (direct) return `${name} was named for this.`;
  if (agent.perspective) return `This fits ${name}'s lens: ${agent.perspective}.`;
  if (agent.contributes?.length) return `${name} carries this: ${agent.contributes[0]}.`;
  return `${name} is taking this one.`;
}

// routeDirection — given the founder's direction text, the venture configuration, and any explicitly
// targeted refs, return { teammateRef, why, usedModel }. Pure decision, no side effects, no drive.
// `deps.classify(direction, descriptors)` is the injectable bounded classifier: it returns
// { ref, why } | null. It is only ever called when the crew is size>1 and no teammate was explicitly
// named — the two cheap deterministic answers are taken first. A classifier that returns null, an
// unknown ref, or throws falls back deterministically to the coordinator; the model can only ever
// pick among the configured crew, never invent a participant.
export async function routeDirection({ direction, configuration, targetedRefs = [] } = {}, deps = {}) {
  const text = trimOrNull(direction);
  const agents = configuration?.agents ?? [];
  const byRef = new Map(agents.map((agent) => [agent.ref, agent]));

  // 1. An explicitly targeted teammate claims directly — never a model call.
  const named = targetedRefs.map(trimOrNull).find((ref) => ref && byRef.has(ref));
  if (named) {
    const agent = byRef.get(named);
    return { teammateRef: agent.ref, why: claimReason(agent, { direct: true }), usedModel: false };
  }

  const fallback = defaultClaimant(configuration);
  if (!fallback) return { teammateRef: null, why: null, usedModel: false };

  // 2. A crew of one skips the model entirely — there is no one else to choose.
  if (agents.length === 1 || !text) {
    return { teammateRef: fallback.ref, why: claimReason(fallback), usedModel: false };
  }

  // 3. The genuinely fuzzy case: match free-text intent against several lenses. Bounded model call,
  //    injectable and defaulted to null so a test never hits the network.
  const classify = typeof deps.classify === "function" ? deps.classify : async () => null;
  let decision = null;
  try {
    decision = await classify(text, crewDescriptors(configuration));
  } catch {
    decision = null;
  }
  const chosenRef = trimOrNull(decision?.ref);
  if (chosenRef && byRef.has(chosenRef)) {
    const agent = byRef.get(chosenRef);
    const why = trimOrNull(decision?.why) || claimReason(agent);
    return { teammateRef: agent.ref, why, usedModel: true };
  }

  // 4. Low confidence / unknown ref / no model → deterministic coordinator claim.
  return { teammateRef: fallback.ref, why: claimReason(fallback), usedModel: false };
}
