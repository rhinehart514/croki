import * as Effect from "effect/Effect";

import ProjectionThreadForkLineage from "./035_ProjectionThreadForkLineage.ts";
import ProjectionThreadTitleRegeneration from "./035_ProjectionThreadTitleRegeneration.ts";
import ProjectionProjectPerception from "./036_ProjectionProjectPerception.ts";
import ProjectionThreadsPinned from "./036_ProjectionThreadsPinned.ts";
import ProjectionThreadParentLineage from "./037_ProjectionThreadParentLineage.ts";
import ProjectionTurnsKeysetIndex from "./037_ProjectionTurnsKeysetIndex.ts";
import ProjectionThreadsPinOrderKey from "./038_ProjectionThreadsPinOrderKey.ts";
import ProjectionThreadWorkerView from "./040_ProjectionThreadWorkerView.ts";
import ProjectionThreadMessageSearchText from "./041_ProjectionThreadMessageSearchText.ts";

/**
 * Croki and upstream T3 independently used migration ids 35-38. Reapply both
 * idempotent schema branches above the shared high-water mark so databases
 * created by either history converge on the merged projection schema.
 */
export default Effect.gen(function* () {
  yield* ProjectionThreadForkLineage;
  yield* ProjectionThreadTitleRegeneration;
  yield* ProjectionProjectPerception;
  yield* ProjectionThreadsPinned;
  yield* ProjectionThreadParentLineage;
  yield* ProjectionTurnsKeysetIndex;
  yield* ProjectionThreadsPinOrderKey;
  yield* ProjectionThreadWorkerView;
  yield* ProjectionThreadMessageSearchText;
});
