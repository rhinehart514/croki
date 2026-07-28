import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SystemIndexObject, WorkIndex } from "@/api";
import { useWorkspaceNavigation } from "./useWorkspaceNavigation";

const object = {
  id: "page",
  objectRef: "object:page",
  name: "Product page",
  statement: "The selected Product page.",
  type: "page",
  territory: "product",
  assertion: "tentative",
  provenance: null,
  properties: {},
  compatibilityOwned: false,
  architectureRole: null,
  threadRefs: ["thread:linked"],
  attention: [],
  createdAt: null,
  updatedAt: null,
} satisfies SystemIndexObject;

const workIndex = {
  ventureId: "venture-one",
  revision: 1,
  items: [{
    threadRef: "thread:linked",
    subjectRefs: [object.objectRef],
    updatedAt: "2026-07-27T12:00:00.000Z",
  }],
  counts: { total: 1, attention: 0, active: 0, unread: 0, matchCount: 1 },
  legacy: { unindexedRunCount: 0 },
} as WorkIndex;

describe("useWorkspaceNavigation", () => {
  it("applies the founder's object selection after restoring its linked Thread", () => {
    const calls: string[] = [];
    const hook = renderHook(() => useWorkspaceNavigation({
      ventureId: "venture-one",
      workIndex,
      selectedObject: null,
      readOnly: false,
      openerRef: { current: null },
      stage: null,
      openThread: vi.fn(() => calls.push("thread")),
      beginScopedThread: vi.fn(),
      newThread: vi.fn(),
      refresh: vi.fn(),
      setWorkIndex: vi.fn(),
      setSystemSelection: vi.fn((ref) => calls.push(`selection:${ref}`)),
      setCanvasOpen: vi.fn((open) => calls.push(`canvas:${open}`)),
      setSelectedAgentRef: vi.fn(),
      setStage: vi.fn(),
    }));

    act(() => hook.result.current.selectObject(object));

    expect(calls).toEqual(["thread", "selection:object:page", "canvas:true"]);
  });
});
