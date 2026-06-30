// INPUT ROUTING — the ACTOR that turns the pure router's DECISION into a side effect. input-router.mjs
// only decides; this is the caller its header describes ("the caller reads the decision and acts on it").
// Keeping the decider pure and the actor here is exactly what lets input-router.test.mjs forbid the router
// from importing any store/run path while the real wiring still exists — in THIS file, the one place
// allowed to touch the durable stores and the operator.
//
// THE WALL IS UNTOUCHED. Two of the three branches never start a run at all: `flow` only RECORDS which
// channel a captured signal belongs to (it does NOT auto-run the channel), and `ignore` sets the signal
// aside. The third, `ambient_wake`, starts the SAME gate-pausing operator drive a goal session does
// (wakeAmbientSession → runOperatorSession), with no send/approve/deploy tool handed to the model — so it
// composes and runs ONLY to the founder gate and STOPS. Ingestion is UPSTREAM of this and stays pure: a
// captured input sits 'unrouted' until something explicitly calls in here. Capture never fires routing.

import { routeInput } from "./input-router.mjs";
import { listUnroutedInputs, markRouted } from "./inputs-store.mjs";
import { loadProject } from "./project-store.mjs";
import { getOrCreateSessionForProject } from "./operator-store.mjs";
import { wakeAmbientSession } from "./operator-runtime.mjs";

// Read the project's channels unless the caller injected them (tests / batch callers that already hold
// the list). The router needs the channel shapes — kind / name / objective — to do the deterministic
// flow match.
function channelsFor(projectId, options) {
  if (Array.isArray(options.channels)) return options.channels;
  return loadProject({ ...options, projectId }).channels ?? [];
}

// Act on ONE captured input. Decides via the pure router, then dispatches the single legal side effect.
// Returns { input, decision, sessionId? } describing what happened — the input is the post-mutation
// record (status 'routed' or 'ignored'), so a caller can report the outcome without re-reading the store.
//
// options carries persistence (root), plus optional seams: channels (skip the project read), wakeScorer
// (the fuzzy "does this warrant a wake?" judgment the router injects), and client/composer (the operator
// runtime for an ambient drive). Omit the seams in production and the live defaults apply: no scorer means
// the router refuses to wake, and no client/composer means wakeAmbientSession selects the live runtime.
export function actOnInput(projectId, input, options = {}) {
  const channels = channelsFor(projectId, options);
  const decision = routeInput(input, channels, { wakeScorer: options.wakeScorer });

  if (decision.route === "flow") {
    // A channel's intake fits — RECORD that this signal belongs to the channel. We deliberately do NOT
    // run the channel here: running it is a separate founder/operator act, and it still hits the gate.
    const updated = markRouted(projectId, input.id, decision.channelId, options);
    return { input: updated, decision };
  }

  if (decision.route === "ambient_wake") {
    // No channel fits, but the router's scorer warrants waking a standing brief. Get-or-create the
    // project's AMBIENT operator session (its own slot — never the goal thread) and drive it to the
    // founder gate. The wake composes and runs only to the gate and stops; nothing sends.
    const { session } = getOrCreateSessionForProject(
      projectId,
      { kind: "ambient", standingBrief: decision.brief, graphId: options.ambientGraphId ?? null },
      options,
    );
    const woken = wakeAmbientSession(
      session.id,
      { brief: decision.brief, detail: decision.reason, trigger: "ambient_wake" },
      { client: options.client, composer: options.composer, options },
    );
    const updated = markRouted(projectId, input.id, `ambient:${woken.id}`, options);
    return { input: updated, decision, sessionId: woken.id };
  }

  // ignore — set the signal aside, never start a run. The safe default.
  const updated = markRouted(projectId, input.id, null, { ...options, ignored: true });
  return { input: updated, decision };
}

// Route every still-unrouted input for a project, in capture order, acting on each. This is what a server
// route or a scout-drain calls to work the inbox; it is NEVER fired by ingestion itself, so capturing a
// signal still leaves it unrouted until this is explicitly invoked. Returns the per-input results.
export function routeUnroutedInputs(projectId, options = {}) {
  const channels = channelsFor(projectId, options);
  const pending = listUnroutedInputs(projectId, options);
  return pending.map((input) => actOnInput(projectId, input, { ...options, channels }));
}
