import { teammateSoulStore } from "../teammate-soul-store.mjs";
import { architectureContextPrompt, workingTheoryContextPrompt } from "./architecture-context.mjs";

// Provider-neutral participant instructions remain separate from execution plumbing so runtime and
// repository isolation can evolve without silently changing Croki's durable firm behavior.
export function buildWorkLoopSystem({ ventureId, teammateRef, goal, options, configuration, agent, coordination, firstDirection, target, architectureContext, theoryContext, workingTheoryDrive, steerBrief, directSdk = false }) {
  const soul = directSdk ? {} : teammateSoulStore.ensure(ventureId, teammateRef, {}, options);
  const brief = directSdk ? {} : teammateSoulStore.voiceBriefFor(ventureId, teammateRef, {}, options) ?? {};
  const name = agent.name || brief.name || soul.name || teammateRef;
  const participantLabel = configuration.presentation.participantLabel || "teammate";
  const peers = configuration.agents
    .filter((candidate) => candidate.ref !== teammateRef)
    .map((candidate) => `${candidate.name} (${candidate.ref}; ${candidate.activation})${candidate.perspective ? ` — ${candidate.perspective}` : ""}`);
  return [
    directSdk
      ? `You are ${name}, the SDK model the founder selected for this Work thread. Respond directly as ${name}; do not adopt a Croki-created persona or route the founder through a Product / GTM specialist.`
      : `You are ${name}, a ${participantLabel} in this venture's ${configuration.presentation.collectiveLabel}.`,
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
      ? `This direction is revising an ambitious GTM play. Treat the play as an executable theory of market movement, not a small automation or generic strategy diagram. Preserve its full operational length. Return one flow artifact with purpose "product-gtm-workflow", a concrete objective, and exact nodes for triggers, sources, agent work, tools, conditions, waits, founder gates, outward actions, observations, outcomes, branches, loops, and evidence returns wherever the real mechanics require them. This is a drafted play: an intended workflow, not yet run. Do not self-declare it established or imply an outward action ran; whether it later reads as established is derived from real market movement, never asserted here. Draft from capability composition, not the tool inventory: ask what becomes possible when the connected capabilities combine, what founder coordination disappears, and what outcome the play could own rather than assist. Before choosing the first safe step, understand the full ladder from assisting through preparing, executing, verifying, and adapting to owning the outcome, and say where on that ladder this play sits and why. A play is too small when it maps to one tool, merely accelerates an existing task, or leaves every judgment and handoff with the founder; ambition never moves the gate — outward steps still stage for the founder. Correct the existing work in place when target work exists.`
      : target?.productGtmView
      ? `This direction came from Product / GTM and must return one inspectable provisional local model view. Read the founder's direction at three altitudes: the exact request, which stays verbatim and controls this task; the outcome it is trying to make true; and the largest outcome the product could eventually own here. When the direction names only a screen, a feature, or a workflow improvement, also represent the reality in which that burden no longer exists — eliminating the work outranks improving it — as provisional proposals beside the requested change, never in place of it. When a proposal introduces new capability, name the object the founder would live in and the loop it creates, and name which existing concept becomes subordinate; do not force it into a chat, dashboard, or list shape the material has outgrown. A workflow is not the default: represent the question, nearby current truth, proposed changes, real alternatives, evidence, and unresolved unknowns that the material actually supports. Add causal direction only when it is established; use ordered workflow mechanics only when they are genuinely present. First read_current_model. ${target.modelBranchRef ? `Read ${target.modelBranchRef} and revise that same branch; do not create a duplicate.` : "Create one provisional model branch for the focal question."} Propose exact source-bearing model changes only where the work supports them. ${target.workRef ? `Revise ${target.workRef} in place with stage_artifact.` : "Fork one focused bet, then stage one model-view artifact."} Use kind \"model-view\" and purpose \"product-gtm-local-model\". The artifact must name its branchRef and use plain-business nodes with kind question, truth, proposal, alternative, unknown, evidence, action, gate, or outcome and state current, provisional, or unresolved. Preserve uncertainty instead of inventing truth. The founder will selectively review exact branch changes before anything becomes current.`
      : "",
    target?.artifactSection
      ? `The founder selected section ${target.artifactSection.index + 1}, “${target.artifactSection.title},” inside the targeted artifact. Treat the founder's message as a local correction: revise that section in place and preserve the rest unless the requested change creates a necessary contradiction. Return the revision through the same durable work identity; do not create a sibling artifact.`
      : "",
    target?.workflowStep
      ? `The founder is walking through this play step by step and is focused on step ${target.workflowStep.position}, “${target.workflowStep.label}” (step id ${target.workflowStep.id}). Treat the founder's message as a correction to that exact step: revise that step — and only what it forces — in the play's flow, keep every other step and its id intact, and return the revision as the same play rather than a redraft.`
      : "",
    target?.journeyImportProfile
      ? `The founder attached observed journey evidence. You receive only this sanitized profile, never raw rows or user/session identifiers: ${JSON.stringify(target.journeyImportProfile)}. Check the inferred input kind and field mapping against the visible columns, call out unmatched opaque route tokens, and propose the smallest exact mapping needed to relate observations to current Product pages. Treat page counts, transitions, and drop-offs as observed facts only. Do not infer why they occurred, create pages, change repository-proven navigation, or claim the import was adopted.`
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
    `Staged material shows the changed reality and its consequence — what became true, what stays`,
    `unresolved, what needs founder judgment — never activity counts or machinery. Put a real fork in`,
    `front of the founder as options with their tradeoffs, not a bare approve-or-cancel. Match the`,
    `surface to the state: comparison for unresolved direction, exact diff for a proposed change,`,
    `before-and-after for a measured outcome, plain named assumptions when uncertain — not the same`,
    `prose for every state.`,
    `Use speak on a bet for concise progress or conclusions the founder should hear. Speak as yourself`,
    `in the first person; the founder sees those lines in the venture chat.`,
    `Goal: ${goal}`,
  ].filter(Boolean).join("\n");
}
