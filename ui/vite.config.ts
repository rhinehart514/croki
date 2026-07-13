import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Split the heavy vendor libraries into their own chunks so the main app chunk stays small and a
// reload only re-downloads what actually changed. The graph/canvas engine (@xyflow), the animation
// runtime (motion), the team-sync client (convex) and the React runtime each dominate the bundle;
// isolating them shrinks index-*.js from one large monolith. The brand icons (simple-icons) get
// their own `vendor-icons` chunk too — but that chunk is now a few KB, not 5.5MB: brandGlyph.ts
// imports only the specific `si<Name>` brands the app can surface (named imports tree-shake), so
// the barrel of every brand SVG no longer rides along.
function vendorChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("@xyflow") || id.includes("d3-") || id.includes("/d3/")) return "vendor-flow";
  if (id.includes("simple-icons")) return "vendor-icons";
  if (id.includes("/motion") || id.includes("framer-motion")) return "vendor-motion";
  if (id.includes("/convex")) return "vendor-convex";
  if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "vendor-react";
  if (id.includes("lucide-react")) return "vendor-lucide";
  if (id.includes("@dicebear")) return "vendor-avatars";
  if (id.includes("react-markdown") || id.includes("remark-") || id.includes("micromark") || id.includes("mdast-") || id.includes("unist-")) return "vendor-markdown";
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
