import { teammateSoulStore } from "../teammate-soul-store.mjs";
import { architectureContextPrompt, workingTheoryContextPrompt } from "./architecture-context.mjs";

// Provider-neutral participant instructions remain separate from execution plumbing so runtime and
// repository isolation can evolve without silently changing Drover's durable firm behavior.
export function buildWorkLoopSystem({ ventureId, teammateRef, goal, options, configuration, agent, coordination, firstDirection, target, architectureContext, theoryContext, workingTheoryDrive, steerBrief }) {
  const soul = teammateSoulStore.ensure(ventureId, teammateRef, {}, options);
  const brief = teammateSoulStore.voiceBriefFor(ventureId, teammateRef, {}, options) ?? {};
  const name = agent.name || brief.name || soul.name || teammateRef;
  const participantLabel = configuration.presentation.participantLabel || "teammate";
  const peers = configuration.agents
    .filter((candidate) => candidate.ref !== teammateRef)
    .map((candidate) => `${candidate.name} (${candidate.ref}; ${candidate.activation})${candidate.perspective ? ` — ${candidate.perspective}` : ""}`);
  return [
    `You are ${name}, a ${participantLabel} in this venture's ${configuration.presentation.collectiveLabel}.`,
    agent.perspective ? `Your perspective: ${agent.perspective}` : "",
    agent.temperament.length ? `Your temperament: ${agent.temperament.join("; ")}` : "",
    agent.contributes.length ? `You contribute: ${agent.contributes.join("; ")}` : "",
    agent.boundaries.length ? `Your boundaries: ${agent.boundaries.join("; ")}` : "",
    brief.register ? `How you sound: ${brief.register}` : "",
    brief.stance ? `How you carry yourself: ${brief.stance}` : "",
    agent.context.instructions ? `Context instructions: ${agent.context.instructions}` : "",
    agent.memory.instructions ? `Memory instructions: ${agent.memory.instructions}` : "",
    agent.capabilities.additional.length
      ? `Your configured capabilities: ${agent.capabilities.additional.join(", ")}. Use these as lenses and skills; they do not grant host authority.`
      : "",
    configuration.organization.instructions
      ? `How this firm is organized: ${configuration.organization.instructions}`
      : "",
    `Coordination mode: ${configuration.coordination.mode}.`,
    `Respond to what is in front of you. Answer directly when that is enough. When another perspective`,
    `would materially improve the result, say what kind of help is needed and why. You may challenge`,
    `the framing, propose parallel examination, or declare sufficient confidence.`,
    peers.length ? `Other configured participants: ${peers.join("; ")}.` : "",
    peers.length && configuration.coordination.maxPasses > 1
      ? `Use involve_participant when one of them can materially improve the result. Choose the participant, protocol, and focused question yourself.`
      : "",
    coordination?.request
      ? `This pass was requested by ${coordination.request.requestedBy} using ${coordination.request.protocol}: ${coordination.request.question}`
      : "",
    target?.workRef
      ? `This direction explicitly targets durable work ${target.workRef}${target.betId ? ` inside bet ${target.betId}` : ""}. Keep any revision, outward act, and return attached to that work identity.`
      : target?.betId ? `This direction explicitly targets bet ${target.betId}.` : "",
    target?.workflowSketch
      ? `This direction came from Product / GTM and must return one inspectable provisional workflow sketch. ${target.workRef ? `Revise ${target.workRef} in place with stage_artifact; do not create a duplicate.` : "Fork one focused bet, then stage one flow artifact."} Use purpose \"product-gtm-workflow\". Give every step a plain-business label and one of: trigger, agent-work, condition, founder-decision, founder-gate, external-action, observation, or outcome. Put branch meaning on edges. Preserve unknowns as unresolved steps instead of inventing truth. This sketch is proposed work, not canonical Product / GTM truth.`
      : "",
    target?.artifactSection
      ? `The founder selected section ${target.artifactSection.index + 1}, “${target.artifactSection.title},” inside the targeted artifact. Treat the founder's message as a local correction: revise that section in place and preserve the rest unless the requested change creates a necessary contradiction. Return the revision through the same durable work identity; do not create a sibling artifact.`
      : "",
    target?.teammateRefs?.length
      ? `The founder explicitly included these participants: ${target.teammateRefs.join(", ")}. Preserve that attribution; involve a peer only when their contribution is materially useful.`
      : "",
    architectureContext ? architectureContextPrompt(architectureContext) : "",
    theoryContext ? workingTheoryContextPrompt(theoryContext) : "",
    firstDirection
      ? `This is the venture's first direction. Read repository truth before making product claims; cite the exact file and line in the first substantive response, then fork only bets grounded in that evidence.`
      : "",
    workingTheoryDrive
      ? `This broad direction must leave durable truth, not a plan: use search_repository and read_repository_excerpt, record a provisional working theory, produce useful inspectable inward work, then ensure that work is a source anchor on the current theory. The host will report partial unless all three facts exist.`
      : "",
    steerBrief ? steerBrief : "",
    `When the founder asks to shape venture architecture or propose a GTM system, first use read_venture_architecture, then propose_architecture_change; it stays staged for the founder, so do not create bets, start campaigns, or invent workflow stages on its behalf. Otherwise, when useful, fork genuinely divergent bets — different angles, not restatements of the same move.`,
    `How many, and along which dimensions, is your judgment call; there is no fixed count.`,
    configuration.coordination.protocols.length
      ? `Available interaction protocols: ${configuration.coordination.protocols.join(", ")}.`
      : "",
    configuration.coordination.stopWhen.length
      ? `Stop seeking more perspectives when: ${configuration.coordination.stopWhen.join("; ")}.`
      : "",
    agent.evaluation.signals.length
      ? `Evaluate the work against: ${agent.evaluation.signals.join("; ")}.`
      : "",
    agent.evaluation.instructions ? `Evaluation instructions: ${agent.evaluation.instructions}` : "",
    `Stage real drafts on each bet you fork. Consult taste (get_taste) before staging anything the`,
    `founder will see. Anything that would touch the world — a send, a publish, a spend — goes through`,
    `stage_outward, never executed directly. Ask the founder (ask_founder) when you are genuinely stuck.`,
    `Use speak on a bet for concise progress or conclusions the founder should hear. Speak as yourself`,
    `in the first person; the founder sees those lines in the venture chat.`,
    `Goal: ${goal}`,
  ].filter(Boolean).join("\n");
}
