// Reading the founder's words at the gate into a decision. The gate is a consequence boundary, so this
// mapping is CODE, never a model: it must be legible, deterministic, and testable. Negation/hold is
// matched before release so "don't send" and "not yet" can never read as a send. Pure — no React, no I/O.
export type GateIntent = "authorize" | "hold" | "release" | "unknown";

export function interpretGateWords(text: string): GateIntent {
  const t = text.trim().toLowerCase();
  if (!t) return "unknown";
  if (/\b(authori[sz]e|arm|approve the deploy|approve deploy)\b/.test(t)) return "authorize";
  if (/\b(hold|wait|not yet|later|stop|cancel|no|don'?t|do not|never ?mind)\b/.test(t)) return "hold";
  if (/\b(send|release|ship|go|do it|make it real|publish|deliver|yes|approve|green.?light)\b/.test(t)) return "release";
  return "unknown";
}
