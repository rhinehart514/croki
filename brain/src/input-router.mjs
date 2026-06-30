// The INPUT ROUTER — a pure classifier+decider that sits between the inputs inbox (inputs-store.mjs,
// the durable log of "something happened out there") and the run path. Given one captured world signal
// (kind / source / payload) and the project's channels, it returns a typed routing DECISION — nothing
// more. It DECIDES, it does not ACT: it never composes, runs, sends, deploys, or approves. The caller
// reads the decision and acts on it, and any run the caller then starts still hits the founder gate
// like every other run. This module imports no store, no composer, no execute/send path — that is how
// "ambient does not relax the wall" is kept structurally true here: the router can only ever hand back
// a description of what should happen next; the wall lives downstream, untouched.
//
// Three decisions are legal:
//   { route: "flow", channelId, reason }      — the input matches an existing channel's intake; feed it
//                                               into that channel's run (which still gates).
//   { route: "ambient_wake", brief, reason }  — no channel fits, but the input warrants waking a
//                                               standing brief; the caller composes+runs that brief TO
//                                               THE GATE and stops. The router never wakes on its own
//                                               judgment — that fuzzy call is an injectable scorer whose
//                                               honest blank default refuses (no wake) rather than
//                                               guessing.
//   { route: "ignore", reason }               — noise, or ambiguous, or nothing fits and nothing
//                                               warrants a wake. The safe default, never a run.

const ROUTES = new Set(["flow", "ambient_wake", "ignore"]);

// A token has to carry signal to be matched on — single letters and stop-ish fragments only create
// false channel matches. Keep the floor low (3) so real terms like "pr", "ci" still need to be spelled
// out in the channel to match, while "a"/"of" never bind.
const MIN_TOKEN_LENGTH = 3;

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

function ignore(reason) {
  return { route: "ignore", reason };
}

// The deterministic half: does this input match an existing channel's intake? A channel carries no
// explicit intake schema, so we read its declared shape — kind, name, objective — as the description of
// what it takes in, and overlap it against the input's kind and source. This is CODE, not a model call:
// class -> route is deterministic and free. Returns the best-scoring enabled channel, or null.
function bestChannelMatch(input, channels) {
  const inputTokens = new Set([...tokenize(input.kind), ...tokenize(input.source)]);
  if (!inputTokens.size) return null;

  let best = null;
  for (const channel of Array.isArray(channels) ? channels : []) {
    if (!channel || channel.enabled === false) continue;
    // An exact kind equality is the strongest, unambiguous signal of intake.
    const exact = String(channel.kind || "").trim().toLowerCase() === String(input.kind || "").trim().toLowerCase()
      && String(input.kind || "").trim() !== "";
    const channelTokens = new Set([
      ...tokenize(channel.kind),
      ...tokenize(channel.name),
      ...tokenize(channel.objective),
    ]);
    let overlap = 0;
    for (const token of inputTokens) if (channelTokens.has(token)) overlap += 1;
    const score = overlap + (exact ? 10 : 0);
    if (score <= 0) continue;
    // Highest score wins; ties keep the first channel (stable, declaration order).
    if (!best || score > best.score) best = { channel, score };
  }
  return best;
}

// The honest blank default for the fuzzy "does this warrant waking a standing brief?" judgment. It
// REFUSES by construction — a router with no real scorer wired never invents a wake, it ignores. The
// live caller injects a real scorer (a model-backed one) through options.wakeScorer; like the rest of
// the harness, the host owns the decision shape and rents the judgment.
function blankWakeScorer() {
  return { warrant: false };
}

// Route one captured input against the project's channels. Pure: same input + channels + scorer always
// yields the same decision, and the call has no side effects. The optional options.wakeScorer is the
// only seam where fuzzy judgment enters; omit it and the router is fully deterministic and never wakes.
export function routeInput(input, channels = [], options = {}) {
  // A signal with no kind or no source is noise, not a routable input (mirrors inputs-store's contract).
  // The router does not throw on noise — it decides "ignore" so the caller can drop it cleanly.
  const kind = String(input?.kind || "").trim();
  const source = String(input?.source || "").trim();
  if (!kind) return ignore("Input has no kind; nothing to route.");
  if (!source) return ignore("Input has no source; nothing to route.");

  // 1) Deterministic channel match — if an existing channel's intake fits, route the input there.
  const match = bestChannelMatch({ kind, source }, channels);
  if (match) {
    return {
      route: "flow",
      channelId: match.channel.id,
      reason: `Input ${kind} from ${source} matches channel "${match.channel.name || match.channel.id}" intake.`,
    };
  }

  // 2) No channel fits. Ask the injected scorer (blank default refuses) whether this warrants waking a
  //    standing brief. A wake the caller then runs STILL hits the founder gate — the router only names
  //    the brief, it never relaxes the wall.
  const scorer = typeof options.wakeScorer === "function" ? options.wakeScorer : blankWakeScorer;
  const verdict = scorer({ kind, source, payload: input?.payload ?? {} }, { channels }) || {};
  const brief = typeof verdict.brief === "string" ? verdict.brief.trim() : "";
  if (verdict.warrant === true && brief) {
    return {
      route: "ambient_wake",
      brief,
      reason: typeof verdict.reason === "string" && verdict.reason.trim()
        ? verdict.reason.trim()
        : `No channel fits ${kind} from ${source}; scorer warrants waking a standing brief.`,
    };
  }

  // 3) Ambiguous or unwarranted — the safe default is to set it aside, never to start a run.
  return ignore(
    verdict.warrant === true && !brief
      ? `Scorer warranted a wake but supplied no brief; ignoring rather than running blind.`
      : `No channel fits ${kind} from ${source} and no standing brief is warranted.`,
  );
}

// Exposed for callers/tests that want to assert a decision is one of the three legal shapes.
export function isRoutingDecision(decision) {
  return Boolean(decision) && ROUTES.has(decision.route);
}

export { ROUTES as ROUTING_ROUTES };
