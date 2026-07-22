import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const repository = path.resolve(import.meta.dirname, "..");
const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"];

function walk(directory, accept) {
  const files = [];
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(target, accept));
    else if (accept(target)) files.push(path.resolve(target));
  }
  return files;
}

function resolveLocal(from, specifier, aliasRoot = null) {
  let base = null;
  if (aliasRoot && specifier.startsWith("@/")) base = path.join(aliasRoot, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  if (!base) return null;
  return [base, ...extensions.map((extension) => `${base}${extension}`), ...extensions.map((extension) => path.join(base, `index${extension}`))]
    .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function imports(file, aliasRoot = null) {
  const source = fs.readFileSync(file, "utf8");
  const found = new Set();
  const add = (specifier) => {
    const target = resolveLocal(file, specifier, aliasRoot);
    if (target) found.add(path.resolve(target));
  };
  if (file.endsWith(".css")) {
    for (const match of source.matchAll(/@import\s+["']([^"']+)["']/g)) add(match[1]);
    return [...found];
  }
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) add(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...found];
}

function reachable(entries, aliasRoot = null) {
  const seen = new Set();
  function visit(file) {
    const exact = path.resolve(file);
    if (seen.has(exact) || !fs.existsSync(exact)) return;
    seen.add(exact);
    for (const dependency of imports(exact, aliasRoot)) visit(dependency);
  }
  for (const entry of entries) visit(entry);
  return seen;
}

const uiRoot = path.join(repository, "ui/src");
const uiProduction = walk(uiRoot, (file) => /\.(?:ts|tsx|css)$/.test(file) && !/\.(?:test|spec)\.[^.]+$/.test(file) && !file.endsWith(".d.ts") && !file.endsWith("test/setupTests.ts"));
const uiReachable = reachable([path.join(uiRoot, "main.tsx")], uiRoot);
const uiOrphans = uiProduction.filter((file) => !uiReachable.has(file));

const brainRoot = path.join(repository, "brain/src");
const brainProduction = walk(brainRoot, (file) => file.endsWith(".mjs"));
const brainReachable = reachable(["desktop-runtime.mjs", "server.mjs", "mcp.mjs"].map((file) => path.join(brainRoot, file)));
const allowedBrainOrphans = new Set([path.join(brainRoot, "firm/founding-crew.mjs")]);
const brainOrphans = brainProduction.filter((file) => !brainReachable.has(file) && !allowedBrainOrphans.has(file));

const tests = [...walk(uiRoot, (file) => /\.(?:test|spec)\.(?:ts|tsx)$/.test(file)), ...walk(path.join(repository, "brain/test"), (file) => file.endsWith(".test.mjs"))];
const brokenTests = [];
for (const test of tests) {
  const source = fs.readFileSync(test, "utf8");
  const sourceFile = ts.createSourceFile(test, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if ((specifier.startsWith(".") || specifier.startsWith("@/")) && !resolveLocal(test, specifier, test.startsWith(uiRoot) ? uiRoot : null)) brokenTests.push(`${path.relative(repository, test)} -> ${specifier}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

const failures = [
  ...uiOrphans.map((file) => `UI production orphan: ${path.relative(repository, file)}`),
  ...brainOrphans.map((file) => `Brain production orphan: ${path.relative(repository, file)}`),
  ...brokenTests.map((value) => `Broken test import: ${value}`),
];

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Runtime reachability verified (UI ${uiReachable.size} files; Brain ${brainReachable.size} modules; one explicit founding-crew compatibility helper).`);
}
