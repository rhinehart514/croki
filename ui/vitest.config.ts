import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The UI unit-test harness. jsdom gives the components a DOM to render into; setupTests wires
// @testing-library/jest-dom matchers and cleans the DOM between tests. Tests live next to the code
// as *.test.tsx and are excluded from the production `tsc -b` build, so they never ship.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setupTests.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // Heavy jsdom + React Flow suites (FirmApp ~33s, FirmLens ~17s of wall-clock work spread across many
    // async-settled assertions) blow vitest's 5000ms default per-test/per-hook timeout under machine load,
    // flaking the suite non-deterministically. The work is real, not hung — give it headroom so a slow
    // machine does not fail a passing test. This weakens no assertion; it only stops a loaded runner from
    // timing out mid-settle.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
