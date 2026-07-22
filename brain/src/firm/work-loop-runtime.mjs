// The real reasoning tiers the SDKs expose. Both the Claude Agent SDK and Codex GPT-5.6 Sol reason up
// through `max` (Codex Terra/Luna top out at `xhigh`, a ceiling the composer's model catalog enforces
// before a drive is requested). Normalize accepts the full union and forwards it verbatim so a
// founder-selected tier is never silently dropped.
const REASONING_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

export function normalizeEffort(value) {
  const level = typeof value === "string" ? value.trim().toLowerCase() : "";
  return REASONING_EFFORTS.has(level) ? level : null;
}

export function buildRuntimeReceipt(selection, model, configurationRevision) {
  return {
    id: selection.adapter.id,
    label: selection.adapter.label,
    auth: selection.auth ?? null,
    model,
    configurationRevision,
  };
}
