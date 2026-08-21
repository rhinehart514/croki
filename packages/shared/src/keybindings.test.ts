import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_KEYBINDINGS, DEFAULT_RESOLVED_KEYBINDINGS } from "./keybindings.js";

describe("default keybindings", () => {
  it("exposes the configurable Canvas command outside terminal focus", () => {
    expect(DEFAULT_KEYBINDINGS).toContainEqual({
      key: "mod+shift+c",
      command: "canvas.open",
      when: "!terminalFocus",
    });
    expect(DEFAULT_RESOLVED_KEYBINDINGS.some((binding) => binding.command === "canvas.open")).toBe(
      true,
    );
  });
});
