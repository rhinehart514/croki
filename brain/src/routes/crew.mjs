// Crew routes — "+ build a teammate with Claude". `compose` drafts a teammate from a sentence (Claude,
// nothing written); `add` persists the accepted draft as a real ~/.claude/agents/<ref>.md file AND puts
// it on this project's crew roster so it shows up on the bench immediately, before its first run. The
// gate is the founder's accept: nothing lands on disk until they add it.
import { json, readBody } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import { crewRosterStore } from "../crew-roster-store.mjs";
import { teammateSoulStore, LIBRARY_PROJECT } from "../teammate-soul-store.mjs";
import { deriveVoiceBrief } from "../teammate-soul.mjs";
import { createCrewComposer, draftToMarkdown } from "../crew-composer.mjs";
import { parseOpenClawWorkspace, importFromDirectory, createOpenClawDraft, applyImportedSoul } from "../openclaw-import.mjs";
import { writeArtifact, readArtifact, isValidRef } from "../artifact-store.mjs";
import { authorizeFounderWriteForRequest } from "./session-guard.mjs";

function productRepo(project) {
  return project?.sharedContext?.repository?.repo || process.cwd();
}

// Project one teammate's soul into the founder's plain-words view. Everything a founder can read is
// plain language about what the teammate learned from THEM and how it has done — never a raw prompt,
// never a raw ref, never a machinery key. The graduation candidates carry `patternKey` only as an
// opaque handle for the promote/dismiss call; it is never meant to be rendered (a lesson's `text` is
// the plain wording the founder reads). Real signals only: a teammate with no soul shows nothing —
// no fabricated name, no fake counts, empty lists — never a seeded zero dressed up as a fact.
function plainLesson(entry) {
  return { text: String(entry?.text || "").trim(), why: String(entry?.why || "").trim() };
}

function teammateFounderView(projectId, ref) {
  const soul = teammateSoulStore.get(projectId, ref);
  if (!soul) {
    return { name: null, record: { runs: 0, sent: 0, replies: 0, wins: 0 }, learned: [], stillFiguring: [], ready: [] };
  }
  // Promoted, permanent lessons (includes lessons inherited from the reusable template) — "what it's
  // learned from you." Scratch lessons still earning their place are split: the ones that have met the
  // graduation bar and await the founder's blessing ("ready"), and the rest still on watch ("still
  // figuring out"). Dismissed and already-promoted scratch entries appear in neither.
  const learned = (Array.isArray(soul.soul) ? soul.soul : []).map(plainLesson).filter((l) => l.text);
  const ready = teammateSoulStore.listReady(projectId, ref);
  const readyKeys = new Set(ready.map((l) => l.patternKey));
  const stillFiguring = (Array.isArray(soul.learnings) ? soul.learnings : [])
    .filter((l) => l && l.status === "watching" && !readyKeys.has(l.patternKey))
    .map(plainLesson)
    .filter((l) => l.text);
  // How the teammate SOUNDS and where it STANDS, surfaced only through the founder-safe derived brief —
  // never the raw soul.voice or any prompt/soul internal. `standing` is derived read-only from the real
  // record; `voice` is register + first-person stance; `convictions` are the plain graduated lessons.
  const brief = deriveVoiceBrief(soul, {});
  return {
    name: soul.name || null,
    record: {
      runs: soul.record?.runs ?? 0,
      sent: soul.record?.sent ?? 0,
      replies: soul.record?.replies ?? 0,
      wins: soul.record?.wins ?? 0,
    },
    standing: brief.standing,
    voice: { register: brief.register, stance: brief.stance },
    convictions: brief.convictions,
    learned,
    stillFiguring,
    ready: ready.map((l) => ({ text: String(l.text || "").trim(), why: String(l.why || "").trim(), patternKey: l.patternKey })),
  };
}

function productName(project) {
  return project?.name || project?.sharedContext?.product?.name || "";
}

// A fresh teammate must not clobber an existing agent on disk: keep the composed ref, else suffix -2, -3…
// until it's free.
function uniqueRef(ref) {
  let candidate = ref;
  for (let i = 2; i <= 50 && readArtifact("agent", candidate).exists; i += 1) candidate = `${ref}-${i}`;
  return candidate;
}

export default async function handle({ req, res, url }) {
  const composeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/crew\/compose$/);
  if (req.method === "POST" && composeMatch) {
    try {
      const projectId = decodeURIComponent(composeMatch[1]);
      const project = loadProject({ projectId });
      const body = await readBody(req);
      const description = String(body?.description ?? "").trim();
      const instruction = String(body?.instruction ?? "").trim();
      const current = body?.current && typeof body.current === "object" ? body.current : null;
      const baseRef = String(body?.baseRef ?? "").trim();
      if (!description && !instruction && !current && !baseRef) {
        json(res, 400, { error: "Say what you need this teammate to do." });
        return true;
      }
      // Fork: load the existing teammate's definition so Claude adapts a real starting point.
      let base = null;
      if (baseRef && isValidRef(baseRef)) {
        const art = readArtifact("agent", baseRef);
        if (art.exists) base = { ref: baseRef, definition: art.content };
      }
      const compose = createCrewComposer({ cwd: productRepo(project) });
      const draft = await compose({ description, instruction, current, base, product: productName(project) });
      // Refine keeps the draft's own ref; a fresh/forked one must not clobber an existing agent on disk.
      const ref = current?.ref === draft.ref ? draft.ref : uniqueRef(isValidRef(draft.ref) ? draft.ref : "teammate");
      json(res, 200, { draft: { ...draft, ref } });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Import an OpenClaw agent workspace into a teammate DRAFT. Same wall as compose: this returns a
  // draft only and persists NOTHING — the founder accepts on /crew/add. Accepts { files:{...} } (the
  // per-file text), { text } (one combined paste the server splits), or { dirPath } (read off disk).
  const importMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/crew\/import$/);
  if (req.method === "POST" && importMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Importing a teammate definition");
      const projectId = decodeURIComponent(importMatch[1]);
      loadProject({ projectId });
      const body = await readBody(req);
      let input = null;
      if (body?.files && typeof body.files === "object") input = body.files;
      else if (typeof body?.text === "string" && body.text.trim()) input = body.text;
      else if (typeof body?.dirPath === "string" && body.dirPath.trim()) input = importFromDirectory(body.dirPath.trim());
      if (!input) {
        json(res, 400, { error: "Paste your OpenClaw agent files (SOUL.md, AGENTS.md, MEMORY.md, TOOLS.md) or point at a folder." });
        return true;
      }
      const parsed = parseOpenClawWorkspace(input);
      // A fresh import must not clobber an existing agent on disk.
      const ref = uniqueRef(isValidRef(parsed.ref) ? parsed.ref : "imported-teammate");
      json(res, 200, { draft: createOpenClawDraft({ ...parsed, ref }) });
    } catch (err) {
      json(res, Number.isInteger(err?.status) ? err.status : 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const addMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/crew\/add$/);
  if (req.method === "POST" && addMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Saving a teammate");
      const projectId = decodeURIComponent(addMatch[1]);
      loadProject({ projectId });
      const body = await readBody(req);
      const ref = String(body?.ref ?? "").trim();
      const name = String(body?.name ?? "").trim();
      const description = String(body?.description ?? "").trim();
      const systemPrompt = String(body?.systemPrompt ?? "").trim();
      // The founder-safe voice seed the composer drafted (register + first-person stance). Stamped onto
      // the soul below; setVoice normalizes and no-ops on empty, so a voice-less accept is fine.
      const voice = body?.voice && typeof body.voice === "object" ? body.voice : null;
      if (!isValidRef(ref)) { json(res, 400, { error: "That teammate id isn't valid." }); return true; }
      if (!name && !description && !systemPrompt) { json(res, 400, { error: "That teammate has no definition to save." }); return true; }
      // Build the file from the (possibly founder-edited) fields, so an inline rename or tweak sticks.
      writeArtifact("agent", ref, draftToMarkdown({ ref, name, description, systemPrompt }));
      crewRosterStore.add(projectId, { ref, name, description });
      // Register the teammate as a reusable TEMPLATE in the library (thin if brand-new; a no-op if it
      // already exists) so future projects can inherit whatever it graduates, then birth this project's
      // INSTANCE — which starts carrying the template's already-graduated lessons. Never fabricates
      // lessons: a brand-new teammate's template and instance are both born thin.
      const template = teammateSoulStore.ensure(LIBRARY_PROJECT, ref, { name });
      // An OpenClaw import carries real earned memory: durable rules seed the template's permanent soul
      // (source:"imported", never a fabricated gate signal), probation learnings seed its scratch. Seed
      // the template BEFORE birthing the instance so the instance inherits the imported soul lessons.
      const importedPromoted = Array.isArray(body?.importedPromoted) ? body.importedPromoted : [];
      const importedScratch = Array.isArray(body?.importedScratch) ? body.importedScratch : [];
      if (importedPromoted.length || importedScratch.length) {
        teammateSoulStore.save(applyImportedSoul(template, { promoted: importedPromoted, scratch: importedScratch }, { now: Date.now() }));
      }
      // Stamp the founder-safe voice onto the reusable TEMPLATE (after any imported-soul save, so it is
      // not clobbered) so future projects inherit how it sounds. No-op on empty.
      teammateSoulStore.setVoice(LIBRARY_PROJECT, ref, voice);
      teammateSoulStore.ensure(projectId, ref, { templateRef: ref, name });
      // And onto THIS project's instance, so it can narrate in its own voice from its very first run.
      teammateSoulStore.setVoice(projectId, ref, voice);
      json(res, 200, { ok: true, member: { ref, description } });
    } catch (err) {
      json(res, Number.isInteger(err?.status) ? err.status : 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // The founder-view of one teammate's soul: its track record and the lessons it has learned from the
  // founder, in plain words. Read-only; never emits a prompt or a raw ref. A teammate with no soul yet
  // reads honestly (null name, zero record, empty lists) — the UI shows nothing rather than a fake.
  const profileMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/crew\/([^/]+)\/profile$/);
  if (req.method === "GET" && profileMatch) {
    try {
      const projectId = decodeURIComponent(profileMatch[1]);
      const ref = decodeURIComponent(profileMatch[2]);
      if (!isValidRef(ref)) { json(res, 400, { error: "That teammate id isn't valid." }); return true; }
      json(res, 200, { profile: teammateFounderView(projectId, ref) });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // The founder's blessing: make a ready-to-graduate lesson a permanent part of this teammate. Only the
  // founder's explicit tap promotes it (the wall) — a lesson never hardens on its own. Returns the fresh
  // founder-view so the surface updates in place.
  const promoteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/crew\/([^/]+)\/promote$/);
  if (req.method === "POST" && promoteMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Promoting a teammate lesson");
      const projectId = decodeURIComponent(promoteMatch[1]);
      const ref = decodeURIComponent(promoteMatch[2]);
      if (!isValidRef(ref)) { json(res, 400, { error: "That teammate id isn't valid." }); return true; }
      const body = await readBody(req);
      const patternKey = String(body?.patternKey ?? "").trim();
      if (!patternKey) { json(res, 400, { error: "Which lesson should become permanent?" }); return true; }
      teammateSoulStore.promote(projectId, ref, patternKey);
      json(res, 200, { profile: teammateFounderView(projectId, ref) });
    } catch (err) {
      json(res, Number.isInteger(err?.status) ? err.status : 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // "Not yet": the founder sets a ready lesson aside. It stops asking to graduate but nothing is lost —
  // real signals still accrue against it. Returns the fresh founder-view.
  const dismissMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/crew\/([^/]+)\/dismiss$/);
  if (req.method === "POST" && dismissMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Dismissing a teammate lesson");
      const projectId = decodeURIComponent(dismissMatch[1]);
      const ref = decodeURIComponent(dismissMatch[2]);
      if (!isValidRef(ref)) { json(res, 400, { error: "That teammate id isn't valid." }); return true; }
      const body = await readBody(req);
      const patternKey = String(body?.patternKey ?? "").trim();
      if (!patternKey) { json(res, 400, { error: "Which lesson should be set aside?" }); return true; }
      teammateSoulStore.dismiss(projectId, ref, patternKey);
      json(res, 200, { profile: teammateFounderView(projectId, ref) });
    } catch (err) {
      json(res, Number.isInteger(err?.status) ? err.status : 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
