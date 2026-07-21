// The safe tool set work-loop.mjs hands a driving participant.
// Every tool here is an ordinary function over the firm core, screened by FORBIDDEN_TOOL through
// filterSafeTools before it ever reaches a model. None of them execute an outward effect themselves —
// stage_outward only classifies and parks; the founder's own decision (F3) is the only door out.

import crypto from "node:crypto";
import { getVentureDoc, setVentureDoc, now } from "./venture-store.mjs";
import { createBet, fork } from "./bet.mjs";
import { filterSafeTools } from "../tool-safety.mjs";
import { assertMoatConsulted } from "../consult-guard.mjs";
import { classifyCapabilityEffects, CAPABILITY_LANES } from "../capability-registry.mjs";
import { readRepositoryTruth } from "./truth.mjs";
import { hasOutwardSignal } from "./outward-guard.mjs";
import { appendConversationMessage } from "./conversation.mjs";
import { getFirmConfiguration, proposeFirmConfiguration } from "./configuration.mjs";
import { buildArchitectureWorkLoopTools } from "./architecture-work-loop-tools.mjs";
import { buildRepositoryWorkLoopTools } from "./repository-work-loop-tools.mjs";
import { parkOutwardAtWall } from "./grant-stage-outward.mjs";
import { extendDirectionThread } from "./semantic-model-store.mjs";
import { emitFirmEvent } from "./firm-events.mjs";

const MAX_EVENTS_PER_BET = 200;

function genId(prefix) {
  const stamp = now().replace(/\D/g, "").slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(4).toString("hex")}`;
}

// Bounded per-bet material activity; pre-fork work has no durable subject for these events.
export function appendEvent(ventureId, betId, event, options) {
  if (!betId) return null;
  const bet = getVentureDoc(ventureId, "bets", betId, options);
  if (!bet) return null;
  const storedEvent = {
    ...event,
    id: event?.id ?? genId("event"),
    at: event?.at ?? now(),
  };
  const events = [...(bet.events ?? []), storedEvent].slice(-MAX_EVENTS_PER_BET);
  setVentureDoc(ventureId, "bets", bet.id, { ...bet, events, updatedAt: now() }, options);
  return storedEvent;
}

// Complete only exact measured tool duration; never infer model time or cost here.
export function completeEventReceipt(ventureId, betId, eventId, receipt = {}, options) {
  if (!betId || !eventId) return null;
  const bet = getVentureDoc(ventureId, "bets", betId, options);
  if (!bet) return null;
  const index = (bet.events ?? []).findIndex((event) => event?.id === eventId);
  if (index < 0) return null;
  const durationMs = Number(receipt.durationMs);
  if (!Number.isFinite(durationMs) || durationMs < 0) return bet.events[index];
  const events = [...bet.events];
  events[index] = { ...events[index], durationMs };
  setVentureDoc(ventureId, "bets", bet.id, { ...bet, events, updatedAt: now() }, options);
  return events[index];
}

// read_truth is cited repository grounding, not interpretation.
function makeReadTruth({ cwd }) {
  return {
    name: "read_truth",
    description: "Read cited repository truth for this venture before making claims about the product.",
    input_schema: { type: "object", properties: {}, required: [] },
    async run() {
      try {
        return readRepositoryTruth(cwd || process.cwd());
      } catch (error) {
        return { evidenceState: "blind", error: error.message };
      }
    },
  };
}

function decisionsToTaste(ventureId, options, { listVentureDocs }) {
  const docs = listVentureDocs(ventureId, "decisions", options);
  const released = [];
  const rejected = [];
  for (const doc of docs) {
    const effect = doc?.effect && typeof doc.effect === "object" ? doc.effect : {};
    const candidates = [effect.draft, effect.message, effect.body, effect.text, effect.content, effect.outcome?.body];
    const draft = candidates.find((value) => typeof value === "string" && value.trim()) ?? null;
    if (!draft) continue;
    if (doc.decision === "release") {
      released.push({ text: draft });
    } else if (doc.decision === "reject") {
      rejected.push({ text: draft });
    }
  }
  return { released, rejected };
}

function makeGetTaste({ ventureId, options, taste, ventureStore }) {
  return {
    name: "get_taste",
    description: "Read the founder's accumulated releases and rejections before drafting.",
    input_schema: {
      type: "object",
      properties: { question: { type: "string" } },
      required: [],
    },
    async run({ question } = {}) {
      const decisions = decisionsToTaste(ventureId, options, ventureStore);
      const recordedTaste = taste.buildTaste(decisions);
      return taste.queryTaste(recordedTaste, { question }) ?? { text: "No taste recorded yet.", meta: { mode: "empty" } };
    },
  };
}

function makeGetFirmConfiguration({ ventureId, options }) {
  return {
    name: "get_firm_configuration",
    description: "Read the venture's current participant, runtime, coordination, budget, and authority configuration.",
    input_schema: { type: "object", properties: {}, required: [] },
    async run() {
      return getFirmConfiguration(ventureId, options);
    },
  };
}

function makeProposeFirmConfiguration({ ventureId, teammateRef, options, trackCall }) {
  return {
    name: "propose_firm_configuration",
    description: "Propose a partial change to the firm configuration for founder review. This never applies the change.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        rationale: { type: "string" },
        changes: { type: "object" },
      },
      required: ["summary", "changes"],
    },
    async run({ summary, rationale, changes } = {}) {
      trackCall("propose_firm_configuration");
      const proposal = proposeFirmConfiguration({
        ventureId,
        changes,
        summary,
        rationale,
        proposedBy: teammateRef,
      }, options);
      appendConversationMessage({
        ventureId,
        role: "teammate",
        kind: "configuration-proposal",
        content: proposal.rationale ? `${proposal.summary} — ${proposal.rationale}` : proposal.summary,
        teammateRef,
        configurationProposal: proposal,
      }, options);
      return {
        proposalId: proposal.id,
        baseRevision: proposal.baseRevision,
        proposedRevision: proposal.proposedRevision,
        summary: proposal.summary,
        applied: false,
      };
    },
  };
}

// A participant chooses a configured peer and protocol for a bounded contribution.
function makeInvolveParticipant({ participants, protocols, involveParticipant, trackCall, contributingRefs }) {
  const participantRefs = participants.map((participant) => participant.ref);
  return {
    name: "involve_participant",
    description: "Ask another configured participant for a focused contribution using an allowed coordination protocol.",
    input_schema: {
      type: "object",
      properties: {
        targetRef: { type: "string", enum: participantRefs },
        protocol: { type: "string", enum: protocols },
        question: { type: "string" },
        context: { type: "string" },
      },
      required: ["targetRef", "protocol", "question"],
    },
    async run({ targetRef, protocol, question, context } = {}) {
      trackCall("involve_participant");
      if (!participantRefs.includes(targetRef)) throw new Error(`No available configured participant has ref "${targetRef}".`);
      if (!protocols.includes(protocol)) throw new Error(`Coordination protocol "${protocol}" is not enabled for this firm.`);
      if (!String(question ?? "").trim()) throw new Error("A participant contribution needs a focused question.");
      const contribution = await involveParticipant({ targetRef, protocol, question, context });
      contributingRefs.add(targetRef);
      return contribution;
    },
  };
}

// fork_bet is the one structural divergence verb; the participant decides its shape.
function makeForkBet({ ventureId, teammateRef, configurationRevision, architectureRevision, target, options, trackCall }) {
  return {
    name: "fork_bet",
    description: "Create a genuinely distinct bet, optionally as a mutation of an existing bet.",
    input_schema: {
      type: "object",
      properties: {
        intent: { type: "string" },
        forkedFrom: { type: "string" },
        learning: { type: "string" },
      },
      required: ["intent"],
    },
    async run({ intent, forkedFrom, learning } = {}) {
      trackCall("fork_bet");
      const parent = forkedFrom ? getVentureDoc(ventureId, "bets", forkedFrom, options) : null;
      const created = parent
        ? fork(parent, intent, { teammateRef, learning, configurationRevision })
        : createBet({ ventureId, intent, teammateRef, configurationRevision });
      const bet = {
        ...created,
        architectureRevision: architectureRevision ?? created.architectureRevision ?? null,
        architectureTarget: target?.architectureId ? { id: target.architectureId, stepId: target.architectureStepId ?? null } : (created.architectureTarget ?? null),
      };
      setVentureDoc(ventureId, "bets", bet.id, bet, options);
      // An approach opened during a direction belongs to that conversation immediately.
      if (target?.threadRef) {
        try {
          extendDirectionThread(ventureId, target.threadRef, { subjectRefs: [`bet:${bet.id}`] }, options);
          emitFirmEvent(ventureId, "timeline", { threadRef: target.threadRef });
        } catch {
          // Terminal settlement retries this optional presentation join.
        }
      }
      appendEvent(ventureId, bet.id, { type: "bet_forked", detail: intent }, options);
      return bet;
    },
  };
}

// Staged drafts must consult the founder's accumulated taste first.
function makeStageArtifact({ ventureId, teammateRef, configurationRevision, architectureRevision, target, options, trackCall, consultedNames, contributingRefs }) {
  return {
    name: "stage_artifact",
    description: "Attach local work to a bet without releasing it. Arbitrary legacy content remains valid. For a deliberate Product/GTM workflow sketch use { kind: 'flow', purpose: 'product-gtm-workflow', steps: [{ id, label, detail?, type? }], edges: [{ from, to, label? }] }. For a deliberate comparison use { kind: 'comparison', variant: 'before-after' | 'alternatives', columns: [{ id, title, items: [{ label, detail?, artifactRef? }] }] }.",
    input_schema: {
      type: "object",
      properties: {
        betId: { type: "string" },
        content: {
          anyOf: [
            {
              type: "object", properties: {
                kind: { const: "flow" },
                purpose: { enum: ["product-gtm-workflow"] },
                steps: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, detail: { type: "string" }, type: { enum: ["trigger", "agent-work", "condition", "founder-decision", "founder-gate", "external-action", "observation", "outcome"] } }, required: ["id", "label"] } },
                edges: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string" } }, required: ["from", "to"] } },
              }, required: ["kind", "steps", "edges"],
            },
            {
              type: "object", properties: {
                kind: { const: "comparison" }, variant: { enum: ["before-after", "alternatives"] },
                columns: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, items: { type: "array", items: { type: "object", properties: { label: { type: "string" }, detail: { type: "string" }, artifactRef: { type: "string" } }, required: ["label"] } } }, required: ["id", "title", "items"] } },
              }, required: ["kind", "variant", "columns"],
            },
            {},
          ],
        },
        title: { type: "string" },
        workRef: { type: "string" },
        producedDraft: { type: "boolean" },
        producedVisual: { type: "boolean" },
      },
      required: ["betId", "content"],
    },
    async run({ betId, content, title = null, workRef = null, producedDraft = true, producedVisual = false } = {}) {
      trackCall("stage_artifact");
      const consult = assertMoatConsulted({ toolCalls: [...consultedNames], producedDraft, producedVisual });
      if (!consult.ok) {
        const error = new Error(consult.note);
        error.code = "moat_not_consulted";
        throw error;
      }
      const bet = getVentureDoc(ventureId, "bets", betId, options);
      if (!bet) throw new Error(`No such bet: ${betId}`);
      const staged = [...(bet.staged ?? [])];
      const existingIndex = workRef ? staged.findIndex((item) => item?.id === workRef) : -1;
      if (workRef && existingIndex < 0) throw new Error(`No staged work ${workRef} belongs to bet ${betId}.`);
      const previous = existingIndex >= 0 ? staged[existingIndex] : null;
      const priorOwners = Array.isArray(previous?.ownerRefs) ? previous.ownerRefs.filter(Boolean) : [];
      const owners = priorOwners.length ? [...new Set(priorOwners)] : [teammateRef];
      const priorContributors = Array.isArray(previous?.contributorRefs) ? previous.contributorRefs.filter(Boolean) : [];
      const contributors = [...new Set([
        ...priorContributors,
        ...[...contributingRefs].filter((ref) => !owners.includes(ref)),
      ])];
      const timestamp = now();
      const artifact = {
        ...(previous ?? {}),
        id: previous?.id ?? genId("staged"),
        ...(String(title ?? "").trim() ? { title: String(title).trim() } : {}),
        content,
        ownerRefs: owners,
        contributorRefs: contributors,
        configurationRevision: configurationRevision ?? previous?.configurationRevision ?? null,
        architectureRevision: architectureRevision ?? previous?.architectureRevision ?? bet.architectureRevision ?? null,
        architectureTarget: target?.architectureId ? { id: target.architectureId, stepId: target.architectureStepId ?? null } : (previous?.architectureTarget ?? bet.architectureTarget ?? null),
        stagedAt: previous?.stagedAt ?? timestamp,
        updatedAt: timestamp,
      };
      if (existingIndex >= 0) staged[existingIndex] = artifact;
      else staged.push(artifact);
      setVentureDoc(ventureId, "bets", bet.id, { ...bet, staged, updatedAt: now() }, options);
      appendEvent(ventureId, betId, { type: "staged", detail: null }, options);
      return artifact;
    },
  };
}

// stage_outward defaults to the wall when host structural detection finds an outward signal. Model safety
// claims cannot turn that signal off, and only the founder's decide can execute the parked consequence.
function makeStageOutward({ ventureId, configurationRevision, architectureRevision, target, options, trackCall, consultedNames, deps }) {
  return {
    name: "stage_outward",
    description: "Park an outward, irreversible, or financial effect at the founder wall. Never executes it.",
    input_schema: {
      type: "object",
      properties: {
        betId: { type: "string" },
        workRef: { type: "string" },
        effect: { type: "object" },
        producedDraft: { type: "boolean" },
        producedVisual: { type: "boolean" },
      },
      required: ["betId", "effect"],
    },
    async run({ betId, workRef = null, effect, producedDraft = true, producedVisual = false } = {}) {
      trackCall("stage_outward");
      // classifyCapabilityEffects is still consulted (both effect.effects AND a top-level
      // {external|irreversible|financial|writeTargets} shape — the pre-existing convention this tool
      // already accepted) because an explicit true claim can only ever ADD a reason to park, never
      // remove one: this call's result is OR'd with the structural signal below, never used to
      // override or suppress it. The vulnerability was only ever in trusting its ABSENCE as proof of
      // safety; trusting its PRESENCE as one more reason to park is safe either way.
      const structuralSignal = hasOutwardSignal(effect);
      const hostClassified = classifyCapabilityEffects(effect?.effects ?? effect ?? {}) === CAPABILITY_LANES.FOUNDER_WALL;
      const lane = (structuralSignal || hostClassified) ? CAPABILITY_LANES.FOUNDER_WALL : CAPABILITY_LANES.READ_ONLY;

      // Every call leaves a trace — parked or not — so a bypass attempt is never invisible.
      appendEvent(ventureId, betId, {
        type: "stage_outward_classified",
        detail: JSON.stringify({ lane, structuralSignal }),
      }, options);

      if (lane !== CAPABILITY_LANES.FOUNDER_WALL) {
        return { lane, parked: false, note: "Not an outward/irreversible/financial effect — nothing to park." };
      }

      // An outward-routed effect is founder-facing drafting by definition — producedDraft:false on the
      // call itself can never waive the taste consult for anything landing at the wall (consult-guard's
      // own contract is unchanged: this just refuses to let the model's flag turn it off here).
      const consult = assertMoatConsulted({ toolCalls: [...consultedNames], producedDraft: true, producedVisual });
      if (!consult.ok) {
        const error = new Error(consult.note);
        error.code = "moat_not_consulted";
        throw error;
      }
      const bet = getVentureDoc(ventureId, "bets", betId, options);
      if (!bet) throw new Error(`No such bet: ${betId}`);
      const requestedWorkRef = String(workRef ?? "").trim() || null;
      if (requestedWorkRef && !(bet.staged ?? []).some((artifact) => artifact?.id === requestedWorkRef)) {
        throw new Error(`No staged work ${requestedWorkRef} belongs to bet ${betId}.`);
      }
      const stagedWorkRefs = [...new Set((bet.staged ?? []).map((artifact) => artifact?.id).filter(Boolean))];
      // One candidate is safe to infer. With several workpieces, "latest" is only chronology—not
      // provenance—so leave the act unjoined and let wall.park give it its own durable identity.
      const unambiguousWorkRef = stagedWorkRefs.length === 1 ? stagedWorkRefs[0] : null;

      // The trust-grant check + honest wall-park lives in grant-stage-outward.mjs (keeps this service
      // under its size budget). It parks the effect at the founder wall and, for a granted act type,
      // skips the WAIT (not the RELEASE) without ever claiming a send it did not perform.
      return parkOutwardAtWall({
        ventureId, betId, bet, lane, effect,
        requestedWorkRef, unambiguousWorkRef,
        configurationRevision, architectureRevision, target,
        options, deps, appendEvent,
      });
    },
  };
}

// ask_founder: parks one question at the wall queue rather than blocking the model on a chat turn it
// cannot have. A question is not an outward effect, but it is still the founder's door — it goes
// through the same park() injection point so F3 owns the one queue every pause lands in.
function makeAskFounder({ ventureId, configurationRevision, architectureRevision, target, options, deps }) {
  return {
    name: "ask_founder",
    description: "Park a question for the founder when work cannot continue without an answer.",
    input_schema: {
      type: "object",
      properties: { betId: { type: "string" }, question: { type: "string" } },
      required: ["question"],
    },
    async run({ betId, question } = {}) {
      const park = deps?.park ?? (await import("./wall.mjs")).park;
      const queueItem = await park({
        ventureId,
        betId,
        purpose: "answer",
        configurationRevision,
        architectureRevision,
        architectureTarget: target?.architectureId ? { id: target.architectureId, stepId: target.architectureStepId ?? null } : null,
        effect: { question },
      }, options);
      appendEvent(ventureId, betId, { type: "asked", detail: question }, options);
      return queueItem;
    },
  };
}

// speak: a narration beat, appended to both the bet's event log and the passive venture conversation —
// the plain "what I'm doing" line the founder sees. No model prose reaches chat unshaped; only an
// explicit speak call becomes a teammate message.
function makeSpeak({ ventureId, teammateRef, target, options }) {
  return {
    name: "speak",
    description: "Record a short progress beat on a bet for the founder to see.",
    input_schema: {
      type: "object",
      properties: { betId: { type: "string" }, text: { type: "string" } },
      required: ["betId", "text"],
    },
    async run({ betId, text } = {}) {
      appendEvent(ventureId, betId, { type: "speak", detail: text }, options);
      appendConversationMessage({
        ventureId,
        role: "teammate",
        content: text,
        teammateRef,
        betId,
        target,
      }, options);
      return { ok: true };
    },
  };
}

// Assembles the whole tool set for one drive. Returns `{ tools, consultedNames }` — consultedNames is
// the live Set every tool's trackCall writes into and assertMoatConsulted reads from, so the caller
// (work-loop.mjs) can also report which tools a drive actually consulted.
export function buildToolSet({
  ventureId,
  teammateRef,
  configurationRevision = null,
  architectureRevision = null,
  options,
  cwd,
  taste,
  ventureStore,
  deps,
  coordinationParticipants = [],
  coordinationProtocols = [],
  involveParticipant = null,
  target = null,
}) {
  const consultedNames = new Set();
  const contributingRefs = new Set([teammateRef]);
  const capturedSources = new Map();
  const trackCall = (name) => consultedNames.add(name);
  const definitions = [
    makeReadTruth({ cwd }),
    ...buildRepositoryWorkLoopTools({ cwd, trackCall, capturedSources }),
    makeGetFirmConfiguration({ ventureId, options }),
    makeGetTaste({ ventureId, options, taste, ventureStore }),
    ...buildArchitectureWorkLoopTools({
      ventureId,
      teammateRef,
      configurationRevision,
      options,
      trackCall,
      consultedNames,
      capturedSources,
      target,
    }),
    makeForkBet({ ventureId, teammateRef, configurationRevision, architectureRevision, target, options, trackCall }),
    makeStageArtifact({ ventureId, teammateRef, configurationRevision, architectureRevision, target, options, trackCall, consultedNames, contributingRefs }),
    makeStageOutward({ ventureId, configurationRevision, architectureRevision, target, options, trackCall, consultedNames, deps }),
    makeAskFounder({ ventureId, configurationRevision, architectureRevision, target, options, deps }),
    makeSpeak({ ventureId, teammateRef, target, options }),
    makeProposeFirmConfiguration({ ventureId, teammateRef, options, trackCall }),
    coordinationParticipants.length && coordinationProtocols.length && involveParticipant
      ? makeInvolveParticipant({
          participants: coordinationParticipants,
          protocols: coordinationProtocols,
          involveParticipant,
          trackCall,
          contributingRefs,
        })
      : null,
  ];
  // get_taste's own factory has no trackCall wired in (it takes only ventureId/options/taste/
  // ventureStore above) — wrap it here so calling it still registers as a moat consult.
  const getTaste = definitions.find((tool) => tool.name === "get_taste");
  const wrappedGetTaste = { ...getTaste, async run(input) { trackCall("get_taste"); return getTaste.run(input); } };
  const tools = definitions.filter(Boolean).map((tool) => (tool.name === "get_taste" ? wrappedGetTaste : tool));
  return { tools: filterSafeTools(tools), consultedNames };
}
