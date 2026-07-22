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
  if (id.includes("/motion/") || id.includes("framer-motion")) return "vendor-motion";
  if (id.includes("streamdown") || id.includes("remark-") || id.includes("rehype-") || id.includes("micromark") || id.includes("mdast-") || id.includes("hast-")) return "vendor-markdown";
  if (id.includes("@base-ui") || id.includes("class-variance-authority") || id.includes("tailwind-merge") || id.includes("/clsx/")) return "vendor-ui";
  if (id.includes("@xterm")) return "vendor-terminal";
  if (id.includes("@lobehub")) return "vendor-provider-icons";
  if (id.includes("use-stick-to-bottom")) return "vendor-scroll";
  return "vendor";
}

export default defineConfig({
  base: "./",
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
