// main.test.tsx — the firm-only render root. main.tsx runs its render as a module side effect, so each
// test resets modules and re-imports fresh with a clean #root and a controlled location.search.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./FirmApp.tsx", () => ({
  default: () => <div data-testid="firm-app-stub">FirmApp rendered</div>,
}));

function setSearch(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

function mountRootDiv() {
  document.body.innerHTML = '<div id="root"></div>';
}

describe("main.tsx render-root cutover", () => {
  beforeEach(() => {
    vi.resetModules();
    mountRootDiv();
    setSearch("");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders FirmApp by default (the firm is the render root)", async () => {
    await import("./main.tsx");
    await vi.waitFor(() => expect(document.querySelector('[data-testid="firm-app-stub"]')).toBeTruthy());
  });

  it("renders FirmApp with unrelated query parameters", async () => {
    setSearch("?source=test");
    await import("./main.tsx");
    await vi.waitFor(() => expect(document.querySelector('[data-testid="firm-app-stub"]')).toBeTruthy());
  });
});
