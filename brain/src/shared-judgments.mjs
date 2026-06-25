// The shared taste ledger — one notebook of founder decisions, read and written by both rigs.
//
// The GTM IDE learns the founder's taste from gate decisions (memory.mjs). The global Claude
// setup learns it from AskUserQuestion picks (the judgment-log.py hook). Those were two separate
// notebooks, so the founder's taste — the one asset that compounds and that competitors cannot
// copy — grew at half speed. This module makes the IDE write every gate decision into the same
// file the global rig uses (~/.leverage/store/judgments.jsonl) and read it back, so taste from
// either rig feeds the other.
//
// Contract: ~/.agents/global/HARNESS.md, invariant 4 ("one taste ledger"). The envelope is
// { ts, source }; gate records carry their own draft-decision fields.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractDecisions } from "./memory.mjs";

// Where the shared ledger lives. In production both rigs point at the real leverage store. In
// tests, options.root (the sandbox temp dir every test sets) redirects it there, so a test run
// never touches the founder's real taste file.
export function sharedJudgmentsPath(options = {}) {
  if (options.judgmentsPath) return options.judgmentsPath;
  if (process.env.GTM_IDE_JUDGMENTS_PATH) return process.env.GTM_IDE_JUDGMENTS_PATH;
  if (options.root) return path.join(options.root, "leverage", "judgments.jsonl");
  return path.join(os.homedir(), ".leverage", "store", "judgments.jsonl");
}

// Append a run's founder gate decisions to the shared ledger. Reuses memory.extractDecisions so
// the IDE logs exactly what it learns from — no second parser to drift. An edited-then-approved
// item logs once, as an "edited" record carrying both the original and the founder's rewrite
// (the strongest taste signal). Never throws: capturing taste must not break a run.
export function appendGateJudgments({ projectId = "default", graph = null, result = null } = {}, options = {}) {
  if (!result) return { appended: 0 };
  const decisions = extractDecisions([{ result }], { limit: 50 });
  const editedTo = new Map(decisions.edits.map((e) => [e.to, e.from]));
  const ts = new Date().toISOString();
  const graphId = graph?.id ?? result?.graphId ?? null;
  const session = result?.runId ?? "";
  const lines = [];
  const record = (status, draft, extra = {}) => {
    const rejected = status === "rejected";
    lines.push(JSON.stringify({
      ts,
      source: "gtm-ide-gate",
      session,
      project: projectId,
      graphId,
      question: `GTM gate decision${extra.name ? ` — ${extra.name}` : ""}`,
      options: ["approve", "reject"],
      picked: [rejected ? "reject" : "approve"],
      declined: [rejected ? "approve" : "reject"],
      reason: "",
      status,
      draft,
      ...extra,
    }));
  };
  for (const a of decisions.approved) {
    if (editedTo.has(a.draft)) {
      record("edited", a.draft, { ...(a.name ? { name: a.name } : {}), editedFrom: editedTo.get(a.draft) });
    } else {
      record("approved", a.draft, a.name ? { name: a.name } : {});
    }
  }
  for (const r of decisions.rejected) record("rejected", r.draft, r.name ? { name: r.name } : {});
  if (!lines.length) return { appended: 0 };
  const file = sharedJudgmentsPath(options);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${lines.join("\n")}\n`);
  } catch {
    return { appended: 0 };
  }
  return { appended: lines.length, file };
}

// Read the shared ledger back into the same { approved, rejected, edits } shape memory.mjs uses,
// newest first. Only voice-bearing records (those carrying a `draft`) count — AskUserQuestion
// option-picks are choices, not writing samples, so they never pollute the draft voice guidance.
export function loadSharedDecisions(options = {}, { limit = 5 } = {}) {
  const file = sharedJudgmentsPath(options);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return { approved: [], rejected: [], edits: [] };
  }
  const approved = [];
  const rejected = [];
  const edits = [];
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const draft = typeof rec.draft === "string" ? rec.draft : null;
    if (!draft) continue;
    const name = rec.name ?? null;
    if (rec.status === "rejected") {
      if (rejected.length < limit) rejected.push({ name, draft });
    } else if (rec.status === "edited") {
      if (approved.length < limit) approved.push({ name, draft });
      if (typeof rec.editedFrom === "string" && rec.editedFrom && edits.length < limit) {
        edits.push({ from: rec.editedFrom, to: draft });
      }
    } else if (approved.length < limit) {
      approved.push({ name, draft });
    }
    if (approved.length >= limit && rejected.length >= limit && edits.length >= limit) break;
  }
  return { approved, rejected, edits };
}

// Merge this project's own gate decisions with the shared ledger (the global rig + other
// projects), the project's own first so its voice dominates and the rest fills remaining slots.
// Deduped by draft text. When the shared ledger is empty (a fresh test sandbox) this returns the
// local decisions unchanged, so existing taste behavior is preserved exactly.
export function mergeSharedDecisions(local = {}, options = {}, { limit = 5 } = {}) {
  const shared = loadSharedDecisions(options, { limit });
  const dedup = (a, b, keyFn) => {
    const seen = new Set();
    const out = [];
    for (const item of [...a, ...b]) {
      const key = keyFn(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= limit) break;
    }
    return out;
  };
  return {
    approved: dedup(local.approved ?? [], shared.approved, (d) => d.draft),
    rejected: dedup(local.rejected ?? [], shared.rejected, (d) => d.draft),
    edits: dedup(local.edits ?? [], shared.edits, (e) => `${e.from}=>${e.to}`),
  };
}
