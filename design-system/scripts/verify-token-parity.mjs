import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.resolve(scriptDirectory, "..");
const canonicalPath = path.resolve(packageDirectory, "../ui/src/index.css");
const projectionPath = path.resolve(packageDirectory, "styles.css");

// These tokens support package-only components. Everything else declared by
// the package must exist in the app's first :root block and resolve identically.
const packageExtensions = new Set([
  "--gap-ink",
  "--blind-ink",
  "--cat-source",
  "--cat-enrich",
  "--cat-filter",
  "--cat-generate",
  "--cat-gate",
  "--cat-execute",
  "--cat-measure",
]);

function withoutComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function firstRootBody(css, filePath) {
  const source = withoutComments(css);
  const rootStart = source.search(/:root\s*\{/);
  if (rootStart < 0) throw new Error(`${filePath} has no :root token block.`);

  const openBrace = source.indexOf("{", rootStart);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openBrace + 1, index);
  }
  throw new Error(`${filePath} has an unterminated :root token block.`);
}

function tokensFrom(css, filePath) {
  const body = firstRootBody(css, filePath);
  const tokens = new Map();
  const declaration = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  for (const match of body.matchAll(declaration)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

function normalized(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*([(),/])\s*/g, "$1");
}

function resolved(name, tokens, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Circular token alias detected at ${name}.`);
  const raw = tokens.get(name);
  if (raw == null) return null;

  const alias = raw.match(/^var\((--[a-z0-9-]+)\)$/i);
  if (!alias) return normalized(raw);

  const nextSeen = new Set(seen);
  nextSeen.add(name);
  return resolved(alias[1], tokens, nextSeen);
}

const [canonicalCss, projectionCss] = await Promise.all([
  readFile(canonicalPath, "utf8"),
  readFile(projectionPath, "utf8"),
]);

const canonical = tokensFrom(canonicalCss, canonicalPath);
const projection = tokensFrom(projectionCss, projectionPath);
const failures = [];

for (const name of canonical.keys()) {
  if (!projection.has(name)) {
    failures.push(`${name}: missing from design-system/styles.css`);
    continue;
  }

  const canonicalValue = resolved(name, canonical);
  const projectionValue = resolved(name, projection);
  if (canonicalValue !== projectionValue) {
    failures.push(
      `${name}: canonical ${JSON.stringify(canonicalValue)}, projection ${JSON.stringify(projectionValue)}`,
    );
  }
}

for (const name of projection.keys()) {
  if (!canonical.has(name) && !packageExtensions.has(name)) {
    failures.push(`${name}: package-only token is not registered as an extension`);
  }
}

for (const name of packageExtensions) {
  if (!projection.has(name)) failures.push(`${name}: registered extension is missing`);
}

if (failures.length > 0) {
  console.error("Drover token parity failed. ui/src/index.css is canonical:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Drover token parity verified (${canonical.size} shared, ${packageExtensions.size} package extensions).`);
}
