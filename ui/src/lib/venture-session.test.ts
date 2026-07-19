import { beforeEach, describe, expect, it } from "vitest";
import {
  readActiveVentureId,
  readWorkspaceSession,
  rememberActiveVenture,
  rememberWorkspaceSession,
} from "./venture-session";

describe("venture return session", () => {
  beforeEach(() => window.localStorage.clear());

  it("remembers the last active venture", () => {
    rememberActiveVenture("venture-2");
    expect(readActiveVentureId()).toBe("venture-2");
  });

  it("restores a venture's workbench mode and exact scope", () => {
    rememberWorkspaceSession("venture-2", {
      mode: "map",
      focus: {
        directionId: "thread:direction-2",
        target: { betId: "bet-2", workRef: "change-4", teammateRefs: [] },
      },
    });

    expect(readWorkspaceSession("venture-2")).toEqual({
      mode: "map",
      focus: {
        directionId: "thread:direction-2",
        target: { betId: "bet-2", workRef: "change-4", teammateRefs: [] },
      },
    });
  });

  it("ignores malformed presentation state", () => {
    window.localStorage.setItem("drover:workspace-session:v1:venture-2", "not-json");
    expect(readWorkspaceSession("venture-2")).toBeNull();
  });
});
