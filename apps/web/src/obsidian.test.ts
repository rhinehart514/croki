import { describe, expect, it } from "vite-plus/test";

import { isDiscoveredObsidianVault } from "./obsidian";

describe("Obsidian workspace links", () => {
  it("matches discovered vaults across trailing and Windows path differences", () => {
    const vault = {
      id: "vault",
      name: "Notes",
      path: "C:\\Users\\Jacob\\Notes\\",
      lastOpenedAt: null,
      isOpen: false,
    } as const;

    expect(isDiscoveredObsidianVault("c:/Users/Jacob/Notes", [vault])).toBe(true);
    expect(isDiscoveredObsidianVault("c:/Users/Jacob/Other", [vault])).toBe(false);
  });
});
