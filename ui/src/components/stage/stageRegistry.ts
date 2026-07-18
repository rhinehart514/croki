// The OPEN StageWorkspace contract and its registry — a second seed of the SAME adapt-by-available-truth
// mechanism that ships at the Now route (representations.ts), hosted at the canvas frame instead. id and
// label are FREE STRINGS, never a closed union/enum, so adding a workspace is appending one object to the
// SEED array and nothing about the host (StageWorkspace / VentureCanvasStage / VentureWorkspace) changes.
// available(ctx) gates a workspace on REAL durable truth already resolved by projectStageContext: a
// workspace with no backing truth is never offered — the anti-progress-theater floor inherited verbatim
// from the Now registry. render(ctx, actions) returns the pane body; the host mounts it without knowing
// what kind it is. A workspace holds no durable state and is recomputed from ctx, so switching or dismissing
// it can never touch bets/staged/outcomes.
//
// The CENTER adapts because the body is chosen by which truth exists — a staged product change resolves to
// the diff/tests/preview body, >1 open sibling to the parallel-attempts body, a waiting outward act to the
// in-context consequence gate, a plain direction to approaches/active-work/returned-results — never the same
// card for every kind. The final `overview` gates true unconditionally, so getStageWorkspace is never blank.
import { createElement, type ReactNode } from "react";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import { ExactChangeBlock } from "@/components/now/WorkDetail";
import { ApproachComparison } from "@/components/now/ApproachComparison";
import type { RepresentationActions } from "@/components/now/representations";
import { DecisionGate } from "@/components/now/DecisionGate";
import type { StageContext } from "./projectStageContext";
import { DirectionBody } from "./DirectionBody";
import { ConsequenceBody } from "./ConsequenceBody";
import { OverviewBody } from "./OverviewBody";

// Actions a stage workspace may express — RepresentationActions plus the descent/return the canvas owns.
export type StageActions = RepresentationActions & {
  onDescend: (selection: CanvasSelection) => void;
  onReturn: () => void;
  ventureId: string;
  onChanged: () => void;
  readOnlyReason: string | null;
};

export type StageWorkspace = {
  id: string;
  label: string;
  available(ctx: StageContext): boolean;
  render(ctx: StageContext, actions: StageActions): ReactNode;
};

// How many of a direction's member bets are still open (an ended attempt is history, not an active approach).
function openApproaches(ctx: StageContext): number {
  return ctx.ctx?.memberBets.filter((bet) => !bet.endedAt).length ?? 0;
}

// The seed. Order is precedence: the first available() body is the default on descent; the rest are offered
// by the contextual View control. Kinds stay open — plain objects, no switch anywhere in the host.
const SEED: StageWorkspace[] = [
  {
    // A waiting outward act wins the default (the "wall item wins" descent-routing precedent): the exact
    // effect and the in-context founder gate sit IN the descended stage, never a detached inbox.
    id: "consequence",
    label: "The exact effect",
    available: (ctx) => ctx.waiting.length > 0,
    render: (ctx, actions) => createElement(ConsequenceBody, {
      ctx,
      ventureId: actions.ventureId,
      onChanged: actions.onChanged,
      readOnlyReason: actions.readOnlyReason,
    }),
  },
  {
    // A staged product change resolves to the Cursor-grade product workspace: FilesChanged + DiffView +
    // tests + preview from data already on disk — never summarized.
    id: "product-artifact",
    label: "Product change",
    available: (ctx) => Boolean(ctx.focusedExactChange) || (ctx.ctx?.exactChanges.length ?? 0) > 0,
    render: (ctx) => createElement(ExactChangeBlock, {
      changes: ctx.focusedExactChange ? [ctx.focusedExactChange] : ctx.ctx?.exactChanges ?? [],
    }),
  },
  {
    // More than one open sibling → parallel attempts side by side, click-to-narrow via onScopePick.
    id: "comparison",
    label: "Compare approaches",
    available: (ctx) => openApproaches(ctx) > 1,
    render: (ctx, actions) => (ctx.ctx
      ? createElement(ApproachComparison, { ctx: ctx.ctx, onScopePick: actions.onScopePick })
      : null),
  },
  {
    // The selection resolves to a Direction with no more specific default: approaches / active work /
    // returned results — the venture→direction operating context.
    id: "direction",
    label: "Direction",
    available: (ctx) => Boolean(ctx.direction && ctx.ctx),
    render: (ctx, actions) => (ctx.ctx
      ? createElement(DirectionBody, { ctx: ctx.ctx, onDescend: actions.onDescend, onStop: actions.onStop })
      : null),
  },
  {
    // Guaranteed last, gates unconditionally: the ResultBody when a direction ctx exists, else a read-only
    // selection summary for architecture/theory/capability targets — never a blank pane.
    id: "overview",
    label: "Overview",
    available: () => true,
    render: (ctx) => createElement(OverviewBody, { ctx }),
  },
  // Registered STUBS: their backing brain collections do not exist yet, so available() reads truth that is
  // always empty today and they gate false — no dead chips, no progress theater. When the collections land,
  // available() starts returning true and the body renders with ZERO host changes.
  {
    id: "campaign",
    label: "Outreach",
    available: (ctx) => Boolean((ctx.ctx as { campaign?: unknown } | null)?.campaign),
    render: () => null,
  },
  {
    id: "experiment",
    label: "Experiment",
    available: (ctx) => Boolean((ctx.ctx as { variants?: unknown } | null)?.variants),
    render: () => null,
  },
  {
    id: "research",
    label: "Research",
    available: (ctx) => Boolean((ctx.ctx as { sources?: unknown } | null)?.sources),
    render: () => null,
  },
];

/** Only the workspaces whose durable truth actually exists for THIS selection, in seed order. */
export function buildStageWorkspaces(ctx: StageContext): StageWorkspace[] {
  return SEED.filter((workspace) => workspace.available(ctx));
}

/** Null-safe: the requested id if present, else the first (which is always at least `overview`). */
export function getStageWorkspace(list: StageWorkspace[], id: string | null): StageWorkspace {
  return list.find((workspace) => workspace.id === id) ?? list[0];
}

// Re-export a decision gate so tests and callers can reach it through the registry surface if needed.
export { DecisionGate };
