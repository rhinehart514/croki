import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const uiSource = path.resolve(import.meta.dirname, "../ui/src");
const canonicalPath = path.join(uiSource, "index.css");
const REQUIRED = ["--ink", "--ink-2", "--ink-3", "--room", "--surface", "--primary", "--on-primary", "--link", "--danger"];

async function cssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(target);
    return entry.isFile() && entry.name.endsWith(".css") ? [target] : [];
  }))).flat();
}

function withoutComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function firstRootBody(css) {
  const source = withoutComments(css);
  const start = source.search(/:root\s*\{/);
  if (start < 0) throw new Error(`${canonicalPath} has no :root token block.`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`${canonicalPath} has an unterminated :root token block.`);
}

function declarations(css) {
  const values = new Map();
  for (const match of withoutComments(css).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) values.set(match[1], match[2].trim());
  return values;
}

function resolved(name, tokens, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Circular token alias detected at ${name}.`);
  const value = tokens.get(name);
  if (value == null) return null;
  const alias = value.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i);
  if (!alias) return value.trim().toLowerCase().replace(/\s+/g, " ");
  return resolved(alias[1], tokens, new Set([...seen, name]));
}

function luminance(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value ?? "")) return null;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const left = luminance(foreground);
  const right = luminance(background);
  if (left == null || right == null) return null;
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

const files = await cssFiles(uiSource);
const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
const canonical = declarations(firstRootBody(await readFile(canonicalPath, "utf8")));
const declared = new Map(canonical);
for (const source of sources) for (const [name, value] of declarations(source)) declared.set(name, value);
const failures = [];

for (const name of REQUIRED) if (!canonical.has(name)) failures.push(`${name}: missing from ui/src/index.css`);
for (const name of canonical.keys()) {
  try { resolved(name, canonical); } catch (error) { failures.push(error.message); }
}

for (let index = 0; index < files.length; index += 1) {
  const source = withoutComments(sources[index]);
  const relative = path.relative(path.resolve(import.meta.dirname, ".."), files[index]);
  for (const match of source.matchAll(/var\(\s*(--[a-z0-9-]+)(\s*,[^)]*)?\)/gi)) {
    if (!declared.has(match[1]) && !match[2]) failures.push(`${relative}: unresolved token ${match[1]}`);
  }
  if (/transition\s*:\s*all\b/i.test(source)) failures.push(`${relative}: transition: all hides the causal motion contract`);
  for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/animation(?:-name)?\s*:[^;]*\binfinite\b/i.test(rule[2]) && !/(?:spinner|data-state=["']stopping)/i.test(rule[1])) {
      failures.push(`${relative}: infinite animation is not an honest work receipt (${rule[1].trim()})`);
    }
  }
}

for (const [foreground, background] of [["--ink", "--room"], ["--ink", "--surface"], ["--ink-2", "--surface"], ["--ink-3", "--surface"], ["--link", "--surface"], ["--danger", "--surface"], ["--on-primary", "--primary"]]) {
  const ratio = contrast(resolved(foreground, canonical), resolved(background, canonical));
  if (ratio == null) failures.push(`${foreground} on ${background}: contrast requires concrete six-digit hex values`);
  else if (ratio < 4.5) failures.push(`${foreground} on ${background}: ${ratio.toFixed(2)}:1 is below WCAG AA`);
}

if (failures.length) {
  console.error("Drover production token verification failed:\n");
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Drover production tokens verified (${canonical.size} canonical tokens across ${files.length} CSS files).`);
}
