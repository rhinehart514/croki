import { beforeEach, describe, expect, it } from "vitest";
import {
  readActiveVentureId,
  readThreadSession,
  rememberActiveVenture,
  rememberThreadSession,
  readWorkspaceSession,
  readWorkspaceThreadPresentation,
  rememberWorkspaceSession,
  validateWorkspaceDestination,
} from "./venture-session";

describe("venture return session", () => {
  beforeEach(() => window.localStorage.clear());

  it("remembers the last active venture", () => {
    rememberActiveVenture("venture-2");
    expect(readActiveVentureId()).toBe("venture-2");
  });

  it("restores thread presentation without creating venture truth", () => {
    const session = { threadRef: "thread:direction-2", stage: null, railWidth: 272, chatScrollByThread: { "thread:direction-2": 140 } };
    rememberThreadSession("venture-2", session);
    expect(readThreadSession("venture-2")).toEqual(session);
  });

  it("migrates an old map session to its linked thread with the stage closed", () => {
    window.localStorage.setItem("drover:workspace-session:v1:venture-2", JSON.stringify({ mode: "map", focus: { directionId: "thread:direction-2", target: { threadRef: "thread:direction-2" } } }));
    expect(readThreadSession("venture-2")).toEqual({ threadRef: "thread:direction-2", stage: null, railWidth: 272, chatScrollByThread: {} });
  });

  it("migrates v2 thread state into the closed-canvas shell without the old visual stage", () => {
    const work = { threadRef: "thread:direction-2", stage: { kind: "preview" as const, ref: "work:one", threadRef: "thread:direction-2", title: "Preview" }, railWidth: 272, chatScrollByThread: { "thread:direction-2": 91 } };
    rememberThreadSession("venture-2", work);
    expect(readWorkspaceSession("venture-2")).toMatchObject({ canvasOpen: false, railWidth: 272, selectedThreadRef: "thread:direction-2", chatScrollByThread: work.chatScrollByThread });
  });

  it("restores the canvas open state, direct selections, and camera", () => {
    const session = { railWidth: 280, canvasOpen: true, selectedThreadRef: "thread:one", selectedObjectRef: "object:product-one", systemCamera: { x: 1, y: 2, zoom: 0.8 }, chatScrollByThread: { "thread:one": 44 } };
    rememberWorkspaceSession("venture-2", session);
    expect(readWorkspaceSession("venture-2")).toEqual(session);
  });

  it("keeps exact Canvas presentation separate for each Project and Thread", () => {
    rememberWorkspaceSession("venture-a", {
      railWidth: 296,
      canvasOpen: true,
      selectedThreadRef: "thread:one",
      selectedObjectRef: "object:one",
      systemCamera: { x: 10, y: 20, zoom: 0.8 },
      chatScrollByThread: { "thread:one": 120 },
    });
    rememberWorkspaceSession("venture-a", {
      railWidth: 296,
      canvasOpen: false,
      selectedThreadRef: "thread:two",
      selectedObjectRef: null,
      systemCamera: null,
      chatScrollByThread: { "thread:one": 120, "thread:two": 42 },
    });
    rememberWorkspaceSession("venture-b", {
      railWidth: 320,
      canvasOpen: true,
      selectedThreadRef: "thread:other",
      selectedObjectRef: "object:other",
      systemCamera: { x: -4, y: 9, zoom: 1.1 },
      chatScrollByThread: { "thread:other": 8 },
    });

    expect(readWorkspaceThreadPresentation("venture-a", "thread:one")).toEqual({
      canvasOpen: true,
      selectedObjectRef: "object:one",
      systemCamera: { x: 10, y: 20, zoom: 0.8 },
    });
    expect(readWorkspaceThreadPresentation("venture-a", "thread:two")).toEqual({
      canvasOpen: false,
      selectedObjectRef: null,
      systemCamera: null,
    });
    expect(readWorkspaceThreadPresentation("venture-b", "thread:other")?.selectedObjectRef).toBe("object:other");
    expect(readWorkspaceThreadPresentation("venture-b", "thread:one")).toBeNull();
  });

  it("drops only invalid local addresses and keeps the nearest coherent Thread state", () => {
    const session = {
      railWidth: 280,
      canvasOpen: true,
      selectedThreadRef: "thread:one",
      selectedObjectRef: "object:deleted",
      systemCamera: { x: 1, y: 2, zoom: 0.9 },
      chatScrollByThread: { "thread:one": 77 },
    };
    const restored = validateWorkspaceDestination(session, {
      threadRefs: new Set(["thread:one"]),
      objectRefs: new Set(["object:current"]),
    });

    expect(restored.session).toEqual({
      ...session,
      selectedObjectRef: null,
      systemCamera: null,
    });
    expect(restored.breaks).toEqual([{
      layer: "Canvas",
      message: "The saved Canvas item is no longer available. The Thread and its draft were kept.",
    }]);
  });

  it("rejects a cross-Project snapshot instead of painting it into the destination", () => {
    window.localStorage.setItem("drover:workspace-session:v14:venture-b", JSON.stringify({
      schemaVersion: 1,
      ventureId: "venture-a",
      activeThreadRef: "thread:a",
      railWidth: 360,
      chatScrollByThread: { "thread:a": 999 },
      threads: { "thread:a": { canvasOpen: true, selectedObjectRef: "object:a", systemCamera: { x: 1, y: 2, zoom: 1 } } },
    }));
    expect(readWorkspaceSession("venture-b")).toEqual({
      railWidth: 272,
      canvasOpen: false,
      selectedThreadRef: null,
      selectedObjectRef: null,
      systemCamera: null,
      chatScrollByThread: {},
    });
  });

  it("opens the canvas for a v12 record that was left on the retired Product/GTM surface", () => {
    window.localStorage.setItem("drover:workspace-session:v12:venture-2", JSON.stringify({ mode: "product-gtm", railWidth: 280, contextualChatOpen: false, selectedThreadRef: "thread:one", selectedObjectRef: "object:product-one", systemCamera: { x: 1, y: 2, zoom: 0.8 }, chatScrollByThread: { "thread:one": 44 } }));
    expect(readWorkspaceSession("venture-2")).toEqual({ railWidth: 280, canvasOpen: true, selectedThreadRef: "thread:one", selectedObjectRef: "object:product-one", systemCamera: { x: 1, y: 2, zoom: 0.8 }, chatScrollByThread: { "thread:one": 44 } });
  });

  it("keeps the canvas closed for a v12 Work record", () => {
    window.localStorage.setItem("drover:workspace-session:v12:venture-2", JSON.stringify({ mode: "work", railWidth: 288, contextualChatOpen: false, selectedThreadRef: "thread:one", selectedObjectRef: null, systemCamera: null, chatScrollByThread: {} }));
    expect(readWorkspaceSession("venture-2")).toEqual({ railWidth: 288, canvasOpen: false, selectedThreadRef: "thread:one", selectedObjectRef: null, systemCamera: null, chatScrollByThread: {} });
  });

  it("opens the canvas from a v7 record whose contextual chat was open, resetting the layout camera", () => {
    window.localStorage.setItem("drover:workspace-session:v7:venture-2", JSON.stringify({ mode: "work", railWidth: 280, contextualChatOpen: true, selectedThreadRef: "thread:one", selectedObjectRef: "object:product-one", systemCamera: { x: 900, y: -400, zoom: 1.2 }, chatScrollByThread: { "thread:one": 44 } }));
    expect(readWorkspaceSession("venture-2")).toEqual({ railWidth: 280, canvasOpen: true, selectedThreadRef: "thread:one", selectedObjectRef: "object:product-one", systemCamera: null, chatScrollByThread: { "thread:one": 44 } });
  });

  it("preserves v10 context while resetting the former canvas camera", () => {
    window.localStorage.setItem("drover:workspace-session:v10:venture-2", JSON.stringify({ mode: "product-gtm", railWidth: 300, contextualChatOpen: false, selectedThreadRef: "thread:one", selectedObjectRef: "object:feature-one", systemCamera: { x: 400, y: -80, zoom: 0.44 }, chatScrollByThread: {} }));
    expect(readWorkspaceSession("venture-2")).toEqual({ railWidth: 300, canvasOpen: true, selectedThreadRef: "thread:one", selectedObjectRef: "object:feature-one", systemCamera: null, chatScrollByThread: {} });
  });

  it("preserves v11 context while resetting the superseded automatic composition", () => {
    window.localStorage.setItem("drover:workspace-session:v11:venture-2", JSON.stringify({ mode: "work", railWidth: 300, contextualChatOpen: false, selectedThreadRef: "thread:one", selectedObjectRef: "object:feature-one", systemCamera: { x: 400, y: -80, zoom: 0.44 }, chatScrollByThread: {} }));
    expect(readWorkspaceSession("venture-2")).toEqual({ railWidth: 300, canvasOpen: false, selectedThreadRef: "thread:one", selectedObjectRef: "object:feature-one", systemCamera: null, chatScrollByThread: {} });
  });

  it("preserves v4 continuity while discarding the obsolete graph camera", () => {
    window.localStorage.setItem("drover:workspace-session:v4:venture-2", JSON.stringify({ mode: "system", railWidth: 280, contextualChatOpen: true, selectedThreadRef: "thread:one", selectedObjectRef: "object:motion-one", selectedReleaseId: "release-one", systemScope: "gtm", systemCamera: { x: 900, y: -400, zoom: 1.2 }, chatScrollByThread: { "thread:one": 44 } }));
    expect(readWorkspaceSession("venture-2")).toEqual({ railWidth: 280, canvasOpen: true, selectedThreadRef: "thread:one", selectedObjectRef: "object:motion-one", systemCamera: null, chatScrollByThread: { "thread:one": 44 } });
  });

  it("migrates v3 while discarding resolver, drawer, subview, and visual-stage state", () => {
    window.localStorage.setItem("drover:workspace-session:v3:venture-2", JSON.stringify({ mode: "releases", railWidth: 280, context: { kind: "release", ref: "object:release-one" }, work: { threadRef: "thread:one", stage: { kind: "preview" }, railWidth: 280, chatScrollByThread: { "thread:one": 44 } }, system: { scope: "product", selection: "object:product-one", camera: { x: 1, y: 2, zoom: 0.8 } }, releases: { selection: "release-one", subview: "activity" }, chatDrawerOpen: true }));
    expect(readWorkspaceSession("venture-2")).toEqual({ railWidth: 280, canvasOpen: true, selectedThreadRef: "thread:one", selectedObjectRef: "object:product-one", systemCamera: null, chatScrollByThread: { "thread:one": 44 } });
  });

  it("ignores malformed presentation state", () => {
    window.localStorage.setItem("drover:workspace-session:v1:venture-2", "not-json");
    expect(readThreadSession("venture-2")).toBeNull();
  });
});
