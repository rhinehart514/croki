// The OPEN representation contract and its registry. A Representation is a plain object — id and label are
// FREE STRINGS, never a closed union/enum of kinds — so adding a representation is appending one object to
// the seed array below, and nothing about the host changes. available(ctx) gates a representation on REAL
// durable truth already derived in projectDirection: a representation with no backing truth is never
// offered, which is the anti-progress-theater floor. render(ctx) returns the pane body; the host mounts it
// beside the persistent composer without knowing what kind it is. A representation holds no durable state
// and is recomputed from ctx, so switching or dismissing it can never touch bets/staged/outcomes.
//
// Deliberately RESTRAINED, not maximal. The registry is open, but the product rule is subtraction: a
// direction shows ONE default body (its result/consequence) and offers alternates only when they add
// something the founder cannot already see. Seeded: result (default), exact-change, approach-comparison.
// "Who's working" is NOT a peer view — live agents surface as the working-now pulse plus the "How this was
// done" activity disclosure, never machinery as a top-level tab. GTM shapes (pipeline/funnel/audience) are
// not seeded: no backend collection backs them yet, so offering them would be nodes with no throughput.
import { createElement, type ReactNode } from "react";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import type { FirmBet } from "@/types";
import type { DirectionRenderContext } from "./projectDirection";
import { ResultBody, ExactChangeBlock } from "./WorkDetail";
import { ApproachComparison } from "./ApproachComparison";

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

// An approach is "genuinely active" only while it is still open — ended/killed attempts are history and do
// not, by themselves, earn a comparison view.
function activeApproaches(bets: FirmBet[]): number {
  return bets.filter((bet) => !bet.endedAt).length;
}

// The seed list. Order here is the chip order; SEED[0] is the default body. Kinds stay open: plain objects.
const SEED: Representation[] = [
  {
    id: "result",
    label: "Result",
    available: () => true,
    render: (ctx) => createElement(ResultBody, { ctx }),
  },
  {
    id: "exact-change",
    label: "Exact change",
    available: (ctx) => ctx.exactChanges.length > 0,
    render: (ctx) => createElement(ExactChangeBlock, { changes: ctx.exactChanges }),
  },
  {
    id: "approach-comparison",
    label: "Compare approaches",
    available: (ctx) => activeApproaches(ctx.memberBets) > 1,
    render: (ctx, actions) => createElement(ApproachComparison, { ctx, onScopePick: actions.onScopePick }),
  },
];

/** Only the representations whose durable truth actually exists for THIS direction, in seed order. */
export function buildRepresentations(ctx: DirectionRenderContext): Representation[] {
  return SEED.filter((representation) => representation.available(ctx));
}

/** Null-safe selection: the requested id if present, else the first (result) — never undefined. */
export function getRepresentation(list: Representation[], id: string | null): Representation {
  return list.find((representation) => representation.id === id) ?? list[0];
}
