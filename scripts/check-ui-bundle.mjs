import fs from "node:fs";
import path from "node:path";

const assets = path.resolve(import.meta.dirname, "../ui/dist/assets");
if (!fs.existsSync(assets)) throw new Error("Build ui/dist before checking bundle budgets.");
const failures = [];
for (const name of fs.readdirSync(assets).filter((entry) => entry.endsWith(".js"))) {
  const bytes = fs.statSync(path.join(assets, name)).size;
  const limit = name.startsWith("index-") ? 350_000 : 600_000;
  if (bytes > limit) failures.push(`${name}: ${bytes} bytes exceeds ${limit} bytes`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("UI bundle budgets verified (entry ≤350 KB; chunks ≤600 KB minified). ");
}
