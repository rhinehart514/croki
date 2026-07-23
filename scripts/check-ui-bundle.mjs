import fs from "node:fs";
import path from "node:path";

const assets = path.resolve(import.meta.dirname, "../ui/dist/assets");
if (!fs.existsSync(assets)) throw new Error("Build ui/dist before checking bundle budgets.");
// Shiki syntax grammars are per-language chunks fetched only when a diff in that language is
// opened; they never load on startup or ride in a shared chunk. Two grammars are inherently
// larger than the shared-chunk budget, so they get an explicit, named allowance instead of a
// blanket raise. Any new oversize chunk still fails until it is deliberately listed here.
const LAZY_GRAMMAR_LIMIT = 850_000;
const LAZY_GRAMMAR_PREFIXES = ["cpp-", "emacs-lisp-"];

function limitFor(name) {
  if (name.startsWith("index-")) return 350_000;
  if (LAZY_GRAMMAR_PREFIXES.some((prefix) => name.startsWith(prefix))) return LAZY_GRAMMAR_LIMIT;
  return 600_000;
}

const failures = [];
for (const name of fs.readdirSync(assets).filter((entry) => entry.endsWith(".js"))) {
  const bytes = fs.statSync(path.join(assets, name)).size;
  const limit = limitFor(name);
  if (bytes > limit) failures.push(`${name}: ${bytes} bytes exceeds ${limit} bytes`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("UI bundle budgets verified (entry ≤350 KB; chunks ≤600 KB minified; listed on-demand grammars ≤850 KB).");
}
