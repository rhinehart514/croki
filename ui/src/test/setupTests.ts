import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount anything a test rendered so state from one test never leaks into the next.
afterEach(() => {
  cleanup();
});
