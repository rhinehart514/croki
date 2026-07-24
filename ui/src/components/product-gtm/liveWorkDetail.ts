import type { FirmWorkDelta } from "@/api";

// Reshape decision 28: the pure fold behind the focused-node live view. It keeps only whitelisted factual
// shape — a step label, a measured duration, a status — never chain-of-thought or raw model prose. The
// typed work-delta union carries none by construction (the brain owns the normalization), so this fold can
// trust every field. Kept in its own module so the component file stays a pure component export.

export type LiveDetailStep = {
  key: string;
  label: string;
  state: "running" | "done";
  kind: "step" | "source";
  status?: string;
  durationMs?: number | null;
};

export type LiveDetailState = { status: string | null; steps: LiveDetailStep[] };

export const emptyLiveDetail: LiveDetailState = { status: null, steps: [] };

const MAX_STEPS = 6;

export function applyWorkDelta(state: LiveDetailState, delta: FirmWorkDelta): LiveDetailState {
  switch (delta.type) {
    case "step-started": {
      const key = `step:${delta.stepId}`;
      const kept = state.steps.filter((step) => step.key !== key);
      const started: LiveDetailStep = { key, label: delta.label, state: "running", kind: "step" };
      return { ...state, steps: [...kept, started].slice(-MAX_STEPS) };
    }
    case "step-finished": {
      const key = `step:${delta.stepId}`;
      const finished: LiveDetailStep = { key, label: delta.label, state: "done", kind: "step", status: delta.status, durationMs: delta.durationMs };
      const exists = state.steps.some((step) => step.key === key);
      const steps = exists ? state.steps.map((step) => (step.key === key ? finished : step)) : [...state.steps, finished];
      return { ...state, steps: steps.slice(-MAX_STEPS) };
    }
    case "source-consulted": {
      const label = delta.ref ? `${delta.label} · ${delta.ref}` : delta.label;
      const entry: LiveDetailStep = { key: `source:${state.steps.length}:${delta.label}`, label, state: "done", kind: "source" };
      return { ...state, steps: [...state.steps, entry].slice(-MAX_STEPS) };
    }
    case "status-changed":
      return { ...state, status: delta.status };
    default:
      return state;
  }
}

export function formatLiveDuration(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
}
