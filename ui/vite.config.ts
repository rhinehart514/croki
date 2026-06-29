import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Split the heavy vendor libraries into their own chunks so the main app chunk stays small and a
// reload only re-downloads what actually changed. The graph/canvas engine (@xyflow), the brand-icon
// dataset (simple-icons ships every brand SVG and can't be tree-shaken because brandGlyph resolves
// icons by runtime key), the animation runtime (motion), the team-sync client (convex) and the
// React runtime each dominate the bundle; isolating them shrinks index-*.js from one ~6.5MB monolith.
function vendorChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("@xyflow") || id.includes("d3-") || id.includes("/d3/")) return "vendor-flow";
  if (id.includes("simple-icons")) return "vendor-icons";
  if (id.includes("/motion") || id.includes("framer-motion")) return "vendor-motion";
  if (id.includes("/convex")) return "vendor-convex";
  if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "vendor-react";
  if (id.includes("lucide-react")) return "vendor-lucide";
  return "vendor";
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:4317", changeOrigin: true },
    },
  },
});
