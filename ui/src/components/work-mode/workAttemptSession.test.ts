import { beforeEach, describe, expect, it } from "vitest";
import {
  readWorkAttemptSession,
  rememberWorkAttemptSession,
  resolveWorkAttemptSession,
} from "./workAttemptSession";

describe("attempt Review presentation memory", () => {
  beforeEach(() => localStorage.clear());

  it("persists per Thread and resolves removed attempts without crossing into another Thread", () => {
    rememberWorkAttemptSession("venture-one", "thread:one", {
      selectedId: "attempt-two",
      comparing: true,
      leftId: "attempt-one",
      rightId: "attempt-two",
    });
    expect(readWorkAttemptSession("venture-one", "thread:one").selectedId).toBe("attempt-two");
    expect(readWorkAttemptSession("venture-one", "thread:other").selectedId).toBeNull();
    expect(resolveWorkAttemptSession(readWorkAttemptSession("venture-one", "thread:one"), ["attempt-one"])).toEqual({
      selectedId: "attempt-one",
      comparing: false,
      leftId: "attempt-one",
      rightId: "attempt-one",
    });
  });
});
