const TERMINAL_ALIASES: Record<string, string> = {
  stopped: "cancelled",
  aborted: "cancelled",
  error: "failed",
  success: "completed",
};

export function workStatusLabel(value: string) {
  return (TERMINAL_ALIASES[value] ?? value).replaceAll("-", " ");
}
