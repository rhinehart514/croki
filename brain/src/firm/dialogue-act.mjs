// dialogue-act.mjs — review is dialogue, not buttons (build contract §4A.2). Classify a founder's
// conversation reply, IN THE CONTEXT of the effort it replies to, into exactly one intent:
//   steer          — adjust the running/next work (folds into pendingSteer; the §2.7 seam)
//   approve        — release the act waiting at the gate (through the UNCHANGED wall path)
//   approve-standing — approve AND bless this act type going forward (mints a trust grant; §4A.3)
//   close          — end the effort (founder-only; the classifier only proposes, the message is authority)
//   answer         — answer a contextual question without moving the founder away from the owning surface
//   new-direction  — a fresh direction, routed back through direction-routing (§4A.1)
//
// This is the ONE honestly-fuzzy call in review. It stays small (message + effort summary → one label +
// optional extracted steer text) and is DETERMINISTIC-FIRST: clear lexical intents ("close it", "you can
// send these yourself") resolve without a model. The model (injectable deps.classify, defaulted to null
// so tests never hit the network) is only consulted when the deterministic pass is unsure. AMBIGUOUS →
// steer: the safe default, because steer only adds context and closes nothing (invariant §5.9 — only the
// founder ends work; a model classification never ends an effort on its own, and here "close" is merely
// the proposed routing of the founder's OWN message, which is the authority).

const ACTS = new Set(["steer", "answer", "approve", "approve-standing", "close", "new-direction"]);

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// Deterministic lexical signals — cheap, testable, free. Ordered by specificity: a standing-approval
// phrase ("you can send these yourself now") is more specific than a bare approval ("send it"), and a
// close phrase ("we've learned enough, stop this") is unmistakable. Only a confident lexical match wins
// here; everything else defers to the model, then to steer.
const STANDING_APPROVAL = /\b(you can (send|do|handle|ship|post|run|reach out with) (these|this|those|them|it)( yourself)?( from now on| going forward| in future)?|from now on you can|no need to (ask|check with) me|don'?t (ask|wait for) me (again|next time|for these)|approve these automatically|stop (asking|checking) me)\b/i;
const APPROVAL = /\b(send it|ship it|approve|go ahead|release it|looks good,? send|yes,? send|do it|that'?s good,? send)\b/i;
const CLOSE = /\b(close (it|this|that)|end (this|it|the effort)|stop (this|it)|we'?re done( here)?|that'?s done|drop (this|it)|kill (this|it)|abandon (this|it)|shut (this|it) down|we'?ve learned enough)\b/i;
const NEW_DIRECTION = /\b(instead,? (try|do|go|let'?s)|forget (this|that|it),?|new (idea|direction|angle|plan)|start (over|fresh)|scrap (this|that|it)|change course|pivot to)\b/i;
const QUESTION = /^\s*(what|why|who|where|when|which|explain|describe|tell me|is|are|does|do)\b/i;

// A best-effort deterministic pass. Returns an act label, or null when nothing is confident enough to
// override the model / the steer default. STANDING_APPROVAL is checked before APPROVAL (superset-first),
// and CLOSE before NEW_DIRECTION only matters when both could match — they rarely co-occur.
function lexicalAct(message) {
  const text = String(message ?? "");
  if (STANDING_APPROVAL.test(text)) return "approve-standing";
  if (CLOSE.test(text)) return "close";
  if (NEW_DIRECTION.test(text)) return "new-direction";
  if (APPROVAL.test(text)) return "approve";
  if (QUESTION.test(text)) return "answer";
  return null;
}

// classifyDialogueAct — { act, steerText, usedModel }. `effortSummary` is the small context the reply is
// interpreted against (the effort's intent + whether an act is waiting at its gate); it never carries the
// whole effort. deps.classify(message, effortSummary) → { act, steerText } | null is the injectable model
// hook, only consulted when the lexical pass is unsure. Any unusable model answer falls through to steer.
export async function classifyDialogueAct({ message, effortSummary = null } = {}, deps = {}) {
  const text = trimOrNull(message);
  if (!text) return { act: "steer", steerText: null, usedModel: false };

  const lexical = lexicalAct(text);
  if (lexical) {
    // For a lexical steer we'd have returned null; a lexical hit is one of the confident acts. Steer
    // text is only meaningful for a steer, which the lexical pass never returns, so none is extracted.
    return { act: lexical, steerText: null, usedModel: false };
  }

  const classify = typeof deps.classify === "function" ? deps.classify : async () => null;
  let decision = null;
  try {
    decision = await classify(text, effortSummary);
  } catch {
    decision = null;
  }
  const act = trimOrNull(decision?.act);
  if (act && ACTS.has(act)) {
    return {
      act,
      steerText: act === "steer" ? (trimOrNull(decision?.steerText) ?? text) : trimOrNull(decision?.steerText),
      usedModel: true,
    };
  }

  // AMBIGUOUS → steer (safe: becomes context, closes nothing). The whole founder message is the steer.
  return { act: "steer", steerText: text, usedModel: false };
}
