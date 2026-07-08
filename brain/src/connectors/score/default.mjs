// Demoted to a pass-through (Wave 6). This used to be "Keyword score" — a deterministic keyword-match
// ICP scorer that dropped prospects whose name/summary didn't contain enough config keywords. That is
// exactly the keyword-judgment leash the harness removed: fit is a judgment call, so it belongs to an
// AGENT step (a qualifier reads the real ICP and reasons), not to a substring count that silently drops
// real prospects a keyword list happened to miss. The default filter connector now passes items through
// untouched and never drops anyone — the founder gate and any composed agent-qualifier own the judgment.
export const meta = {
  id: "default",
  name: "Pass-through filter",
  type: "filter",
  description: "Passes items through untouched. Fit judgment is an agent step, not a keyword count.",
  envKey: null,
};

export async function run(_stage, upstream) {
  const items = Array.isArray(upstream) ? upstream : [];
  return { ok: true, items, meta: { total: items.length, passed: items.length, passthrough: true } };
}
