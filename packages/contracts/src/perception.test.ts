import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  CrokiPerceptionFrame,
  CrokiPerceptionFrameReference,
  CrokiPerceptionSource,
} from "./perception.ts";

const decodeFrame = Schema.decodeUnknownSync(CrokiPerceptionFrame);

describe("CrokiPerceptionFrame", () => {
  it("decodes a stable source packet with extensible sense labels", () => {
    const frame = decodeFrame({
      threadId: "thread-1",
      revision: 4,
      sourceRevision: 4,
      changed: true,
      objects: [
        {
          id: "preview:page",
          type: "browser-page",
          title: "Preview",
          revision: 4,
          source: {
            kind: "preview",
            turnId: null,
            observedAt: "2026-08-02T00:00:00.000Z",
          },
          affordances: [
            {
              id: "inspect",
              kind: "inspect",
              label: "Inspect page",
              authority: "operator-defined",
              reversible: true,
              requiresApproval: false,
            },
          ],
        },
      ],
      relationships: [],
      delta: {
        sinceRevision: 3,
        addedObjects: [],
        updatedObjects: [],
        removedObjectIds: [],
        addedRelationships: [],
        removedRelationshipIds: [],
      },
      latestActivityAt: "2026-08-02T00:00:00.000Z",
      activeTurnId: null,
      truncated: false,
    });

    expect(frame.revision).toBe(4);
    expect(frame.objects[0]?.affordances[0]?.authority).toBe("operator-defined");
  });

  it("keeps provenance and rendered-frame pointers independently decodable", () => {
    expect(
      Schema.decodeUnknownSync(CrokiPerceptionSource)({
        kind: "filesystem",
        uri: "file:///workspace/app.ts",
        turnId: null,
        observedAt: "2026-08-02T00:00:00.000Z",
      }).kind,
    ).toBe("filesystem");
    expect(
      Schema.decodeUnknownSync(CrokiPerceptionFrameReference)({
        kind: "snapshot",
        ref: "activity:42#frame",
      }),
    ).toEqual({ kind: "snapshot", ref: "activity:42#frame" });
  });
});
