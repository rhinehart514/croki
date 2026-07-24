// Real, current SDK models and their actual reasoning-effort tiers. The Brain forwards the model slug
// verbatim (--model / -m) and the effort verbatim, so an invented slug hard-fails the drive — every entry
// here is a shipping model as of July 2026. Reasoning tiers are per-MODEL, not per-runtime, because the
// ceiling genuinely differs by model: Claude reasons up through `max`; Codex GPT-5.6 Sol reaches `max`
// while Terra and Luna top out at `xhigh`. Codex's `ultra` tier is deliberately omitted — it is Sol-only,
// runs parallel subagents, and is not reachable through the `codex exec` path Croki drives, so offering
// it would be a control that lies about what the runtime can deliver.
//
// Every entry names an exact model. There is no "Default model" row: it read as a participant while
// actually deferring to whatever the CLI happened to be configured for, so the founder could not tell
// which agent answered — the same reason the composer refuses an automatic router.
export type WorkRuntime = "claude-code" | "codex";
export type WorkEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type WorkModelChoice = { runtime: string | null; model: string | null; effort: WorkEffort };

export type WorkModelOption = {
  id: string;
  label: string;
  sublabel: string;
  runtime: WorkRuntime;
  model: string;
  maxEffort: WorkEffort;
};

export const WORK_MODELS: WorkModelOption[] = [
  { id: "claude-code:claude-fable-5", label: "Claude Fable 5", sublabel: "Most capable", runtime: "claude-code", model: "claude-fable-5", maxEffort: "max" },
  { id: "claude-code:claude-opus-4-8", label: "Claude Opus 4.8", sublabel: "Deep coding", runtime: "claude-code", model: "claude-opus-4-8", maxEffort: "max" },
  { id: "claude-code:claude-sonnet-5", label: "Claude Sonnet 5", sublabel: "Balanced", runtime: "claude-code", model: "claude-sonnet-5", maxEffort: "max" },
  { id: "claude-code:claude-haiku-4-5", label: "Claude Haiku 4.5", sublabel: "Fast", runtime: "claude-code", model: "claude-haiku-4-5", maxEffort: "max" },
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

export const DEFAULT_MODEL_ID = "claude-code:claude-opus-4-8";
export const DEFAULT_EFFORT: WorkEffort = "high";

// Forward map for the adapter-only selection a build with "Default model" could store or emit — the id
// `"codex"` or a choice of `{ runtime: "codex", model: null }`. It resolves to that runtime's own model
// rather than to the global default, because the founder did choose a runtime and swapping Codex for
// Claude on upgrade would change who answers without the founder touching the control.
const LEGACY_ADAPTER_MODEL_ID: Record<string, string> = {
  "claude-code": DEFAULT_MODEL_ID,
  codex: "codex:gpt-5.6-sol",
};

export function modelById(id: string): WorkModelOption {
  const resolved = LEGACY_ADAPTER_MODEL_ID[id] ?? id;
  return WORK_MODELS.find((entry) => entry.id === resolved)
    ?? WORK_MODELS.find((entry) => entry.id === DEFAULT_MODEL_ID)
    ?? WORK_MODELS[0];
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

function modelIdForChoice(choice: Pick<WorkModelChoice, "runtime" | "model">) {
  const exact = WORK_MODELS.find((option) => option.runtime === choice.runtime && option.model === choice.model);
  if (exact) return exact.id;
  // A choice carrying no model came from a build that let the adapter pick. Keep the runtime the founder
  // chose and name its flagship, rather than resolving to the other vendor's default.
  return (choice.runtime ? LEGACY_ADAPTER_MODEL_ID[choice.runtime] : null) ?? DEFAULT_MODEL_ID;
}

export function readWorkModelChoice(ventureId: string, legacyThreadKey?: string): WorkModelChoice {
  const modelKey = `drover:work-model:${ventureId}`;
  const effortKey = `drover:work-effort:${ventureId}`;
  const legacyModelKey = legacyThreadKey ? `${modelKey}:${legacyThreadKey}` : null;
  const legacyEffortKey = legacyThreadKey ? `${effortKey}:${legacyThreadKey}` : null;
  try {
    const selected = localStorage.getItem(modelKey)
      ?? (legacyModelKey ? localStorage.getItem(legacyModelKey) : null)
      ?? DEFAULT_MODEL_ID;
    const option = modelById(selected);
    const storedEffort = localStorage.getItem(effortKey)
      ?? (legacyEffortKey ? localStorage.getItem(legacyEffortKey) : null);
    return {
      runtime: option.runtime,
      model: option.model,
      effort: clampEffort(isEffort(storedEffort) ? storedEffort : DEFAULT_EFFORT, option.id),
    };
  } catch {
    const option = modelById(DEFAULT_MODEL_ID);
    return { runtime: option.runtime, model: option.model, effort: DEFAULT_EFFORT };
  }
}

export function rememberWorkModelChoice(ventureId: string, threadKey: string, choice: WorkModelChoice) {
  const selected = modelIdForChoice(choice);
  try {
    // One venture-level presentation preference is shared by Work and Product / GTM. The
    // thread-scoped writes are retained only as a compatibility seam for older builds.
    localStorage.setItem(`drover:work-model:${ventureId}`, selected);
    localStorage.setItem(`drover:work-effort:${ventureId}`, choice.effort);
    localStorage.setItem(`drover:work-model:${ventureId}:${threadKey}`, selected);
    localStorage.setItem(`drover:work-effort:${ventureId}:${threadKey}`, choice.effort);
  } catch { /* presentation preference only */ }
}

export function modelIdFromWorkChoice(choice: Pick<WorkModelChoice, "runtime" | "model">) {
  return modelIdForChoice(choice);
}
