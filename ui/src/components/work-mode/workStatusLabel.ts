const TERMINAL_ALIASES: Record<string, string> = {
  stopped: "cancelled",
  aborted: "cancelled",
  error: "failed",
  success: "completed",
  paused: "waiting for founder decision",
  "budget-exhausted": "budget reached — waiting for founder",
  interrupted: "interrupted — ready to resume",
  failed: "failed — recovery available",
};

export function workStatusLabel(value: string) {
  return (TERMINAL_ALIASES[value] ?? value).replaceAll("-", " ");
}
