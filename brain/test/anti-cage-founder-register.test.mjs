// anti-cage-founder-register.test.mjs — the founder never reads machinery.
//
// Doctrine ("agnostic within GTM", AGENTS.md register boundary): every string a founder can see is
// plain words about what happened, what exists, or what to decide. Engine vocabulary — face, kernel,
// operator-as-a-noun, bar scores, generator slugs, raw prompts — is machinery register and shipped on
// founder surfaces at least once ("blind at this face" copy, decimal bar scores, the five-face strip)
// while the anti-cage suite scanned only brain/src engine files. This file scans ui/src so those exact
// patterns cannot silently ship again.
//
// Guard style: comments are stripped first, so code comments (which legitimately use engineering
// register — that is what the register boundary allows) never trip a guard. What remains is string
// literals and JSX text — the founder-visible surface. Each pattern is the EXACT shape that shipped,
// kept narrow on purpose: a guard that cries wolf gets deleted, and then nothing guards.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const UI_SRC = path.resolve(import.meta.dirname, "../../ui/src");

// Every .ts/.tsx source file under ui/src (skip type-noise like .d.ts — declarations render nothing).
function uiSourceFiles() {
  const files = [];
  for (const entry of fs.readdirSync(UI_SRC, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!/\.(ts|tsx)$/.test(name) || name.endsWith(".d.ts")) continue;
    files.push(path.join(entry.parentPath ?? entry.path, name));
  }
  return files.sort();
}

// Strip /* */ blocks (covers JSX {/* */} bodies) and // line comments. The // strip is guarded so a
// "://" inside a URL string survives — only a real comment tail is removed.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

function rel(file) {
  return path.relative(UI_SRC, file);
}

// Scan every ui source file for a pattern; return "file: matched-text" hits.
function scanUi(pattern) {
  const hits = [];
  for (const file of uiSourceFiles()) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    const match = src.match(pattern);
    if (match) hits.push(`${rel(file)}: ${JSON.stringify(match[0].trim().slice(0, 80))}`);
  }
  return hits;
}

describe("anti-cage: no fixed journey skeleton presented on a founder surface", () => {
  it("ui/src has no array literal of ordered stage display labels (a permanent journey skeleton)", () => {
    // The signature of the shipped cage: an ordered array of ≥3 capitalized stage LABELS presented to
    // the founder as the permanent shape of every pipeline. A per-category label MAP (label whatever
    // categories the composed graph happens to use) is fine — it projects the graph's own steps. An
    // ORDERED ARRAY of display labels is the skeleton.
    const STAGE_LABEL = `["'](?:Ground|Source|Enrich|Draft|Gate|Send|Measure|Learn)["']`;
    const skeleton = new RegExp(`\\[\\s*(?:${STAGE_LABEL}\\s*,\\s*){2,}${STAGE_LABEL}`);
    const hits = scanUi(skeleton);
    assert.deepEqual(
      hits, [],
      `A fixed stage-label array is presented as a permanent journey skeleton:\n  ${hits.join("\n  ")}\n` +
      `The canvas projects the graph's OWN composed steps — never a hardcoded journey. ` +
      `Doctrine: agnostic within GTM (the five-face strip skeleton shipped exactly this way).`,
    );
  });
});

describe("anti-cage: founder surfaces speak plain words, not machinery register", () => {
  // The exact machinery phrases that shipped on founder surfaces. Multi-word on purpose: they can
  // only match inside string literals or JSX text (identifiers have no spaces), so a code comment or
  // a variable named operatorSession never trips them.
  const BANNED_PHRASES = [
    { pattern: /\bblind at this \w+/i, name: `"blind at this …" engine-state copy`, instead: `say what is missing in plain words (e.g. "No way to tie a reply back to this send yet")` },
    { pattern: /\bat this face\b/i, name: `"at this face" engine-state copy`, instead: `name the step by what the founder does there, not by the engine's face vocabulary` },
    { pattern: /\bshared kernel\b/i, name: `"shared kernel" copy`, instead: `say what it is for the founder (e.g. "what your pipelines share")` },
    { pattern: /\bthe operator\b/i, name: `"the operator" copy`, instead: `name what actually acts for the founder (e.g. "Claude", "your co-pilot", or the run itself)` },
    { pattern: />\s*(?:derived|blind)\s*</i, name: `bare "derived"/"blind" badge text`, instead: `say where the fact comes from ("from your code", "from your runs") or what is missing, in plain words` },
  ];

  for (const { pattern, name, instead } of BANNED_PHRASES) {
    it(`ui/src renders no ${name}`, () => {
      const hits = scanUi(pattern);
      assert.deepEqual(
        hits, [],
        `Machinery register on a founder surface — ${name}:\n  ${hits.join("\n  ")}\n` +
        `Founder strings are plain words about what happened or what to decide; ${instead}. ` +
        `Doctrine: agnostic within GTM / AGENTS.md register boundary.`,
      );
    });
  }

  it("ui/src never renders a raw barScore or decimal grading score", () => {
    // The internal grade is judgment plumbing; the founder reads the check's one plain sentence
    // (take/killReason), never "6.8". Sorting BY barScore is fine — printing it is the cage.
    const patterns = [
      /\{\s*[\w.?!]*barScore[\w.?!]*\s*\}/, // {idea.barScore} interpolated straight into JSX
      /barScore[\w.?!]*\.toFixed/, // formatted for display
      /\$\{[^}\n]*barScore[^}\n]*\}/, // template-string display
    ];
    const hits = patterns.flatMap((p) => scanUi(p));
    assert.deepEqual(
      hits, [],
      `A raw internal score is rendered on a founder surface:\n  ${hits.join("\n  ")}\n` +
      `The founder reads the check's plain-words take, never the number that produced it.`,
    );
  });

  it("ui/src never renders a raw generator slug as a chip or label", () => {
    // "generated by contrarian-generator" is provenance plumbing. The idea speaks for itself; what
    // KIND of move it is comes from the generator's own plain words (the `what` field), not its slug.
    const patterns = [
      /\{\s*[\w.?!]*\.generator\b[^}\n]*\}/,
      /\$\{[^}\n]*\.generator\b[^}\n]*\}/,
    ];
    const hits = patterns.flatMap((p) => scanUi(p));
    assert.deepEqual(
      hits, [],
      `A raw generator slug is rendered on a founder surface:\n  ${hits.join("\n  ")}\n` +
      `Show the generator's own plain words about the idea, never its internal name.`,
    );
  });

  it("ui/src never carries or renders the brain's prompt doctrine", () => {
    // The steering prompts (COMPOSE_PROMPT, PROPOSE_ANGLES_PROMPT, …) are the model's instructions,
    // not founder reading. They live in brain/src; the UI must not import, mirror, or print them.
    const patterns = [
      /\b[A-Z][A-Z_]*_PROMPT\b/, // a doctrine constant leaking into the UI at all
      /\{\s*[\w.?!]*(?:steeringPrompt|systemPrompt|rawPrompt)\b[^}\n]*\}/i, // a prompt field rendered
    ];
    const hits = patterns.flatMap((p) => scanUi(p));
    assert.deepEqual(
      hits, [],
      `A raw steering prompt reaches a founder surface:\n  ${hits.join("\n  ")}\n` +
      `Prompts are machinery; the founder sees what the model produced and what to decide, never its instructions.`,
    );
  });
});
