// work-loop-tools.mjs — the tool set work-loop.mjs hands a driving teammate: read_truth, get_taste,
// fork_bet, stage_artifact, stage_outward, ask_founder, speak. Split out of work-loop.mjs by domain
// responsibility (the tools themselves vs. the drive that hands them to a runtime) to keep both files
// under the firm build's ~300-line budget.
//
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

const MAX_EVENTS_PER_BET = 200;

function genId(prefix) {
  const stamp = now().replace(/\D/g, "").slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(4).toString("hex")}`;
}

// The bounded per-bet event log — text beats, tool starts, staged artifacts. This is what the
// composer/lens streams; it is capped so a long-running drive never grows the venture file without
// bound. Only meaningful on a bet (pre-fork work has nothing yet worth streaming to a lens).
export function appendEvent(ventureId, betId, event, options) {
  if (!betId) return;
  const bet = getVentureDoc(ventureId, "bets", betId, options);
  if (!bet) return;
  const events = [...(bet.events ?? []), { ...event, at: now() }].slice(-MAX_EVENTS_PER_BET);
  setVentureDoc(ventureId, "bets", bet.id, { ...bet, events, updatedAt: now() }, options);
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

// fork_bet: the one structural verb, exposed as a tool. Divergence itself is never counted or shaped
// here — the teammate calls this as many times, with whatever distinct intents, as the goal warrants.
function makeForkBet({ ventureId, teammateRef, options, trackCall }) {
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
      const bet = parent
        ? fork(parent, intent, { teammateRef, learning })
        : createBet({ ventureId, intent, teammateRef });
      setVentureDoc(ventureId, "bets", bet.id, bet, options);
      appendEvent(ventureId, bet.id, { type: "bet_forked", detail: intent }, options);
      return bet;
    },
  };
}

// stage_artifact: attach content to bet.staged[] — a draft, a list, a page, a diff. Producing a draft
// requires taste to have been consulted first (consult-guard), so a staged artifact can never bypass
// the founder's own accumulated signal.
function makeStageArtifact({ ventureId, options, trackCall, consultedNames }) {
  return {
    name: "stage_artifact",
    description: "Attach a local draft, list, page, or diff to a bet without releasing it.",
    input_schema: {
      type: "object",
      properties: {
        betId: { type: "string" },
        content: {},
        producedDraft: { type: "boolean" },
        producedVisual: { type: "boolean" },
      },
      required: ["betId", "content"],
    },
    async run({ betId, content, producedDraft = true, producedVisual = false } = {}) {
      trackCall("stage_artifact");
      const consult = assertMoatConsulted({ toolCalls: [...consultedNames], producedDraft, producedVisual });
      if (!consult.ok) {
        const error = new Error(consult.note);
        error.code = "moat_not_consulted";
        throw error;
      }
      const bet = getVentureDoc(ventureId, "bets", betId, options);
      if (!bet) throw new Error(`No such bet: ${betId}`);
      const staged = [...(bet.staged ?? []), { id: genId("staged"), content, stagedAt: now() }];
      setVentureDoc(ventureId, "bets", bet.id, { ...bet, staged, updatedAt: now() }, options);
      appendEvent(ventureId, betId, { type: "staged", detail: null }, options);
      return staged[staged.length - 1];
    },
  };
}

// stage_outward: classify an intended effect and park anything outward at the wall queue (F3). Default-
// deny: a structural outward signal on the effect FORCES the wall regardless of the model's own
// effects.external/irreversible/financial claim — that claim is never trusted to turn a signal off, and
// its absence never turns a signal on either (host structural detection is the only path to
// FOUNDER_WALL besides the pre-existing host-authored effects path). This never executes anything —
// the only door past the wall is the founder's own decide().
function makeStageOutward({ ventureId, options, trackCall, consultedNames, deps }) {
  return {
    name: "stage_outward",
    description: "Park an outward, irreversible, or financial effect at the founder wall. Never executes it.",
    input_schema: {
      type: "object",
      properties: {
        betId: { type: "string" },
        effect: { type: "object" },
        producedDraft: { type: "boolean" },
        producedVisual: { type: "boolean" },
      },
      required: ["betId", "effect"],
    },
    async run({ betId, effect, producedDraft = true, producedVisual = false } = {}) {
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
      const park = deps?.park ?? (await import("./wall.mjs")).park;
      const queueItem = await park({ ventureId, betId, purpose: "release", effect }, options);
      appendEvent(ventureId, betId, { type: "parked", detail: null }, options);
      return { lane, parked: true, queueItem };
    },
  };
}

// ask_founder: parks one question at the wall queue rather than blocking the model on a chat turn it
// cannot have. A question is not an outward effect, but it is still the founder's door — it goes
// through the same park() injection point so F3 owns the one queue every pause lands in.
function makeAskFounder({ ventureId, options, deps }) {
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
        effect: { question },
      }, options);
      appendEvent(ventureId, betId, { type: "asked", detail: question }, options);
      return queueItem;
    },
  };
}

// speak: a narration beat, appended to the bet's event log — the plain "what I'm doing" line the
// composer/lens streams. No model prose reaches storage unshaped; this just banks the line as an event.
function makeSpeak({ ventureId, options }) {
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
      return { ok: true };
    },
  };
}

// Assembles the whole tool set for one drive. Returns `{ tools, consultedNames }` — consultedNames is
// the live Set every tool's trackCall writes into and assertMoatConsulted reads from, so the caller
// (work-loop.mjs) can also report which tools a drive actually consulted.
export function buildToolSet({ ventureId, teammateRef, options, cwd, taste, ventureStore, deps }) {
  const consultedNames = new Set();
  const trackCall = (name) => consultedNames.add(name);
  const definitions = [
    makeReadTruth({ cwd }),
    makeGetTaste({ ventureId, options, taste, ventureStore }),
    makeForkBet({ ventureId, teammateRef, options, trackCall }),
    makeStageArtifact({ ventureId, options, trackCall, consultedNames }),
    makeStageOutward({ ventureId, options, trackCall, consultedNames, deps }),
    makeAskFounder({ ventureId, options, deps }),
    makeSpeak({ ventureId, options }),
  ];
  // get_taste's own factory has no trackCall wired in (it takes only ventureId/options/taste/
  // ventureStore above) — wrap it here so calling it still registers as a moat consult.
  const getTaste = definitions.find((tool) => tool.name === "get_taste");
  const wrappedGetTaste = { ...getTaste, async run(input) { trackCall("get_taste"); return getTaste.run(input); } };
  const tools = definitions.map((tool) => (tool.name === "get_taste" ? wrappedGetTaste : tool));
  return { tools: filterSafeTools(tools), consultedNames };
}
