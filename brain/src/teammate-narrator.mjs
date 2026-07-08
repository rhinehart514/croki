// The live teammate-voice narrator: turns one wall-safe voice brief into a single short, in-character
// first-person beat the teammate speaks while it works a step. It is a pure, injectable seam that mirrors
// createGateTranslator in agent-bridge.mjs exactly — a factory returning an async fn, calling runQuery with
// maxTurns:1, and degrading to null on any error so the caller falls back to the deterministic template.
//
// WALL-SAFE BY CONSTRUCTION: the ONLY teammate-derived text that ever reaches the model is
// renderVoiceForNarration(brief) — an allowlist assembler that physically cannot emit a systemPrompt, a
// scratch learning, or any soul-entry internal (id/why/patternKey/source). The extra situation clause
// carries ONLY cosmetic surface data already shown in the machinery trace: the node's label (capped and
// stripped) and the item count. No path exists from a teammate's raw prompt to this model input.
//
// The model's one line is trusted ONLY as a display string — it becomes the teammate_said event title,
// never parsed, never drives control flow, never gates anything. A hostile or garbled reply can at worst
// show a slightly-off sentence; it cannot leak internals (nothing internal was in the prompt) and cannot
// affect the run. runClaudeQuery strips ANTHROPIC_API_KEY (subscription) and uses read-only default tools
// with permissionMode dontAsk, so a beat call sends, publishes, and reads nothing.
import { runClaudeQuery } from "./agent-bridge.mjs";
import { renderVoiceForNarration } from "./teammate-soul.mjs";

const MAX_LINE = 140; // a beat is one short sentence; cap so a runaway reply can't flood the transcript
const MAX_LABEL = 60;

// Cosmetic surface data only: the node's own label, capped and stripped of newlines. NEVER a soul field.
function safeLabel(label) {
  const s = String(label ?? "").replace(/[\r\n]+/g, " ").trim();
  if (!s) return "this step";
  return s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL).trim()}…` : s;
}

// Reduce the model's reply to a single clean display line: first non-empty line, quotes stripped, capped.
function cleanLine(text) {
  if (typeof text !== "string") return null;
  const first = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!first) return null;
  let line = first.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  if (!line) return null;
  if (line.length > MAX_LINE) line = `${line.slice(0, MAX_LINE).trim()}…`;
  return line;
}

// One allowlist-only situation clause. Carries ONLY the (cosmetic) label and item count — never a
// ref-resolved prompt, config, or any soul field beyond what is already inside `brief`.
function situationClause(phase, node = {}, count = 0) {
  const label = safeLabel(node.label);
  if (phase === "start") {
    return `Right now you are beginning this step: "${label}". Narrate starting it.`;
  }
  const n = Number.isFinite(count) ? count : 0;
  return `You just finished this step: "${label}" and produced ${n} item${n === 1 ? "" : "s"} for the founder to review. Narrate finishing it — never claim to have sent, published, or finished anything for real.`;
}

// Factory, mirroring createGateTranslator. Returns narrateBeat({brief, phase, node, count}) => string|null.
// A cache keyed by teammate+phase+node means an identical beat is written once and reused, never re-called.
export function createTeammateNarrator({
  cwd = process.cwd(),
  // Fast, non-Haiku tier (Haiku is banned by the project + global AGENTS.md). A one-line beat wants speed;
  // Sonnet is the fast/balanced pick. Injectable, and the narrator degrades to a template on any error.
  model = "claude-sonnet-4-6",
  runQuery = runClaudeQuery,
  cache = new Map(),
} = {}) {
  return async function narrateBeat({ brief, phase, node = {}, count = 0 } = {}) {
    if (!brief || !brief.ref || (phase !== "start" && phase !== "done")) return null;
    const key = `${brief.ref}|${phase}|${node.nodeId ?? ""}`;
    if (cache.has(key)) return cache.get(key);

    const base = renderVoiceForNarration(brief); // the ONLY teammate-derived text that reaches the model
    const prompt = `${base}\n\n${situationClause(phase, node, count)}`;

    let out = null;
    try {
      const { text, error } = await runQuery({ prompt, cwd, model, maxTurns: 1 });
      if (!error) out = cleanLine(text);
    } catch {
      out = null; // any failure degrades to the deterministic template at the call site
    }
    if (!out) return null; // do NOT cache a miss — a transient error shouldn't pin the template forever
    cache.set(key, out);
    return out;
  };
}
