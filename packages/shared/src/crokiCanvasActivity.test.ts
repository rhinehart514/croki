import { describe, expect, it } from "vite-plus/test";

import {
  getCrokiCanvasArtifactFromActivity,
  parseCrokiCanvasPresentedActivityPayload,
} from "./crokiCanvasActivity.ts";

const legacyPayload = {
  relativePath: ".croki/context.json",
  view: "product",
  question: "Which route should the founder judge?",
  provisionalNodeIds: ["route-a"],
  provisionalCount: 1,
  edgeCount: 0,
  sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

const artifact = {
  id: "artifact-1",
  revision: 2,
  threadId: "thread-1",
  turnId: "turn-2",
  harnessId: "gtm-v1",
  presentation: "evidence",
  question: "Which segment has the strongest trigger?",
  nodes: [
    {
      id: "question",
      role: "question",
      title: "Which segment has the strongest trigger?",
    },
    {
      id: "signal",
      role: "evidence",
      title: "Founder teams return weekly",
      references: [{ kind: "url", url: "https://example.com/research" }],
    },
  ],
  edges: [{ from: "signal", to: "question", relation: "supports" }],
  createdAt: "2026-08-02T12:00:00.000Z",
};

describe("CrokiCanvasPresentedActivityPayload", () => {
  it("keeps legacy receipts readable", () => {
    const parsed = parseCrokiCanvasPresentedActivityPayload(legacyPayload);
    expect(parsed).toEqual(legacyPayload);
    expect(getCrokiCanvasArtifactFromActivity(parsed)).toBeNull();
  });

  it("recovers the complete bounded artifact from a new receipt", () => {
    const parsed = parseCrokiCanvasPresentedActivityPayload({ artifact });
    expect(parsed?.artifact).toEqual(artifact);
    expect(getCrokiCanvasArtifactFromActivity(parsed)?.revision).toBe(2);
  });

  it("allows a new artifact with legacy metadata during rollout", () => {
    const parsed = parseCrokiCanvasPresentedActivityPayload({
      artifact,
      ...legacyPayload,
    });
    expect(parsed?.artifact?.harnessId).toBe("gtm-v1");
    expect(parsed?.view).toBe("product");
  });

  it("rejects incomplete, oversized, and unknown payloads", () => {
    expect(parseCrokiCanvasPresentedActivityPayload({ question: "missing receipt" })).toBeNull();
    expect(
      parseCrokiCanvasPresentedActivityPayload({ ...legacyPayload, privatePrompt: "secret" }),
    ).toBeNull();
    expect(
      parseCrokiCanvasPresentedActivityPayload({
        artifact: { ...artifact, nodes: [] },
      }),
    ).toBeNull();
  });
});
