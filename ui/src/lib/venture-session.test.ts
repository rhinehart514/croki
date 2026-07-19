import { beforeEach, describe, expect, it } from "vitest";
import {
  readActiveVentureId,
  readThreadSession,
  rememberActiveVenture,
  rememberThreadSession,
} from "./venture-session";

describe("venture return session", () => {
  beforeEach(() => window.localStorage.clear());

  it("remembers the last active venture", () => {
    rememberActiveVenture("venture-2");
    expect(readActiveVentureId()).toBe("venture-2");
  });

  it("restores thread presentation without creating venture truth", () => {
    const session = { threadRef: "thread:direction-2", stage: null, railWidth: 260, chatScrollByThread: { "thread:direction-2": 140 } };
    rememberThreadSession("venture-2", session);
    expect(readThreadSession("venture-2")).toEqual(session);
  });

  it("migrates an old map session to its linked thread with the stage closed", () => {
    window.localStorage.setItem("drover:workspace-session:v1:venture-2", JSON.stringify({ mode: "map", focus: { directionId: "thread:direction-2", target: { threadRef: "thread:direction-2" } } }));
    expect(readThreadSession("venture-2")).toEqual({ threadRef: "thread:direction-2", stage: null, railWidth: 240, chatScrollByThread: {} });
  });

  it("ignores malformed presentation state", () => {
    window.localStorage.setItem("drover:workspace-session:v1:venture-2", "not-json");
    expect(readThreadSession("venture-2")).toBeNull();
  });
});
