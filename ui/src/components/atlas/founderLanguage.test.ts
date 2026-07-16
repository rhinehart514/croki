import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const FORBIDDEN = /\b(?:bets?|motions?|fork(?:s|ed|ing)?|outcomes?|pipeline|stages?|staged|work items?)\b|\bthe wall\b/i;
const INTERNAL_TOKEN = /^(?:bet|bets|motion|motions|outcome|outcomes|stage|staged|fork|forks)$/;
const CODE_TOKEN = /^\.?[a-z0-9]+(?:-[a-z0-9]+)+(?:\s+[a-z0-9]+(?:-[a-z0-9]+)+)*$/;

function filesUnder(directory: string): string[] {
  return readdirSync(resolve(process.cwd(), directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return filesUnder(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const PRODUCTION_SURFACES = filesUnder("src")
  .filter((path) => !/\.(?:test|spec)\.[^.]+$/.test(path) && !path.endsWith(".d.ts"));

function productOwnedPhrases(source: string) {
  const values: Array<{ text: string; rendered: boolean }> = [];
  const file = ts.createSourceFile("surface.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const publicAttribute = (node: ts.Node) => {
    const attribute = ts.isJsxAttribute(node.parent)
      ? node.parent
      : ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent)
        ? node.parent.parent
        : null;
    if (!attribute) return null;
    const name = attribute.name.getText(file);
    return ["aria-label", "title", "placeholder", "alt"].includes(name) ? name : "implementation";
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) values.push({ text: node.getText(file), rendered: true });
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const attribute = publicAttribute(node);
      if (attribute !== "implementation") {
        values.push({ text: node.text, rendered: Boolean(attribute || ts.isJsxExpression(node.parent)) });
      }
    }
    else if (ts.isTemplateExpression(node)) {
      const property = ts.isPropertyAssignment(node.parent) ? node.parent.name.getText(file) : null;
      if (property !== "id" && property !== "key") {
        values.push({
          text: [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" "),
          rendered: publicAttribute(node) !== "implementation" && ts.isJsxExpression(node.parent),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return values
    .map(({ text, rendered }) => ({ value: text.replace(/\$\{[^}]+\}/g, " ").trim(), rendered }))
    .filter(({ value, rendered }) => value && (rendered || !INTERNAL_TOKEN.test(value)))
    .filter(({ value, rendered }) => rendered || (!value.includes("/") && !value.includes(":")))
    .filter(({ value, rendered }) => rendered || !CODE_TOKEN.test(value))
    .filter(({ value }) => !value.startsWith("(") && !value.includes("[data-"))
    .filter(({ value, rendered }) => rendered || /[\s.!?…]/.test(value) || /^[A-Z]/.test(value))
    .map(({ value }) => value);
}

function assertedProductCopy(source: string) {
  const fixtureValues = new Set([...source.matchAll(/\b(?:intent|truth|summary|detail|content|label)\s*:\s*["'`]([^"'`\n]+)["'`]/g)]
    .map((match) => match[1]));
  return [...source.matchAll(/(?:getByText|getByLabelText|findByText|findByLabelText|toHaveTextContent)\(\s*["'`]([^"'`\n]+)["'`]/g)]
    .map((match) => match[1])
    .filter((value) => !fixtureValues.has(value));
}

describe("founder language across production UI", () => {
  it("names concrete work and consequences instead of internal machinery", () => {
    const violations = PRODUCTION_SURFACES.flatMap((path) => productOwnedPhrases(
      readFileSync(resolve(process.cwd(), path), "utf8"),
    ).filter((phrase) => FORBIDDEN.test(phrase)).map((phrase) => `${path}: ${phrase}`));
    expect(violations).toEqual([]);
  });

  it("keeps rendered-copy assertions in the same founder register", () => {
    const tests = filesUnder("src").filter((path) => /\.(?:test|spec)\.[^.]+$/.test(path));
    const violations = tests.flatMap((path) => assertedProductCopy(
      readFileSync(resolve(process.cwd(), path), "utf8"),
    ).filter((phrase) => FORBIDDEN.test(phrase)).map((phrase) => `${path}: ${phrase}`));
    expect(violations).toEqual([]);
  });
});
