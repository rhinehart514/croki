import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  installCommand: "npm install -g vite-plus && vp install --filter '@croki/marketing...'",
  buildCommand: "vp run --filter @croki/marketing build",
  outputDirectory: "dist",
};
