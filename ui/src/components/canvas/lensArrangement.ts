// lensArrangement.ts — the public entry + vocabulary for the reversible operating lens.
//
// Four deterministic arrangements (Understand / Design / Execute / Learn), each a pure function from the
// SAME scene node array to a `Record<id, {x,y}>` that carries a position for EVERY node id. The id-set is
// the lens's object identity (DESIGN.md rule 15: switching lenses never duplicates objects) — an
// arrangement REORDERS these ids, it never adds or drops one. The unit test pins this: output key-set ===
// input node id-set, per lens. The four packers live in lensPackers.ts over shared lensGeometry.ts
// primitives; this file is the dispatcher + the lens words the control/hook/tests share.
//
// The lens applies these positions ONLY through the stage's setNodes — never putPlacement, never into
// foldPlacement's stored arg (Law 6, the marquee risk). Restoring the founder's own layout is
// foldPlacement's job.

import type { Node } from "@xyflow/react";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import type { SeededPositions } from "./canvasSeedLayout";
import type { Positioned, TerritoryMap } from "./lensGeometry";
import { arrangeUnderstand, arrangeDesign, arrangeExecute, arrangeLearn } from "./lensPackers";

export type LensId = "understand" | "design" | "execute" | "learn";

// The four lens words, in cycle order. `L` steps forward through null → this list → null; `Shift+L`
// steps back. Exported so the control, the hook, and the cycle test read ONE order.
export const LENS_SEQUENCE: LensId[] = ["understand", "design", "execute", "learn"];

export const LENS_LABEL: Record<LensId, string> = {
  understand: "Understand",
  design: "Design",
  execute: "Execute",
  learn: "Learn",
};

// arrangeLens returns a position for EVERY node id (id-set identity preserved). The caller passes the
// territory map (resolveTerritories over the same nodes), the lens (for pressure), and the projection (for
// learn chains). A defensive final pass guarantees the invariant even if a packer missed a node.
export function arrangeLens(
  lensId: LensId,
  nodes: Node[],
  context: { territory: TerritoryMap; projection: FirmArchitectureProjection | null; lens: FirmLens },
): SeededPositions {
  let positions: Record<string, Positioned>;
  switch (lensId) {
    case "understand":
      positions = arrangeUnderstand(nodes);
      break;
    case "design":
      positions = arrangeDesign(nodes, context.territory);
      break;
    case "execute":
      positions = arrangeExecute(nodes, context.territory, context.lens);
      break;
    case "learn":
      positions = arrangeLearn(nodes, context.territory, context.projection);
      break;
    default:
      positions = {};
  }
  // Invariant guard: every incoming id gets a position, and no extra ids leak in. A node a packer did not
  // place (an unexpected kind) falls to its own scene position so the id-set is never broken.
  const result: SeededPositions = {};
  for (const node of nodes) {
    result[node.id] = positions[node.id] ?? { x: node.position?.x ?? 0, y: node.position?.y ?? 0 };
  }
  return result;
}
