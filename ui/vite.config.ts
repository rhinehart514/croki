import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Keep the lens engine and React runtime cached independently from application code.
function vendorChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("@xyflow") || id.includes("d3-") || id.includes("/d3/")) return "vendor-flow";
  if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "vendor-react";
  if (id.includes("lucide-react")) return "vendor-lucide";
  if (id.includes("@dicebear")) return "vendor-avatars";
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
