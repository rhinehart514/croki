// Crew routes — "+ build a teammate with Claude". `compose` drafts a teammate from a sentence (Claude,
// nothing written); `add` persists the accepted draft as a real ~/.claude/agents/<ref>.md file AND puts
// it on this project's crew roster so it shows up on the bench immediately, before its first run. The
// gate is the founder's accept: nothing lands on disk until they add it.
import { json, readBody } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import { crewRosterStore } from "../crew-roster-store.mjs";
import { createCrewComposer } from "../crew-composer.mjs";
import { writeArtifact, readArtifact, isValidRef } from "../artifact-store.mjs";

function productRepo(project) {
  return project?.sharedContext?.repository?.repo || process.cwd();
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
      if (!description) { json(res, 400, { error: "Say what you need this teammate to do." }); return true; }
      const compose = createCrewComposer({ cwd: productRepo(project) });
      const draft = await compose({ description, product: productName(project) });
      const ref = uniqueRef(isValidRef(draft.ref) ? draft.ref : "teammate");
      json(res, 200, { draft: { ...draft, ref } });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const addMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/crew\/add$/);
  if (req.method === "POST" && addMatch) {
    try {
      const projectId = decodeURIComponent(addMatch[1]);
      loadProject({ projectId });
      const body = await readBody(req);
      const ref = String(body?.ref ?? "").trim();
      const markdown = String(body?.markdown ?? "").trim();
      const description = String(body?.description ?? "").trim();
      if (!isValidRef(ref)) { json(res, 400, { error: "That teammate id isn't valid." }); return true; }
      if (!markdown) { json(res, 400, { error: "That teammate has no definition to save." }); return true; }
      writeArtifact("agent", ref, markdown);
      crewRosterStore.add(projectId, { ref, description });
      json(res, 200, { ok: true, member: { ref, description } });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
