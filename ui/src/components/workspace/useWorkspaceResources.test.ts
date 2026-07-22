import { describe, expect, it } from "vitest";
import { failedWorkspaceResource, readyWorkspaceResource } from "./useWorkspaceResources";

describe("workspace resource continuity", () => {
  it("reports an actionable initial error when no coherent data exists", () => {
    expect(failedWorkspaceResource({ data: null, status: "loading", error: null }, new Error("Brain unavailable")))
      .toEqual({ data: null, status: "error", error: "Brain unavailable" });
  });

  it("retains the last coherent data when refresh fails and clears the error after success", () => {
    const stale = failedWorkspaceResource(readyWorkspaceResource({ revision: 7 }), new Error("refresh failed"));
    expect(stale).toEqual({ data: { revision: 7 }, status: "stale", error: "refresh failed" });
    expect(readyWorkspaceResource({ revision: 8 })).toEqual({ data: { revision: 8 }, status: "ready", error: null });
  });
});
