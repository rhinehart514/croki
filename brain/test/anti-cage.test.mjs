// anti-cage.test.mjs — regression guard for the open node model invariant.
//
// AGENTS.md invariant (the doctrine this protects):
//   "A workflow is composed from open step kinds; the connector taxonomy is an optional
//    label, never the thing that limits what the agent can express."
//   "Grounding does not shape. Reading the codebase must not collapse the product into
//    outbound, accelerator, or any other direction."
//
// This file statically scans the engine's brain/src source files and FAILS if it detects
// re-introduction of a caged taxonomy. Three specific patterns are guarded:
//
//   GUARD A — No hardcoded closed GTM channel enum.
//     The engine must never branch on a fixed list of channel names like
//     ["cold-email", "linkedin", "outbound"]. The connectors/ directory is the one
//     place that names specific third-party tools (Exa, Clay, etc.) — that's the
//     tool-kind label bucket, exempt here. But graph.mjs, graph-operations.mjs,
//     step-runners.mjs, and source-entry.mjs must not contain a closed channel array.
//
//   GUARD B — No output-kind-only-email/message assumption in the graph engine.
//     The graph model and validation must not treat "email" or "message" as the ONLY
//     allowed output kind. A recipe's config value like { channel: "email" } is a
//     data value in a specific workflow — that's fine; workflow-recipes.mjs is not the
//     engine. But if the engine starts doing `outputKind === "email"` or
//     `node.config.channel === "message"` as a validation gate, that cages the model.
//
//   GUARD C — No fixed stage skeleton re-encoded as live data in the composition/engine path.
//     The old skeleton "context + source -> agent1 -> ... -> founder-gate -> output -> measure"
//     was removed. It survives only in a comment in composition.mjs (describing what was
//     removed). It must not reappear as a hardcoded node array or ordered stage list in
//     graph.mjs, graph-operations.mjs, step-runners.mjs, composition.mjs, or source-entry.mjs.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SRC = path.resolve(import.meta.dirname, "../src");

function readSrc(filename) {
  return fs.readFileSync(path.join(SRC, filename), "utf8");
}

// Strip single-line and block comments before scanning for code patterns. This lets
// us keep a pattern in a comment (e.g. the composition.mjs removal note) without
// triggering a false positive, while still catching the pattern in live code.
function stripComments(src) {
  // Remove block comments first (/* ... */), then single-line (//)
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

// ─── Files under guard ────────────────────────────────────────────────────────
// These are the core engine files that must stay open. workflow-recipes.mjs and
// connectors/ are intentionally excluded: recipes are individual workflow data (not
// validation rules), and connectors/ is the tool-kind label bucket by design.

const CORE_ENGINE_FILES = [
  "graph.mjs",
  "graph-operations.mjs",
  "step-runners.mjs",
  "source-entry.mjs",
  "composition.mjs",
];

// ─── Guard A: No closed GTM channel enum ─────────────────────────────────────

describe("anti-cage: no closed GTM channel enum in the core engine", () => {
  // A closed channel list is a JS array literal that contains at least two of these
  // GTM channel name strings together. The presence of one string in a comment or
  // variable name is fine; it's the CLOSED ARRAY LITERAL that cages the model.
  const CAGE_CHANNEL_STRINGS = [
    "cold-email",
    "cold_email",
    "linkedin",
    "outbound",
    "cold-outbound",
    "cold_outbound",
    "twitter",
    "inmail",
    "sms",
  ];

  for (const filename of CORE_ENGINE_FILES) {
    it(`${filename} does not contain a closed GTM channel array literal`, () => {
      const raw = readSrc(filename);
      const src = stripComments(raw);

      // Count how many cage channel strings appear in the code (not comments).
      // If two or more appear within a single array literal context, that's a
      // closed channel enum. We look for any bracket-enclosed cluster.
      const hits = CAGE_CHANNEL_STRINGS.filter((name) =>
        src.includes(`"${name}"`) || src.includes(`'${name}'`)
      );

      // One channel name appearing in isolation (e.g. a recipe default, a variable name)
      // is not a closed enum. Two or more in the same file signals a list — fail hard.
      assert.ok(
        hits.length < 2,
        `${filename} contains what looks like a closed GTM channel enum in non-comment code: [${hits.join(", ")}]. ` +
        `A fixed channel list in the engine cages the model. See AGENTS.md: "the connector taxonomy ` +
        `is an optional label, never the thing that limits what the agent can express."`
      );
    });
  }
});

// ─── Guard B: No output-kind-only-email/message equality check in engine code ─

describe("anti-cage: no output-kind hardcoded to email/message in engine validation", () => {
  // These are the patterns that would bake in an email/message-only assumption.
  // We specifically look for equality comparisons, not mere string presence in data
  // values (a recipe config with channel:"email" is data, not a constraint).
  const CAGE_OUTPUT_KIND_PATTERNS = [
    // Strict equality checks against a channel or output kind name
    /===\s*["']email["']/,
    /===\s*["']message["']/,
    /["']email["']\s*===/,
    /["']message["']\s*===/,
    // An outputKind field being narrowed to a single named channel
    /outputKind\s*===\s*["']/,
    /node\.config\.channel\s*===\s*["']/,
    // Switch/if branching on an output channel type in a structural gate
    /if\s*\([^)]*channel[^)]*===\s*["']email["']/,
    /if\s*\([^)]*channel[^)]*===\s*["']message["']/,
  ];

  // The engine files where this would be a real violation. workflow-recipes.mjs is
  // intentionally excluded — recipe data values are not engine constraints.
  const ENGINE_VALIDATION_FILES = [
    "graph.mjs",
    "graph-operations.mjs",
    "step-runners.mjs",
    "source-entry.mjs",
  ];

  for (const filename of ENGINE_VALIDATION_FILES) {
    it(`${filename} does not gate on outputKind === "email" or "message" only`, () => {
      const src = stripComments(readSrc(filename));

      const violations = CAGE_OUTPUT_KIND_PATTERNS.filter((pattern) => pattern.test(src));

      assert.equal(
        violations.length,
        0,
        `${filename} contains an output-kind equality check that assumes email or message is the only ` +
        `output: ${violations.map((p) => p.toString()).join(", ")}. ` +
        `Output kind must be open — any GTM motion (code change, community, content, in-product) ` +
        `is a valid output. See AGENTS.md invariant: "A workflow is composed from open step kinds."`
      );
    });
  }

  // E3.2: the open outputKind field (E3.1) must never be narrowed into a CLOSED enum. The hint
  // list is a hint; turning it into a membership gate (includes/indexOf, or wrapping it in a Set
  // used to reject unknown kinds) re-cages output. This is the exact regression E3.1 exists to prevent.
  it("graph-operations.mjs keeps outputKind open (no closed-set validation against the hints)", () => {
    const src = stripComments(readSrc("graph-operations.mjs"));
    const CLOSED_SET_PATTERNS = [
      /OUTPUT_KIND_HINTS\s*\.\s*(includes|indexOf|has)\s*\(/,
      /new\s+Set\s*\(\s*OUTPUT_KIND_HINTS/,
      /OUTPUT_KINDS\s*=\s*new\s+Set/,
    ];
    const violations = CLOSED_SET_PATTERNS.filter((pattern) => pattern.test(src));
    assert.equal(
      violations.length,
      0,
      `graph-operations.mjs narrows outputKind into a closed enum (${violations.map((p) => p.toString()).join(", ")}). ` +
      `OUTPUT_KIND_HINTS is a hint, never a validation gate — any non-empty label must validate (E3.1).`
    );
  });
});

// ─── Guard C: Fixed stage skeleton not re-encoded as live code ────────────────

describe("anti-cage: fixed stage skeleton not re-introduced as live code", () => {
  // The old skeleton was: context + source -> agents -> gate -> output -> measure
  // It was explicitly removed. It may survive as a COMMENT (composition.mjs has one
  // describing the old shape that was removed) — but it must not reappear as a
  // hardcoded node category sequence in an array literal or ordered structure.
  //
  // We look for the specific pattern: a code array that includes both "source" and
  // "measure" in a fixed ordered list with at least 4 stage names between them.
  // That's the signature of the old skeleton being re-baked in.
  //
  // The NODE_CATEGORIES set in graph-operations.mjs lists all valid categories —
  // that's structural metadata, not a skeleton (it doesn't encode an ordered pipeline).
  // We allow that pattern: a Set of category names without a pipeline ordering.

  const SKELETON_STAGE_SEQUENCE = [
    // Detect an array/sequence that encodes the fixed pipeline: source → gate → measure
    // in order. We look for a literal array containing ≥3 of these in pipeline order.
    /\[\s*["']source["'][^]*["']gate["'][^]*["']measure["']/,
    /\[\s*["']context["'][^]*["']source["'][^]*["']gate["'][^]*["']measure["']/,
    /\[\s*["']source["'][^]*["']enrich["'][^]*["']filter["'][^]*["']generate["'][^]*["']gate["']/,
  ];

  const FIXED_SKELETON_FILES = [
    "graph.mjs",
    "graph-operations.mjs",
    "step-runners.mjs",
    "source-entry.mjs",
    "composition.mjs",
  ];

  for (const filename of FIXED_SKELETON_FILES) {
    it(`${filename} does not re-encode the old fixed stage skeleton as a live code array`, () => {
      const src = stripComments(readSrc(filename));

      const violations = SKELETON_STAGE_SEQUENCE.filter((pattern) => pattern.test(src));

      assert.equal(
        violations.length,
        0,
        `${filename} appears to re-encode the old fixed stage skeleton in a code array. ` +
        `The skeleton "source → gate → measure" was intentionally removed. ` +
        `See composition.mjs comment and AGENTS.md: "Composition is not a fixed skeleton."` +
        ` Matched: ${violations.map((p) => p.toString()).join(", ")}`
      );
    });
  }

  // Bonus check: the word "skeleton" appearing in COMPOSE_PROMPT or related runtime strings
  // would be a signal that the skeleton was brought back as an instruction to the model.
  // The current COMPOSE_PROMPT explicitly tells the model NOT to default to any fixed shape.
  it("composition.mjs COMPOSE_PROMPT tells the model zero fixed shape (not prescribing the skeleton)", () => {
    const src = readSrc("composition.mjs");
    // The prompt must contain an explicit anti-cage instruction.
    assert.ok(
      src.includes("ZERO fixed shape") || src.includes("zero fixed shape") || src.includes("no fixed shape"),
      `composition.mjs COMPOSE_PROMPT must explicitly tell the composing model not to default to ` +
      `a fixed pipeline shape. This is the primary defense against the old skeleton creeping back ` +
      `in via the model's own defaults. Add "ZERO fixed shape" or equivalent to the prompt.`
    );
    // And it must not reintroduce the old skeleton as a positive instruction to follow
    assert.ok(
      !src.includes("source -> agents -> gate -> output -> measure") ||
      src.includes("Do NOT default to source"),
      `composition.mjs appears to prescribe the old fixed skeleton to the composing model without ` +
      `an explicit negation. The skeleton string may only appear in a "do NOT do this" context.`
    );
  });
});
