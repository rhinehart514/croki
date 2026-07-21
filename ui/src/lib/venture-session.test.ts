import { beforeEach, describe, expect, it } from "vitest";
import {
  readActiveVentureId,
  readThreadSession,
  rememberActiveVenture,
  rememberThreadSession,
  readWorkspaceSession,
  rememberWorkspaceSession,
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

  it("migrates v2 thread state into Work without carrying the old visual stage", () => {
    const work = { threadRef: "thread:direction-2", stage: { kind: "preview" as const, ref: "work:one", threadRef: "thread:direction-2", title: "Preview" }, railWidth: 272, chatScrollByThread: { "thread:direction-2": 91 } };
    rememberThreadSession("venture-2", work);
    expect(readWorkspaceSession("venture-2")).toMatchObject({ mode: "work", productSection: "canvas", railWidth: 272, selectedThreadRef: "thread:direction-2", chatScrollByThread: work.chatScrollByThread });
  });

  it("restores the current mode, direct selections, and camera", () => {
    const session = { mode: "system" as const, productSection: "releases" as const, railWidth: 280, contextualChatOpen: true, selectedThreadRef: "thread:one", selectedObjectRef: "object:product-one", selectedReleaseId: "release-one", systemScope: "product" as const, systemCamera: { x: 1, y: 2, zoom: 0.8 }, chatScrollByThread: { "thread:one": 44 } };
    rememberWorkspaceSession("venture-2", session);
    expect(readWorkspaceSession("venture-2")).toEqual(session);
  });

  it("preserves v4 continuity while discarding the obsolete graph camera", () => {
    window.localStorage.setItem("drover:workspace-session:v4:venture-2", JSON.stringify({ mode: "system", railWidth: 280, contextualChatOpen: true, selectedThreadRef: "thread:one", selectedObjectRef: "object:motion-one", selectedReleaseId: "release-one", systemScope: "gtm", systemCamera: { x: 900, y: -400, zoom: 1.2 }, chatScrollByThread: { "thread:one": 44 } }));
    expect(readWorkspaceSession("venture-2")).toEqual({ mode: "system", productSection: "canvas", railWidth: 280, contextualChatOpen: true, selectedThreadRef: "thread:one", selectedObjectRef: "object:motion-one", selectedReleaseId: "release-one", systemScope: "gtm", systemCamera: null, chatScrollByThread: { "thread:one": 44 } });
  });

  it("migrates v3 while discarding resolver, drawer, subview, and visual-stage state", () => {
    window.localStorage.setItem("drover:workspace-session:v3:venture-2", JSON.stringify({ mode: "releases", railWidth: 280, context: { kind: "release", ref: "object:release-one" }, work: { threadRef: "thread:one", stage: { kind: "preview" }, railWidth: 280, chatScrollByThread: { "thread:one": 44 } }, system: { scope: "product", selection: "object:product-one", camera: { x: 1, y: 2, zoom: 0.8 } }, releases: { selection: "release-one", subview: "activity" }, chatDrawerOpen: true }));
    expect(readWorkspaceSession("venture-2")).toEqual({ mode: "system", productSection: "releases", railWidth: 280, contextualChatOpen: false, selectedThreadRef: "thread:one", selectedObjectRef: "object:product-one", selectedReleaseId: "release-one", systemScope: "product", systemCamera: null, chatScrollByThread: { "thread:one": 44 } });
  });

  it("ignores malformed presentation state", () => {
    window.localStorage.setItem("drover:workspace-session:v1:venture-2", "not-json");
    expect(readThreadSession("venture-2")).toBeNull();
  });
});
