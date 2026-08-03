export const FPS = 30;

export const scenes = {
  tension: { from: 0, duration: 156, label: "Agents" },
  convergence: { from: 150, duration: 156, label: "Intent" },
  context: { from: 300, duration: 186, label: "Thread" },
  execution: { from: 480, duration: 186, label: "Canvas" },
  close: { from: 660, duration: 150, label: "Croki" },
} as const;

export const DURATION_IN_FRAMES = 810;
