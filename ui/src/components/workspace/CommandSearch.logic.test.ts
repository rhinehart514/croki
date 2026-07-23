import { describe, expect, it } from "vitest";
import type { SystemIndexObject, WorkIndexItem } from "@/api";
import {
  filterSearchGroups,
  flattenSearchRows,
  moveHighlight,
  objectSearchRow,
  rankRowMatch,
  sortThreadsForSearch,
  threadSearchRow,
  type SearchGroup,
} from "./CommandSearch.logic";

const row = (id: string, title: string, terms: string[] = [title]) => ({
  id, title, detail: null, shortcut: null, searchTerms: terms,
});

const thread = (overrides: Partial<WorkIndexItem>): WorkIndexItem => ({
  threadRef: "thread:one", ventureRef: "venture:v", parentThreadRef: null, originMessageRef: null,
  subjectRefs: [], focusRef: "bet:one", founderIntent: "Improve onboarding", lifecycle: "open",
  activity: "idle", attention: "none", terminal: null, unread: false, settled: true,
  reviewedThrough: null, latestMeaningfulEvent: { kind: "done", ref: "run:1#done", at: null, summary: "Shipped the setup flow" },
  runRefs: [], pinnedAt: null, participantRefs: [], activeParticipantRefs: [],
  createdAt: null, updatedAt: "2026-07-20T10:00:00.000Z",
  ...overrides,
});

describe("filterSearchGroups", () => {
  const groups: SearchGroup[] = [
    { id: "actions", label: "Actions", atRestLimit: 2, rows: [row("a:new", "New Thread", ["new thread", "start"]), row("a:go", "Go to Work", ["work", "threads"])] },
    { id: "threads", label: "Threads", atRestLimit: 1, rows: [row("t:1", "Improve onboarding"), row("t:2", "Pricing page rework")] },
    { id: "objects", label: "Product / GTM map", atRestLimit: 0, rows: [row("o:1", "Founder-led sales")] },
  ];

  it("at rest caps each group to its resting limit and hides query-only groups", () => {
    const resting = filterSearchGroups(groups, "  ");
    expect(resting.map((group) => group.id)).toEqual(["actions", "threads"]);
    expect(resting[1].rows.map((entry) => entry.id)).toEqual(["t:1"]);
  });

  it("with a query searches every group, drops misses, and drops empty groups", () => {
    const found = filterSearchGroups(groups, "founder");
    expect(found.map((group) => group.id)).toEqual(["objects"]);
    expect(found[0].rows[0].id).toBe("o:1");
    expect(filterSearchGroups(groups, "pricing")[0].rows.map((entry) => entry.id)).toEqual(["t:2"]);
  });

  it("ranks exact and prefix matches above substring matches", () => {
    const ranked = filterSearchGroups([{
      id: "threads", label: "Threads", atRestLimit: 0, rows: [
        row("t:sub", "Rework work queue"), row("t:exact", "Work"), row("t:prefix", "Work queue"),
      ],
    }], "work");
    expect(ranked[0].rows.map((entry) => entry.id)).toEqual(["t:exact", "t:prefix", "t:sub"]);
  });

  it("matches across fields as a last resort", () => {
    const spanning = row("t:x", "Improve onboarding", ["Improve onboarding", "Shipped the setup flow"]);
    expect(rankRowMatch(spanning, "onboarding shipped")).toBe(0);
    expect(rankRowMatch(spanning, "zebra")).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("moveHighlight", () => {
  it("wraps in both directions and survives an empty list", () => {
    expect(moveHighlight(3, 2, 1)).toBe(0);
    expect(moveHighlight(3, 0, -1)).toBe(2);
    expect(moveHighlight(0, 0, 1)).toBe(-1);
    expect(moveHighlight(3, -1, 1)).toBe(0);
    expect(moveHighlight(3, -1, -1)).toBe(2);
  });
});

describe("row derivation", () => {
  it("derives honest thread state labels from real state, never a hand-kept status", () => {
    expect(threadSearchRow(thread({ attention: "decision" })).detail).toBe("Waiting on you");
    expect(threadSearchRow(thread({ attention: "failure" })).detail).toBe("Failed or interrupted");
    expect(threadSearchRow(thread({ activity: "running" })).detail).toBe("Active");
    expect(threadSearchRow(thread({ unread: true })).detail).toBe("Unread result");
    expect(threadSearchRow(thread({})).detail).toBeNull();
    expect(threadSearchRow(thread({})).searchTerms).toContain("Shipped the setup flow");
  });

  it("labels map objects by territory in business language", () => {
    const object = { objectRef: "object:motion", name: "Founder-led sales", statement: "Learn directly.", type: "motion", territory: "gtm" } as SystemIndexObject;
    expect(objectSearchRow(object)).toMatchObject({ id: "object:motion", title: "Founder-led sales", detail: "Go-to-market" });
    expect(objectSearchRow({ ...object, territory: "product" } as SystemIndexObject).detail).toBe("Product");
  });

  it("sorts threads by recency for the resting list", () => {
    const older = thread({ threadRef: "thread:old", updatedAt: "2026-07-01T00:00:00.000Z" });
    const newer = thread({ threadRef: "thread:new", updatedAt: "2026-07-21T00:00:00.000Z" });
    expect(sortThreadsForSearch([older, newer]).map((item) => item.threadRef)).toEqual(["thread:new", "thread:old"]);
  });

  it("flattens groups in display order", () => {
    expect(flattenSearchRows([
      { id: "a", label: "A", atRestLimit: 1, rows: [row("1", "one")] },
      { id: "b", label: "B", atRestLimit: 1, rows: [row("2", "two")] },
    ]).map((entry) => entry.id)).toEqual(["1", "2"]);
  });
});
