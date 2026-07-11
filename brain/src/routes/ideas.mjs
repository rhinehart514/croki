// Ideas — the durable home for graded ideation output. The FOUNDER door: list, trigger a fresh round,
// kill the weak ones, keep the strong ones. Moved verbatim out of server.mjs. Deliberately ABSENT from
// the MCP agent surface: the generator never grades, kills, or keeps its own ideas — only the founder.
import { json, readBody } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import { buildRunGrounding } from "../run-grounding.mjs";
import { composeIdeas, createClaudeAngleProposer, createClaudeIdeaGenerator } from "../ideation.mjs";
import { createClaudeIdeaBar } from "../idea-bar.mjs";
import { createGtmIdea, getGtmIdea, saveGtmIdea, listGtmIdeas } from "../idea-store.mjs";
import { recordIdeaDecisions } from "../feedback-ledger.mjs";
import { authorizeFounderWriteForRequest } from "./session-guard.mjs";

function ideaInProject(idea, projectId) {
  if ((idea?.projectId ?? null) !== projectId) {
    const error = new Error(`GtmIdea not found in project ${projectId}.`);
    error.status = 404;
    throw error;
  }
  return idea;
}

export default async function handle({ req, res, url }) {
  // Ideas — the durable home for graded ideation output (idea-store.mjs). This is the FOUNDER door:
  // list what was generated, kill the weak ones, keep the strong ones, and trigger a fresh round. Killing
  // and keeping are founder acts — they bank an IdeaKill / IdeaKeep FeedbackSignal so idea-taste rides the
  // feedback rail. These routes are deliberately ABSENT from the MCP agent surface: the generator never
  // grades, kills, or keeps its own ideas — only the founder does.
  const projectIdeasMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/ideas$/);
  if (req.method === "GET" && projectIdeasMatch) {
    try {
      const projectId = decodeURIComponent(projectIdeasMatch[1]);
      const goal = url.searchParams.get("goal");
      const ideas = listGtmIdeas({ projectId })
        .filter((idea) => !goal || idea.goal === goal);
      json(res, 200, { ideas });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Trigger an ideation round for a goal — delegates to the ideate path (composeIdeas): derive this
  // goal's own angles, generate wide across them, measure distinctiveness, then a SEPARATE bar grades
  // the survivors. Each graded idea is persisted as a durable GtmIdea (cut ideas keep their plain cut
  // reason). Nothing sends; this only generates and grades.
  const projectIdeaRoundMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/ideas\/round$/);
  if (req.method === "POST" && projectIdeaRoundMatch) {
    try {
      const projectId = decodeURIComponent(projectIdeaRoundMatch[1]);
      const body = await readBody(req);
      const goal = String(body?.goal || "").trim();
      if (!goal) { json(res, 400, { error: "An ideation round needs a goal." }); return true; }
      const project = loadProject({ projectId });
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      const result = await composeIdeas({
        goal,
        grounding: buildRunGrounding(project),
        proposeAngles: createClaudeAngleProposer({ cwd: repo }),
        generate: createClaudeIdeaGenerator({ cwd: repo }),
        bar: createClaudeIdeaBar({ cwd: repo }),
      });
      const ideas = result.ideas.map((graded) => createGtmIdea({
        projectId,
        goal,
        angle: graded.angle,
        pitch: graded.pitch,
        what: graded.what,
        upside: graded.upside,
        risk: graded.risk,
        take: graded.take,
        killReason: graded.killReason,
        barScore: graded.barScore,
        axes: graded.axes,
        verdict: graded.verdict,
        killed: graded.killed,
      }));
      json(res, 200, { ideas, distinctiveness: result.distinctiveness, regenerated: result.regenerated });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Kill an idea — a FOUNDER act. The idea is marked dead in its durable store AND an IdeaKill
  // FeedbackSignal is banked on the feedback rail. A kill is dead, not deprioritized.
  const projectIdeaKillMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/ideas\/([^/]+)\/kill$/);
  if (req.method === "POST" && projectIdeaKillMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Killing an idea");
      const projectId = decodeURIComponent(projectIdeaKillMatch[1]);
      const ideaId = decodeURIComponent(projectIdeaKillMatch[2]);
      const idea = ideaInProject(getGtmIdea(ideaId), projectId);
      const updated = saveGtmIdea({ ...idea, verdict: "killed", killed: true });
      recordIdeaDecisions({ projectId, decisions: [{ idea: updated, decision: "kill" }] }, { projectId });
      json(res, 200, { idea: updated });
    } catch (err) {
      json(res, Number.isInteger(err?.status) ? err.status : 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Keep an idea — a FOUNDER act that affirms a survivor and banks an IdeaKeep FeedbackSignal. It refuses
  // to keep a killed idea: a kill is dead, and keep never resurrects it.
  const projectIdeaKeepMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/ideas\/([^/]+)\/keep$/);
  if (req.method === "POST" && projectIdeaKeepMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Keeping an idea");
      const projectId = decodeURIComponent(projectIdeaKeepMatch[1]);
      const ideaId = decodeURIComponent(projectIdeaKeepMatch[2]);
      const idea = ideaInProject(getGtmIdea(ideaId), projectId);
      if (idea.killed) {
        json(res, 409, { error: `GtmIdea ${ideaId} was killed; a killed idea is not kept.` });
        return true;
      }
      const updated = saveGtmIdea({ ...idea, verdict: "survived", killed: false });
      recordIdeaDecisions({ projectId, decisions: [{ idea: updated, decision: "keep" }] }, { projectId });
      json(res, 200, { idea: updated });
    } catch (err) {
      json(res, Number.isInteger(err?.status) ? err.status : 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
