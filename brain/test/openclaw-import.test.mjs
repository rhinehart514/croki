// openclaw-import.test.mjs — importing an OpenClaw agent workspace as a teammate template.
//
// Covers the four load-bearing guarantees: (1) parsing derives identity + turns MEMORY into blessed
// soul lessons and .learnings into scratch, both stamped source:"imported"; (2) the imported toolset
// is forced down to the read-only allowlist — a send/deploy capability can never cross; (3) import is
// draft-only (parsing/drafting persists nothing); (4) on accept the imported lessons seed a LIBRARY
// template soul and the project instance inherits the blessed ones.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  parseOpenClawWorkspace,
  createOpenClawDraft,
  applyImportedSoul,
  splitWorkspaceText,
  importFromDirectory,
} from "../src/openclaw-import.mjs";
import { patternKeyFor } from "../src/teammate-soul.mjs";
import { teammateSoulStore as store, LIBRARY_PROJECT } from "../src/teammate-soul-store.mjs";

const SAMPLE = {
  soul: `---\nname: Outreach Scout\nrole: Finds and verifies real buyers before you ever send.\n---\n\n# Outreach Scout\n\nYou hunt down the real people behind a buying trigger and confirm they exist.`,
  agents: `# How I work\n\nYou take a buyer trigger, find the real accounts behind it, and return a short verified list. You never guess an email — you confirm it or drop the row.`,
  memory: `# Durable rules\n\n- Always verify an email before it counts as a real contact — a guessed address burns the sender\n- Prefer the owner over a generic inbox\n- Never invent a company that you could not confirm exists`,
  tools: `# Tools\n\n- Read\n- Bash\n- Write\n- Deploy`,
  learnings: `# On probation\n\n- Buffalo dentists respond better to a first-name subject line`,
};

// Isolated on-disk root per test, same convention as the soul-store suite.
function withRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-import-"));
  const opts = { root, backend: "json" };
  try {
    return run(opts);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("openclaw-import: parsing a workspace", () => {
  it("derives name, description, and a system prompt from SOUL/AGENTS", () => {
    const parsed = parseOpenClawWorkspace(SAMPLE);
    assert.equal(parsed.name, "Outreach Scout");
    assert.equal(parsed.ref, "outreach-scout");
    assert.match(parsed.description, /finds and verifies real buyers/i);
    assert.match(parsed.systemPrompt, /verified list/i);
  });

  it("maps each durable MEMORY rule to a blessed soul lesson (source: imported)", () => {
    const parsed = parseOpenClawWorkspace(SAMPLE);
    assert.equal(parsed.promoted.length, 3);
    for (const lesson of parsed.promoted) {
      assert.equal(lesson.source, "imported");
      assert.ok(lesson.patternKey && lesson.text);
    }
    // The "— why" clause is split off the rule.
    const verify = parsed.promoted.find((l) => /verify an email/i.test(l.text));
    assert.ok(verify);
    assert.match(verify.why, /burns the sender/i);
    // Pattern key is stable — the deterministic fallback the store keys on.
    assert.equal(verify.patternKey, patternKeyFor(verify.text));
  });

  it("maps .learnings to scratch learnings (source: imported), still on probation", () => {
    const parsed = parseOpenClawWorkspace(SAMPLE);
    assert.equal(parsed.scratch.length, 1);
    assert.equal(parsed.scratch[0].source, "imported");
    assert.match(parsed.scratch[0].text, /first-name subject line/i);
  });

  it("forces the imported toolset down to the read-only allowlist — send/deploy dropped", () => {
    const parsed = parseOpenClawWorkspace(SAMPLE);
    assert.deepEqual(parsed.tools.allowed.sort(), ["Bash", "Read"]);
    assert.ok(parsed.tools.dropped.includes("Write"));
    assert.ok(parsed.tools.dropped.includes("Deploy"));
    assert.ok(!parsed.tools.allowed.includes("Write"));
    assert.ok(!parsed.tools.allowed.includes("Deploy"));
  });

  it("imports thin (no fabricated lessons) when MEMORY/.learnings are absent", () => {
    const parsed = parseOpenClawWorkspace({ soul: "# Bare Agent\n\nDoes one thing." });
    assert.equal(parsed.promoted.length, 0);
    assert.equal(parsed.scratch.length, 0);
    // No TOOLS.md → conservative read-only default, never empty.
    assert.ok(parsed.tools.allowed.length > 0);
    assert.deepEqual(parsed.tools.dropped, []);
  });
});

describe("openclaw-import: draft shape", () => {
  it("createOpenClawDraft carries the lessons and puts the reduced tools in the agent markdown", () => {
    const draft = createOpenClawDraft(parseOpenClawWorkspace(SAMPLE));
    assert.equal(draft.source, "openclaw");
    assert.equal(draft.importedPromoted.length, 3);
    assert.equal(draft.importedScratch.length, 1);
    assert.match(draft.markdown, /^tools: Read, Bash$/m);
    assert.doesNotMatch(draft.markdown, /Deploy|Write/);
  });

  it("splitWorkspaceText routes a single combined paste into its files", () => {
    const combined = [
      "# SOUL.md",
      "name: Pasted One",
      "=== MEMORY.md ===",
      "- Keep it short",
      "--- TOOLS.md ---",
      "- Read",
    ].join("\n");
    const files = splitWorkspaceText(combined);
    assert.match(files.soul, /Pasted One/);
    assert.match(files.memory, /Keep it short/);
    assert.match(files.tools, /Read/);
    // With no markers the whole paste is SOUL.
    assert.equal(splitWorkspaceText("just some text").soul, "just some text");
  });

  it("importFromDirectory reads a real workspace off disk, missing files empty", () => {
    withRoot(() => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-ws-"));
      fs.writeFileSync(path.join(dir, "SOUL.md"), "# Disk Agent\n\nReal.");
      fs.mkdirSync(path.join(dir, ".learnings"));
      fs.writeFileSync(path.join(dir, ".learnings", "LEARNINGS.md"), "- probation rule");
      const files = importFromDirectory(dir);
      assert.match(files.soul, /Disk Agent/);
      assert.match(files.learnings, /probation rule/);
      assert.equal(files.memory, "");
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });
});

describe("openclaw-import: draft-only + seeding on accept", () => {
  it("parsing/drafting persists nothing — the store is untouched until accept", () => {
    withRoot((opts) => {
      const draft = createOpenClawDraft(parseOpenClawWorkspace(SAMPLE));
      assert.equal(store.get(LIBRARY_PROJECT, draft.ref, opts), null);
      assert.equal(store.get("proj-x", draft.ref, opts), null);
    });
  });

  it("seeds a LIBRARY template soul with imported lessons; the instance inherits the blessed ones", () => {
    withRoot((opts) => {
      const parsed = parseOpenClawWorkspace(SAMPLE);
      // Mirror the /crew/add accept path: ensure template, seed imported lessons, birth the instance.
      const template = store.ensure(LIBRARY_PROJECT, parsed.ref, { name: parsed.name }, opts);
      store.save(applyImportedSoul(template, { promoted: parsed.promoted, scratch: parsed.scratch }), opts);
      const instance = store.ensure("proj-x", parsed.ref, { templateRef: parsed.ref, name: parsed.name }, opts);

      const savedTemplate = store.get(LIBRARY_PROJECT, parsed.ref, opts);
      assert.equal(savedTemplate.soul.length, 3, "durable MEMORY rules land in the permanent soul");
      assert.equal(savedTemplate.learnings.length, 1, "probation rule lands in scratch");
      assert.ok(savedTemplate.soul.every((e) => e.source === "imported"));

      // The instance inherits the blessed soul lessons, but not the still-probation scratch.
      assert.equal(instance.soul.length, 3);
      assert.ok(instance.soul.every((e) => e.inherited));
      assert.equal(instance.learnings.length, 0);
    });
  });

  it("applyImportedSoul is idempotent — re-seeding never duplicates a lesson", () => {
    withRoot((opts) => {
      const parsed = parseOpenClawWorkspace(SAMPLE);
      const t1 = store.ensure(LIBRARY_PROJECT, parsed.ref, { name: parsed.name }, opts);
      const seeded = store.save(applyImportedSoul(t1, { promoted: parsed.promoted, scratch: parsed.scratch }), opts);
      const reSeeded = applyImportedSoul(seeded, { promoted: parsed.promoted, scratch: parsed.scratch });
      assert.equal(reSeeded.soul.length, 3);
      assert.equal(reSeeded.learnings.length, 1);
    });
  });
});
