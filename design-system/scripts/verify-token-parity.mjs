import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.resolve(scriptDirectory, "..");
const canonicalPath = path.resolve(packageDirectory, "../ui/src/index.css");
const projectionPath = path.resolve(packageDirectory, "styles.css");
const productionStylesPath = path.resolve(packageDirectory, "../ui/src");

// These tokens support package-only components. Everything else declared by
// the package must exist in the app's first :root block and resolve identically.
const packageExtensions = new Set([
  "--accent",
  "--accent-soft",
  "--agent",
  "--canvas-dot",
  "--danger-soft",
  "--dur-amb",
  "--dur-slow",
  "--elev-popover-radius",
  "--elev-popover-shadow",
  "--ember",
  "--ember-ink",
  "--ember-line",
  "--ember-soft",
  "--ease-spring",
  "--gap-ink",
  "--gap-soft",
  "--blind-ink",
  "--inset",
  "--lift-shadow",
  "--panel",
  "--primary-hover",
  "--proven",
  "--proven-soft",
  "--r-2xl",
  "--r-xl",
  "--shadow-xs",
  "--space-0-5",
  "--cat-source",
  "--cat-enrich",
  "--cat-filter",
  "--cat-generate",
  "--cat-gate",
  "--cat-execute",
  "--cat-measure",
]);

async function cssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".css") ? [fullPath] : [];
  }));
  return nested.flat();
}

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

function relativeLuminance(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value ?? "")) return null;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance == null || backgroundLuminance == null) return null;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const productionFiles = await cssFiles(productionStylesPath);
const [canonicalCss, projectionCss, ...productionCss] = await Promise.all([
  readFile(canonicalPath, "utf8"),
  readFile(projectionPath, "utf8"),
  ...productionFiles.map((filePath) => readFile(filePath, "utf8")),
]);

const canonical = tokensFrom(canonicalCss, canonicalPath);
const projection = tokensFrom(projectionCss, projectionPath);
const failures = [];

if (canonical.size < 20) {
  failures.push(`canonical token block is unexpectedly small (${canonical.size} tokens)`);
}

for (let index = 0; index < productionCss.length; index += 1) {
  const source = withoutComments(productionCss[index]);
  const relativePath = path.relative(packageDirectory, productionFiles[index]);
  for (const match of source.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
    if (!canonical.has(match[1])) {
      failures.push(`${relativePath}: undefined production token ${match[1]}`);
    }
  }
  if (/transition\s*:\s*all\b/i.test(source)) {
    failures.push(`${relativePath}: transition: all hides the causal motion contract`);
  }
  if (/animation(?:-name)?\s*:[^;]*\binfinite\b/i.test(source)) {
    failures.push(`${relativePath}: infinite animation is not an honest work receipt`);
  }
  if (/font-size\s*:\s*(?:9|10)px\b/i.test(source)) {
    failures.push(`${relativePath}: essential 9-10px text must use a readable production type token`);
  }
}

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

const essentialTextPairs = [
  ["--ink", "--room"],
  ["--ink", "--surface"],
  ["--ink-2", "--room"],
  ["--ink-2", "--surface"],
  ["--ink-3", "--surface"],
  ["--muted", "--room"],
  ["--muted", "--surface"],
  ["--link", "--surface"],
  ["--danger", "--surface"],
  ["--on-primary", "--primary"],
];
for (const [foregroundName, backgroundName] of essentialTextPairs) {
  const foreground = resolved(foregroundName, canonical);
  const background = resolved(backgroundName, canonical);
  const ratio = contrastRatio(foreground, background);
  if (ratio == null) {
    failures.push(`${foregroundName} on ${backgroundName}: contrast guard needs concrete six-digit hex tokens`);
  } else if (ratio < 4.5) {
    failures.push(`${foregroundName} on ${backgroundName}: ${ratio.toFixed(2)}:1 is below WCAG AA text contrast`);
  }
}

if (failures.length > 0) {
  console.error("Drover token parity failed. ui/src/index.css is canonical:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Drover token parity verified (${canonical.size} production tokens across ${productionFiles.length} CSS files; ${packageExtensions.size} compatibility extensions).`);
}
