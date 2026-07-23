import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Keep the lens engine and React runtime cached independently from application code.
function vendorChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  // Shiki language grammars arrive through dynamic imports; leaving them unassigned lets Rollup
  // keep each one an on-demand chunk instead of folding megabytes into a static vendor file.
  if (id.includes("@shikijs/langs") || id.includes("@shikijs/themes")) return undefined;
  if (id.includes("@pierre/theme")) return "vendor-diff-themes";
  if (id.includes("@pierre/")) return "vendor-diffs";
  if (id.includes("/shiki/") || id.includes("@shikijs")) return "vendor-shiki";
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
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // Drover always uses shiki's JavaScript regex engine; the WASM engine module would inline
      // a 622 KB Oniguruma binary into the page and worker bundles as dead weight.
      "shiki/wasm": path.resolve(import.meta.dirname, "./src/lib/shikiWasmStub.ts"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
  worker: {
    // The @pierre/diffs highlight worker dynamic-imports shiki grammars per language; the default
    // iife worker format cannot code-split, so it would inline every grammar into one giant file.
    format: "es",
  },
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:4317", changeOrigin: true },
    },
  },
});
