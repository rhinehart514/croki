// work-loop.mjs — the one loop, driven (FIRM-SPEC.md "The one loop": diverge → stage → wall →
// decide → outcome → feed). A teammate drives real work through the existing provider-neutral
// runtime adapters directly. The whole resume state is
// `{ runtimeSessionId, stepCount, spentUsd, pausedFor }` — living on the bet
// once one exists, or on a tiny per-teammate work record before the first fork — never a 40-field
// session.
//
// The ctx this module builds is the small callback seam every retained runtime adapter implements
// (isCancelled/currentStatus/onTurn/onText/onToolStart/onToolError/runTool/onRuntimeSession/onCost/
// resumePrompt/runtimeSessionId/spentUsd/maxSteps/stepCount/model/system/tools), built here because
// the drive has no separate session store or execution ledger. Divergence is prompt-level only
// (FIRM-SPEC.md "What stays open"): the system prompt tells the
// teammate to fork genuinely divergent bets; the host never counts or shapes them.

import { getVentureDoc, setVentureDoc, now } from "./venture-store.mjs";
import { teammateSoulStore } from "../teammate-soul-store.mjs";
import { selectRuntime } from "../runtimes/index.mjs";
import { appendEvent, buildToolSet } from "./work-loop-tools.mjs";
import { summon } from "./crew.mjs";

const DEFAULT_MAX_STEPS = 24;

function workKey(teammateRef) {
  return `work:${teammateRef}`;
}

// The whole resume record: runtimeSessionId/stepCount/spentUsd/pausedFor, nothing else. Lives on the
// bet once a bet exists (keyed by betId), otherwise on a tiny per-teammate doc under "crew" so a
// goal-only drive (no fork yet) still has somewhere honest to resume from.
function loadWork({ ventureId, teammateRef, betId, options }) {
  if (betId) {
    const bet = getVentureDoc(ventureId, "bets", betId, options);
    if (!bet) throw new Error(`No such bet: ${betId}`);
    return { bet, work: bet.work ?? blankWork() };
  }
  const doc = getVentureDoc(ventureId, "crew", workKey(teammateRef), options);
  return { bet: null, work: doc?.work ?? blankWork() };
}

function blankWork() {
  return { runtimeSessionId: null, stepCount: 0, spentUsd: 0, pausedFor: null };
}

// Writes the resume record back onto its home. Always re-reads the bet fresh — the drive itself may
// have forked, staged, or logged events onto it since loadWork's snapshot, and this must layer `work`
// on top of that CURRENT state, never overwrite it with the stale pre-drive copy.
function saveWork({ ventureId, teammateRef, betId, bet, work, options }) {
  const targetId = betId ?? bet?.id;
  if (targetId) {
    const target = getVentureDoc(ventureId, "bets", targetId, options);
    setVentureDoc(ventureId, "bets", targetId, { ...target, work, updatedAt: now() }, options);
    return;
  }
  setVentureDoc(ventureId, "crew", workKey(teammateRef), { work, updatedAt: now() }, options);
}

// The system prompt: the teammate's soul/voice, plus the one standing instruction that carries
// FIRM-SPEC.md's divergence doctrine — the host names the expectation, the crew judges the shape.
function buildSystem({ ventureId, teammateRef, goal, options }) {
  const soul = teammateSoulStore.ensure(ventureId, teammateRef, {}, options);
  const brief = teammateSoulStore.voiceBriefFor(ventureId, teammateRef, {}, options) ?? {};
  const name = brief.name || soul.name || teammateRef;
  return [
    `You are ${name}, a teammate on this venture's crew.`,
    brief.register ? `How you sound: ${brief.register}` : "",
    brief.stance ? `How you carry yourself: ${brief.stance}` : "",
    `Facing this goal, fork genuinely divergent bets — different angles, not restatements of the same`,
    `move. How many, and along which dimensions, is your judgment call; there is no fixed count.`,
    `Stage real drafts on each bet you fork. Consult taste (get_taste) before staging anything the`,
    `founder will see. Anything that would touch the world — a send, a publish, a spend — goes through`,
    `stage_outward, never executed directly. Ask the founder (ask_founder) when you are genuinely stuck.`,
    `Goal: ${goal}`,
  ].filter(Boolean).join("\n");
}

// driveTeammate — the whole loop, one call. Builds the retained runtime callback seam
// already proves, selects the runtime, and drives
// to the next pause. `deps` lets callers (and tests) inject `park`, `client`/`query`/`runtime`
// (forwarded to selectRuntime), `taste`, `ventureStore`, and `cwd` without reaching into module
// internals — the same injection convention brain/test/runtimes.test.mjs already uses.
export async function driveTeammate({
  ventureId,
  teammateRef,
  goal,
  betId = null,
  model = null,
  options = {},
  deps = {},
} = {}) {
  if (!ventureId) throw new Error("driveTeammate() needs a ventureId.");
  if (!teammateRef) throw new Error("driveTeammate() needs a teammateRef.");
  if (!goal) throw new Error("driveTeammate() needs a goal.");

  summon(ventureId, teammateRef, { templateRef: teammateRef }, options);
  const { bet, work } = loadWork({ ventureId, teammateRef, betId, options });

  const taste = deps.taste ?? deps.memory ?? await import("./taste.mjs");
  const ventureStore = deps.ventureStore ?? await import("./venture-store.mjs");
  const venture = ventureStore.openVenture(ventureId, options);
  if (!venture) throw new Error(`No such venture: ${ventureId}`);
  const { tools, consultedNames } = buildToolSet({
    ventureId,
    teammateRef,
    options,
    cwd: deps.cwd ?? venture.repository,
    taste,
    ventureStore,
    deps,
  });

  const selection = selectRuntime({
    client: deps.client, runtime: deps.runtime, forced: deps.forced, model, env: deps.env,
  });
  if (!selection.adapter) {
    const error = new Error(selection.reason || "No runtime available to drive this teammate.");
    error.code = "runtime_unavailable";
    throw error;
  }

  const resumePrompt = work.pausedFor ? `${work.pausedFor} Continue.` : null;
  let currentWork = { ...work, pausedFor: null };
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));

  const ctx = {
    goal,
    model: model ?? selection.adapter.id,
    system: buildSystem({ ventureId, teammateRef, goal, options }),
    tools: tools.map(({ run: _run, ...definition }) => definition),
    client: selection.client ?? null,
    query: deps.query ?? null,
    options,
    env: deps.env ?? process.env,
    initialMessages: null,
    runtimeSessionId: currentWork.runtimeSessionId,
    resumePrompt,
    onRuntimeSession: (sid) => { currentWork = { ...currentWork, runtimeSessionId: sid }; },
    spentUsd: Number(currentWork.spentUsd) || 0,
    onCost: (usd) => { currentWork = { ...currentWork, spentUsd: (Number(currentWork.spentUsd) || 0) + (Number(usd) || 0) }; },
    maxSteps: deps.maxSteps ?? DEFAULT_MAX_STEPS,
    stepCount: Number(currentWork.stepCount) || 0,
    isCancelled: deps.isCancelled ?? (() => false),
    currentStatus: () => (currentWork.pausedFor ? "paused" : "running"),
    onTurn: () => { currentWork = { ...currentWork, stepCount: (Number(currentWork.stepCount) || 0) + 1 }; return currentWork.stepCount; },
    onText: (text) => appendEvent(ventureId, betId ?? bet?.id, { type: "text", detail: text }, options),
    onToolStart: (name) => appendEvent(ventureId, betId ?? bet?.id, { type: "tool_started", detail: name }, options),
    onToolError: (name, message) => appendEvent(ventureId, betId ?? bet?.id, { type: "tool_failed", detail: `${name}: ${message}` }, options),
    runTool: async ({ name, input }) => {
      const tool = toolByName.get(name);
      if (!tool) throw new Error(`Unknown firm tool "${name}".`);
      const result = await tool.run(input ?? {});
      const pause = name === "ask_founder" || (name === "stage_outward" && result?.parked === true);
      if (pause) currentWork = { ...currentWork, pausedFor: name === "ask_founder" ? "Waiting for the founder's answer." : "Waiting at the founder wall." };
      return { result, pause };
    },
    persistMessages: () => {},
  };

  const outcome = await selection.adapter.drive(ctx);
  currentWork = {
    ...currentWork,
    pausedFor: outcome.kind === "paused" ? (currentWork.pausedFor ?? outcome.summary ?? "Paused.") : null,
  };
  saveWork({ ventureId, teammateRef, betId, bet, work: currentWork, options });

  return { outcome, work: currentWork, consultedTools: [...consultedNames] };
}
