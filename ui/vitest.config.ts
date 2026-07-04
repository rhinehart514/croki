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
  },
});
