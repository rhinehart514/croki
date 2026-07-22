import fs from "node:fs";
import path from "node:path";

const repository = path.resolve(import.meta.dirname, "..");
const forbidden = ["components/canvas", "components/stage", "@gtm-ide/design-system", "design-system/"];
const failures = [];
// Observed after the 2026-07-21 cleanup: 126 production Brain modules. Five files of headroom permit
// feature-local extraction without allowing a new parallel framework to grow unnoticed.
const BRAIN_MODULE_CEILING = 131;

function files(directory, pattern) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target, pattern) : pattern.test(entry.name) ? [target] : [];
  });
}

for (const file of [...files(path.join(repository, "ui/src"), /\.(?:ts|tsx|css)$/), ...files(path.join(repository, "brain/src"), /\.mjs$/)]) {
  const source = fs.readFileSync(file, "utf8");
  for (const token of forbidden) if (source.includes(token)) failures.push(`${path.relative(repository, file)} imports retired boundary ${token}`);
  if (/export\s+const\s+jsonPersistence\b/.test(source)) failures.push(`${path.relative(repository, file)} restores the duplicate persistence alias`);
}

const brainFiles = files(path.join(repository, "brain/src"), /\.mjs$/).map((file) => path.resolve(file));
if (brainFiles.length > BRAIN_MODULE_CEILING) {
  failures.push(`Brain module ceiling exceeded: ${brainFiles.length} > ${BRAIN_MODULE_CEILING} (observed 126 + 5 headroom)`);
}
const brainSet = new Set(brainFiles);
const graph = new Map(brainFiles.map((file) => [file, []]));
for (const file of brainFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)["'](\.[^"']+)["']/g)) {
    const target = path.resolve(path.dirname(file), match[1]);
    const resolved = brainSet.has(target) ? target : brainSet.has(`${target}.mjs`) ? `${target}.mjs` : null;
    if (resolved) graph.get(file).push(resolved);
  }
}

const visiting = new Set();
const visited = new Set();
function visit(file, stack = []) {
  if (visiting.has(file)) {
    const start = stack.indexOf(file);
    failures.push(`Brain cycle: ${[...stack.slice(start), file].map((entry) => path.relative(repository, entry)).join(" -> ")}`);
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const dependency of graph.get(file) ?? []) visit(dependency, [...stack, file]);
  visiting.delete(file);
  visited.add(file);
}
for (const file of brainFiles) visit(file);

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Architecture verified (${brainFiles.length} Brain modules, no cycles or retired imports).`);
}
