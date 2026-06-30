// One status vocabulary for the whole UI. Channel status, operator-session status, and run-derived
// status were each humanized and colored independently (`status.replaceAll("_"," ")` copy-pasted in
// six places, two separate `statusLabel` functions, one ad-hoc `badgeClass`), so "waiting at a gate"
// could read as "waiting_for_gate", "paused at gate", or "pending" depending on the surface. This
// module is the single source: a canonical tone per state and one humanizer, so the same state reads
// and colors the same everywhere.

export type StatusTone = "idle" | "active" | "waiting" | "good" | "bad";

// Canonical state keys (channel + operator session) → tone. Run-derived phrases go through
// toneForPhrase below instead, since they are composed sentences, not single keys.
const TONE_BY_KEY: Record<string, StatusTone> = {
  draft: "idle",
  ready: "idle",
  idle: "idle",
  retired: "idle",
  running: "active",
  learning: "active",
  waiting_for_gate: "waiting",
  waiting_for_input: "waiting",
  paused: "waiting",
  interrupted: "waiting",
  complete: "good",
  completed: "good",
  blocked: "bad",
  failed: "bad",
  cancelled: "bad",
};

// Tone → the CSS class the pills already use (`.program-status-pill.good/.warn/.bad/.idle`). Active
// (running / learning) reads as positive progress, so it shares the "good" register.
const TONE_CLASS: Record<StatusTone, string> = {
  idle: "idle",
  active: "good",
  waiting: "warn",
  good: "good",
  bad: "bad",
};

function humanize(key: string): string {
  return key.replaceAll("_", " ").trim() || "idle";
}

export function statusLabel(raw?: string | null): string {
  return humanize(String(raw ?? "").toLowerCase());
}

export function statusTone(raw?: string | null): StatusTone {
  return TONE_BY_KEY[String(raw ?? "").toLowerCase()] ?? "idle";
}

export function statusToneClass(raw?: string | null): string {
  return TONE_CLASS[statusTone(raw)];
}

// For composed run phrases ("paused at gate", "blind attribution", "completed") that are not
// single canonical keys — substring match to a tone. This was an ad-hoc badgeClass, promoted to
// the shared module so every surface classifies a phrase the same way.
export function toneForPhrase(phrase: string): string {
  const normalized = phrase.toLowerCase();
  if (normalized.includes("blocked") || normalized.includes("blind") || normalized.includes("failed") || normalized.includes("missing")) return "bad";
  if (normalized.includes("gate") || normalized.includes("waiting") || normalized.includes("paused") || normalized.includes("pending")) return "warn";
  if (normalized.includes("complete") || normalized.includes("ready") || normalized.includes("created") || normalized.includes("defined")) return "good";
  return "idle";
}
