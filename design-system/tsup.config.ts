import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: false,
  clean: true,
  treeshake: true,
  // React is provided by the consuming application.
  external: ["react", "react-dom", "react/jsx-runtime"],
});
