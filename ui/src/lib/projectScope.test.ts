import { describe, expect, it } from "vitest";
import { forActiveProject } from "./projectScope";

describe("forActiveProject", () => {
  it("keeps only state owned by the product currently on screen", () => {
    const current = { projectId: "p-current", revision: 4 };
    expect(forActiveProject(current, "p-current")).toBe(current);
    expect(forActiveProject(current, "p-next")).toBeNull();
  });

  it("stays empty while either side of a product switch is unresolved", () => {
    expect(forActiveProject(undefined, "p-current")).toBeNull();
    expect(forActiveProject({ projectId: "p-current" }, null)).toBeNull();
  });
});
