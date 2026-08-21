import type { CrokiPerceptionObject } from "@croki/contracts";

import type { CrokiCanvasLiveObject } from "./crokiCanvasLiveScene";

export function thoughtStatementLiveObject(object: CrokiPerceptionObject): CrokiCanvasLiveObject {
  return {
    id: object.id,
    source: "context",
    title: object.title,
    body: object.summary ?? "",
    kind: object.type,
    ...(object.state ? { status: object.state } : {}),
    authority: `Observed from ${object.source.kind}`,
    updatedAt: object.source.observedAt,
    revision: object.revision,
    selectionId: object.id,
    perceptionObject: object,
    ...(object.source.uri ? { perceptionSourceUri: object.source.uri } : {}),
    ...(object.source.sourceThreadId
      ? { sourceThreadId: object.source.sourceThreadId }
      : object.source.kind === "thread" && object.source.id
        ? { sourceThreadId: object.source.id }
        : {}),
    affordances: [
      { id: "focus", label: "Focus" },
      { id: "use", label: "Use in Thread" },
      ...(object.source.uri || object.source.sourceThreadId
        ? [{ id: "source" as const, label: "Open source" }]
        : []),
    ],
  };
}
