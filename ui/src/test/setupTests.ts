import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// Testing Library's findBy*/waitFor queries carry their OWN 1000ms async budget, independent of vitest's
// testTimeout. Under full-suite parallelism the heavy jsdom + React Flow files (FirmApp ~25s, FirmLens ~17s)
// starve of CPU, so a findBy that races a still-pending async render can exhaust that 1000ms window even
// though the render lands moments later — a load-dependent flake, not a real failure. Raising the async
// utility budget lets those queries wait out a contended render. It never weakens an assertion: a query that
// would truly never resolve still fails, just later; a query that resolves late now passes deterministically.
configure({ asyncUtilTimeout: 15000 });

// Node 25 may expose an incomplete experimental `localStorage` when no
// --localstorage-file is configured. It can also shadow jsdom's Storage
// object, so install a deterministic browser-compatible store for tests.
const values = new Map<string, string>();
const testStorage: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key) { return values.get(String(key)) ?? null; },
  key(index) { return [...values.keys()][index] ?? null; },
  removeItem(key) { values.delete(String(key)); },
  setItem(key, value) { values.set(String(key), String(value)); },
};
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: testStorage });
Object.defineProperty(window, "localStorage", { configurable: true, value: testStorage });

// Base UI restores the page scroll position after closing a portaled popup. jsdom intentionally leaves
// scrollTo unimplemented, so provide the browser-shaped no-op the component tests need.
Object.defineProperty(window, "scrollTo", { configurable: true, value: () => undefined });

class TestResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: TestResizeObserver });

// Unmount anything a test rendered so state from one test never leaks into the next.
afterEach(() => {
  cleanup();
  testStorage.clear();
});
