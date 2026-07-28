import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicSources = [
  new URL("../src/app/page.tsx", import.meta.url),
  new URL("../src/app/layout.tsx", import.meta.url),
  new URL("../src/app/opengraph-image.tsx", import.meta.url),
  new URL("../src/content/home.ts", import.meta.url),
  new URL("../src/components/closing-sections.tsx", import.meta.url),
  new URL("../src/components/machine-canvas.tsx", import.meta.url),
  new URL("../src/components/site-header.tsx", import.meta.url),
];

test("public copy reflects the shipped desktop product", async () => {
  const source = (await Promise.all(publicSources.map((url) => readFile(url, "utf8")))).join("\n");
  const staleClaims = [
    /unified canvas is still being completed/i,
    /unified Product\/GTM canvas is in active development/i,
    /outcome-contract workflows are not yet implemented/i,
    /heat can still wake work unattended/i,
    /macOS or Linux box/i,
    /keep the safe work moving, even (?:after|across) a restart/i,
    /build tools stop at ['"]it's live/i,
    /Croki gets it used/i,
    /find(?:s)? (?:its|the) first users/i,
    /Product\s*\/\s*GTM/i,
  ];
  for (const claim of staleClaims) assert.doesNotMatch(source, claim);
  for (const currentTruth of [
    "founder-native coding environment",
    "Direct Claude and Codex",
    "One outcome. One Thread.",
    "selected model",
    "product context",
  ]) {
    assert.match(source, new RegExp(currentTruth.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});
