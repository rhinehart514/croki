export type RecoveryLayer =
  | "engine"
  | "provider"
  | "canvas"
  | "auth"
  | "transport"
  | "thread-sync"
  | "repository"
  | "checkpoint"
  | "verification"
  | "terminal"
  | "preview"
  | "git"
  | "outward-action";

type RecoveryPresentation = {
  layer: RecoveryLayer;
  title: string;
  retained: string;
  action: string;
};

const COPY: Record<RecoveryLayer, Omit<RecoveryPresentation, "layer">> = {
  engine: {
    title: "Work engine reconnecting",
    retained: "The transcript, draft, and last Review remain visible.",
    action: "Retry engine",
  },
  provider: {
    title: "Provider turn interrupted",
    retained: "The Thread and isolated workspace were retained.",
    action: "Resume this Run",
  },
  canvas: {
    title: "Canvas return needs another pass",
    retained: "Your Thread and last Canvas were kept.",
    action: "Try this direction again",
  },
  auth: {
    title: "Provider sign-in needs attention",
    retained: "The Thread, draft, and prepared work were retained.",
    action: "Retry after sign-in",
  },
  transport: {
    title: "Connection interrupted",
    retained: "The last current transcript and Review remain visible.",
    action: "Retry connection",
  },
  "thread-sync": {
    title: "Thread sync interrupted",
    retained: "The last coherent Thread remains unchanged.",
    action: "Retry Thread sync",
  },
  repository: {
    title: "Repository read interrupted",
    retained: "The Thread and last exact repository material were retained.",
    action: "Retry repository read",
  },
  checkpoint: {
    title: "Checkpoint capture interrupted",
    retained: "Completed work and earlier checkpoint receipts were retained.",
    action: "Retry checkpoint",
  },
  verification: {
    title: "Verification failed",
    retained: "The exact diff and completed command receipts were retained.",
    action: "Retry verification",
  },
  terminal: {
    title: "Terminal session interrupted",
    retained: "The terminal layout, bounded output, and last exit remain visible.",
    action: "Restart terminal",
  },
  preview: {
    title: "Preview server unavailable",
    retained: "The last preview, URL, viewport, and Thread remain visible.",
    action: "Retry preview",
  },
  git: {
    title: "Source-control step failed",
    retained: "Earlier successful receipts and the exact ship plan were retained.",
    action: "Retry failed phase",
  },
  "outward-action": {
    title: "Outward action needs verification",
    retained: "Prepared material and founder authority remain unchanged.",
    action: "Verify destination",
  },
};

export function recoveryPresentation(layer: RecoveryLayer): RecoveryPresentation {
  return { layer, ...COPY[layer] };
}
