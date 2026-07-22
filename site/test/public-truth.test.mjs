import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicSources = [
  new URL("../src/app/page.tsx", import.meta.url),
  new URL("../src/content/home.ts", import.meta.url),
  new URL("../src/components/closing-sections.tsx", import.meta.url),
];

test("public copy reflects the shipped desktop product", async () => {
  const source = (await Promise.all(publicSources.map((url) => readFile(url, "utf8")))).join("\n");
  const staleClaims = [
    /unified canvas is still being completed/i,
    /unified Product\/GTM canvas is in active development/i,
    /outcome-contract workflows are not yet implemented/i,
    /heat can still wake work unattended/i,
    /macOS or Linux box/i,
  ];
  for (const claim of staleClaims) assert.doesNotMatch(source, claim);
  for (const currentTruth of [
    "Move faster than the market can react",
    "Product models can change",
    "Unscalable work is first-class",
    "Native Claude/Codex work",
  ]) {
    assert.match(source, new RegExp(currentTruth.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});
