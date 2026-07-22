// Real, current SDK models and their actual reasoning-effort tiers. The Brain forwards the model slug
// verbatim (--model / -m) and the effort verbatim, so an invented slug hard-fails the drive — every entry
// here is a shipping model as of July 2026. Reasoning tiers are per-MODEL, not per-runtime, because the
// ceiling genuinely differs by model: Claude reasons up through `max`; Codex GPT-5.6 Sol reaches `max`
// while Terra and Luna top out at `xhigh`. Codex's `ultra` tier is deliberately omitted — it is Sol-only,
// runs parallel subagents, and is not reachable through the `codex exec` path Drover drives, so offering
// it would be a control that lies about what the runtime can deliver.
export type WorkRuntime = "claude-code" | "codex";
export type WorkEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type WorkModelOption = {
  id: string;
  label: string;
  sublabel: string;
  runtime: WorkRuntime;
  model: string | null;
  maxEffort: WorkEffort;
};

export const WORK_MODELS: WorkModelOption[] = [
  { id: "claude-code", label: "Claude Code", sublabel: "Default model", runtime: "claude-code", model: null, maxEffort: "max" },
  { id: "claude-code:claude-fable-5", label: "Claude Fable 5", sublabel: "Most capable", runtime: "claude-code", model: "claude-fable-5", maxEffort: "max" },
  { id: "claude-code:claude-opus-4-8", label: "Claude Opus 4.8", sublabel: "Deep coding", runtime: "claude-code", model: "claude-opus-4-8", maxEffort: "max" },
  { id: "claude-code:claude-sonnet-5", label: "Claude Sonnet 5", sublabel: "Balanced", runtime: "claude-code", model: "claude-sonnet-5", maxEffort: "max" },
  { id: "claude-code:claude-haiku-4-5", label: "Claude Haiku 4.5", sublabel: "Fast", runtime: "claude-code", model: "claude-haiku-4-5", maxEffort: "max" },
  { id: "codex", label: "Codex", sublabel: "Default model", runtime: "codex", model: null, maxEffort: "max" },
  { id: "codex:gpt-5.6-sol", label: "GPT-5.6 Sol", sublabel: "Flagship", runtime: "codex", model: "gpt-5.6-sol", maxEffort: "max" },
  { id: "codex:gpt-5.6-terra", label: "GPT-5.6 Terra", sublabel: "Balanced", runtime: "codex", model: "gpt-5.6-terra", maxEffort: "xhigh" },
  { id: "codex:gpt-5.6-luna", label: "GPT-5.6 Luna", sublabel: "Efficient", runtime: "codex", model: "gpt-5.6-luna", maxEffort: "xhigh" },
];

export const RUNTIME_LABEL: Record<WorkRuntime, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
};

export const EFFORT_ORDER: WorkEffort[] = ["low", "medium", "high", "xhigh", "max"];

export const EFFORT_META: Record<WorkEffort, { label: string; hint: string; bars: number }> = {
  low: { label: "Quick", hint: "Fast, minimal deliberation", bars: 1 },
  medium: { label: "Balanced", hint: "Everyday implementation", bars: 2 },
  high: { label: "Deep", hint: "Thorough reasoning", bars: 3 },
  xhigh: { label: "Extra deep", hint: "Extended thinking", bars: 4 },
  max: { label: "Maximum", hint: "Longest reasoning", bars: 5 },
};

export const DEFAULT_MODEL_ID = "claude-code";
export const DEFAULT_EFFORT: WorkEffort = "high";

export function modelById(id: string): WorkModelOption {
  return WORK_MODELS.find((entry) => entry.id === id) ?? WORK_MODELS[0];
}

export function isEffort(value: unknown): value is WorkEffort {
  return typeof value === "string" && (EFFORT_ORDER as string[]).includes(value);
}

// The reasoning tiers a specific model actually exposes, lowest to its own ceiling.
export function effortsForModel(id: string): WorkEffort[] {
  const ceiling = modelById(id).maxEffort;
  return EFFORT_ORDER.slice(0, EFFORT_ORDER.indexOf(ceiling) + 1);
}

// Keep a chosen effort valid when the model changes: a Claude/Sol `max` collapses to Terra/Luna's top
// tier (`xhigh`) rather than sending a level that model does not support.
export function clampEffort(effort: WorkEffort, id: string): WorkEffort {
  const allowed = effortsForModel(id);
  return allowed.includes(effort) ? effort : allowed[allowed.length - 1];
}
