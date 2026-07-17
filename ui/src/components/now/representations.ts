// The OPEN representation contract and its registry. A Representation is a plain object — id and label are
// FREE STRINGS, never a closed union/enum of kinds — so adding a representation is appending one object to
// the seed array below, and nothing about the host changes. available(ctx) gates a representation on REAL
// durable truth already derived in projectDirection: a representation with no backing truth is never
// offered, which is the anti-progress-theater floor. render(ctx) returns the pane body; the host mounts it
// beside the persistent composer without knowing what kind it is. A representation holds no durable state
// and is recomputed from ctx, so switching or dismissing it can never touch bets/staged/outcomes.
//
// Seeded: overview (always), exact-change, working-result, approach-comparison, agent-collaboration. The
// GTM shapes the spec names (pipeline/funnel/audience/journey) are deliberately NOT seeded — no backend
// collection backs them yet, so offering them would be nodes with no throughput. When that truth exists,
// each is one more object here.
import { createElement, type ReactNode } from "react";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import type { DirectionRenderContext } from "./projectDirection";
import { OverviewBody, WorkingResultBlock, ExactChangeBlock } from "./WorkDetail";
import { ApproachComparison } from "./ApproachComparison";
import { CollaborationView } from "./CollaborationView";

// Callbacks a representation may use to express founder intent — never to mutate durable truth.
export type RepresentationActions = {
  onScopePick?: (selection: CanvasSelection) => void;
  onStop?: (driveId: string) => void;
};

export type Representation = {
  id: string;
  label: string;
  available(ctx: DirectionRenderContext): boolean;
  render(ctx: DirectionRenderContext, actions: RepresentationActions): ReactNode;
};

// The seed list. Order here is the chip order. Kinds stay open: this is a plain array of objects.
const SEED: Representation[] = [
  {
    id: "overview",
    label: "Overview",
    available: () => true,
    render: (ctx) => createElement(OverviewBody, { ctx }),
  },
  {
    id: "exact-change",
    label: "Exact change",
    available: (ctx) => ctx.exactChanges.length > 0,
    render: (ctx) => createElement(ExactChangeBlock, { changes: ctx.exactChanges }),
  },
  {
    id: "working-result",
    label: "Working result",
    available: (ctx) => ctx.previews.length > 0,
    render: (ctx) => createElement(WorkingResultBlock, { previews: ctx.previews }),
  },
  {
    id: "approach-comparison",
    label: "Compare approaches",
    available: (ctx) => ctx.memberBets.length > 1,
    render: (ctx, actions) => createElement(ApproachComparison, { ctx, onScopePick: actions.onScopePick }),
  },
  {
    id: "agent-collaboration",
    label: "Who's working",
    available: (ctx) => ctx.drives.length > 0 || ctx.memberBets.length > 0,
    render: (ctx, actions) => createElement(CollaborationView, { ctx, onScopePick: actions.onScopePick, onStop: actions.onStop }),
  },
];

/** Only the representations whose durable truth actually exists for THIS direction, in seed order. */
export function buildRepresentations(ctx: DirectionRenderContext): Representation[] {
  return SEED.filter((representation) => representation.available(ctx));
}

/** Null-safe selection: the requested id if present, else the first (overview) — never undefined. */
export function getRepresentation(list: Representation[], id: string | null): Representation {
  return list.find((representation) => representation.id === id) ?? list[0];
}
