import { createEmptyCrokiContext } from "@croki/shared/crokiContext";
import { describe, expect, it } from "vite-plus/test";

import { isCrokiContextDirty } from "./crokiCanvasModel";
import {
  addCrokiReleaseCriterion,
  addCrokiReleaseCriterionReference,
  addCrokiReleaseItem,
  canVerifyCrokiReleaseItem,
  createCrokiReleaseCandidate,
  deleteCrokiReleaseCriterion,
  linkCrokiReleaseSourceThread,
  nextCrokiReleaseCriterionId,
  nextCrokiReleaseItemId,
  updateCrokiReleaseCriterion,
  updateCrokiReleaseItem,
} from "./crokiReleaseModel";

const NOW = "2026-08-02T16:00:00.000Z";

describe("Croki Release Canvas model", () => {
  it("creates a project-owned release and links current Thread work", () => {
    const empty = createEmptyCrokiContext("Croki");
    const created = createCrokiReleaseCandidate(
      empty,
      { version: "0.4.2", baseline: "0.4.1", goal: "See the next release." },
      NOW,
    );
    const release = created.context.release!;
    const itemId = nextCrokiReleaseItemId(release, "Release Canvas");
    const added = addCrokiReleaseItem(
      created.context,
      {
        id: itemId,
        title: "Release Canvas",
        sourceThread: { id: "thread-1", title: "Build Canvas" },
      },
      NOW,
    );

    expect(added.error).toBeNull();
    expect(added.context.release?.items[0]).toMatchObject({
      id: "release-canvas",
      status: "working",
      sourceThreads: [{ id: "thread-1", title: "Build Canvas" }],
    });
    expect(isCrokiContextDirty(added.context, empty)).toBe(true);
  });

  it("requires acceptance evidence before verification", () => {
    let context = contextWithItem();
    const item = context.release!.items[0]!;
    const criterionId = nextCrokiReleaseCriterionId(item);
    context = addCrokiReleaseCriterion(
      context,
      "release-canvas",
      { id: criterionId, text: "The candidate opens beside the Thread." },
      NOW,
    ).context;

    expect(
      updateCrokiReleaseItem(context, "release-canvas", { status: "verified" }, NOW).error,
    ).toBe("release-verification-required");

    context = updateCrokiReleaseCriterion(
      context,
      "release-canvas",
      criterionId,
      { status: "passed" },
      NOW,
    ).context;
    context = addCrokiReleaseCriterionReference(
      context,
      "release-canvas",
      criterionId,
      { kind: "file", path: "apps/web/src/components/croki/CrokiReleaseCanvas.tsx" },
      NOW,
    ).context;
    expect(canVerifyCrokiReleaseItem(context.release!.items[0]!)).toBe(true);
    expect(
      updateCrokiReleaseItem(context, "release-canvas", { status: "verified" }, NOW).context.release
        ?.items[0]?.status,
    ).toBe("verified");
  });

  it("reopens verified work when its proof changes", () => {
    let context = contextWithVerifiedItem();
    context = updateCrokiReleaseCriterion(
      context,
      "release-canvas",
      "acceptance",
      { status: "failed" },
      NOW,
    ).context;
    expect(context.release?.items[0]?.status).toBe("candidate");

    context = contextWithVerifiedItem();
    context = deleteCrokiReleaseCriterion(context, "release-canvas", "acceptance", NOW).context;
    expect(context.release?.items[0]?.status).toBe("candidate");
  });

  it("deduplicates source Threads and generates stable unique ids", () => {
    let context = contextWithItem();
    const unchanged = linkCrokiReleaseSourceThread(
      context,
      "release-canvas",
      { id: "thread-1", title: "Release Canvas" },
      NOW,
    );
    expect(unchanged.context).toBe(context);
    expect(nextCrokiReleaseItemId(context.release!, "Release Canvas")).toBe("release-canvas-2");
    expect(nextCrokiReleaseCriterionId(context.release!.items[0]!)).toBe("acceptance");
  });
});

function contextWithItem() {
  const created = createCrokiReleaseCandidate(
    createEmptyCrokiContext("Croki"),
    { version: "0.4.2", baseline: "0.4.1", goal: "See the next release." },
    NOW,
  ).context;
  return addCrokiReleaseItem(
    created,
    {
      id: "release-canvas",
      title: "Release Canvas",
      sourceThread: { id: "thread-1", title: "Release Canvas" },
    },
    NOW,
  ).context;
}

function contextWithVerifiedItem() {
  let context = contextWithItem();
  context = addCrokiReleaseCriterion(
    context,
    "release-canvas",
    { id: "acceptance", text: "Canvas works." },
    NOW,
  ).context;
  context = updateCrokiReleaseCriterion(
    context,
    "release-canvas",
    "acceptance",
    { status: "passed" },
    NOW,
  ).context;
  return updateCrokiReleaseItem(context, "release-canvas", { status: "verified" }, NOW).context;
}
