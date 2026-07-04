// One status vocabulary for the whole UI. Channel status, operator-session status, and run-derived
// status were each humanized independently (`status.replaceAll("_"," ")` copy-pasted in six places,
// two separate `statusLabel` functions), so "waiting at a gate" could read as "waiting_for_gate",
// "paused at gate", or "pending" depending on the surface. This module is the single humanizer, so
// the same state reads the same everywhere.

function humanize(key: string): string {
  return key.replaceAll("_", " ").trim() || "idle";
}

export function statusLabel(raw?: string | null): string {
  return humanize(String(raw ?? "").toLowerCase());
}
