import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { CrokiCanvasLiveScene } from "./crokiCanvasLiveScene";
import { CrokiCanvasLiveField } from "./CrokiCanvasLiveField";

const workstreamScene: CrokiCanvasLiveScene = {
  objects: [
    {
      id: "thread:test",
      source: "agent",
      title: "Test Conversation",
      body: "1 source event",
      kind: "thread",
      authority: "Source Thread",
      affordances: [{ id: "thread", label: "Open Thread" }],
    },
  ],
  edges: [],
  attentionIds: [],
  revisionObjects: [],
  updatedAt: "2026-08-03T11:29:00.000Z",
  perceptionScope: "project",
  perceptionStatus: "ready",
};

describe("CrokiCanvasLiveField", () => {
  it("puts the unresolved judgment first and keeps one source Thread compact", () => {
    const judgment: CrokiCanvasLiveScene["objects"][number] = {
      id: "judgment:test",
      source: "attention",
      title: "Choose the review loop",
      body: "The route is blocked on a founder decision.",
      kind: "warning",
      status: "blocked",
      authority: "Needs founder judgment",
      selectionId: "judgment:test",
      perceptionObject: {
        id: "judgment:test",
        type: "warning",
        title: "Choose the review loop",
        summary: "The route is blocked on a founder decision.",
        state: "blocked",
        revision: 4,
        source: { kind: "canvas", turnId: null, observedAt: "2026-08-03T11:29:00.000Z" },
        affordances: [],
      },
      affordances: [],
    };
    const outcome: CrokiCanvasLiveScene["objects"][number] = {
      id: "outcome:test",
      source: "outcome",
      title: "A clearer review path",
      body: "",
      kind: "outcome",
      affordances: [],
    };
    const markup = renderToStaticMarkup(
      <CrokiCanvasLiveField
        scene={{ ...workstreamScene, objects: [outcome, ...workstreamScene.objects, judgment] }}
        focusMode="all"
        selectedIds={[]}
        onClearSelection={vi.fn()}
        onAddress={vi.fn()}
        onOpen={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(markup.indexOf("Your judgment")).toBeGreaterThanOrEqual(0);
    expect(markup.indexOf("Your judgment")).toBeLessThan(markup.indexOf("Current outcome"));
    expect(markup).not.toContain("Workstreams");
    expect(markup).toContain('data-canvas-provenance="source-thread"');
    expect(markup).toContain("Source Thread");
    expect(markup).toContain("Test Conversation");
    expect(markup).toContain("Address in Thread");
  });
});
