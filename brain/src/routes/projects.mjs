// Project lifecycle + identity/teams + People + shared-context reads/writes. Moved verbatim out of
// server.mjs.
import path from "node:path";
import { json, readBody, expandHome } from "./util.mjs";
import {
  createProject,
  getProjectWithChannels,
  listProjects,
  groundProjectInWorkspace,
  loadProject,
  setActiveChannel,
  setActiveWorkflow,
  setActiveProject,
  updateSharedContext,
} from "../project-store.mjs";
import { deleteProject, mergeProjects } from "../project-merge.mjs";
import {
  addMember,
  canApprove,
  createTeam,
  ensurePersonalTeam,
  getTeam,
  listMembers,
  listTeams,
  resolveCurrentUser,
  teamsForUser,
} from "../team-store.mjs";
import { openWorkspace } from "../workspace.mjs";
import { listPeople, getPerson } from "../person-store.mjs";
import { executeDomainCommand } from "../domain-commands.mjs";
import { createClaudeProductModeler } from "../product-model-generator.mjs";

// Fire-and-forget: after a project is grounded or activated, derive its interpretive product model
// in the background so the picture panel and run grounding are populated without the founder having
// to click "derive". NON-BLOCKING and error-swallowing — a failed derive must never break grounding.
// Skipped when there is no real repo to read (a blank cwd would be a pointless model call).
function kickProductModelDerive(project, repo) {
  if (!project?.id) return;
  const cwd = typeof repo === "string" ? repo.trim() : "";
  if (!cwd || cwd === process.cwd()) return;
  Promise.resolve()
    .then(() =>
      executeDomainCommand(
        "DeriveProductModel",
        { projectId: project.id },
        { projectId: project.id, generate: createClaudeProductModeler({ cwd }) },
      ),
    )
    .catch(() => {});
}

export default async function handle({ req, res, url }) {
  // Multi-channel project
  if (req.method === "GET" && url.pathname === "/api/projects") {
    try { json(res, 200, listProjects()); }
    catch (err) { json(res, 500, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    try {
      const body = await readBody(req);
      const workspace = openWorkspace(expandHome(body.repoPath), body.outcome || body.winEvent);
      const name = String(body.name || path.basename(workspace.repo)).trim();
      // Reuse an existing project for the same repo instead of spawning a duplicate (rodentradar-2,
      // -3…). Pointing twice at the same product re-grounds and re-activates the one project.
      const existing = (listProjects().projects || []).find((p) => p.repo === workspace.repo);
      if (existing) {
        setActiveProject(existing.id);
        const project = groundProjectInWorkspace(workspace, { projectId: existing.id });
        json(res, 200, { project, workspace, activeProjectId: existing.id });
        kickProductModelDerive(project, workspace.repo);
        return true;
      }
      const created = createProject({ name });
      const project = groundProjectInWorkspace(workspace, { projectId: created.project.id });
      json(res, 201, { project, workspace, activeProjectId: created.project.id });
      kickProductModelDerive(project, workspace.repo);
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const activateProjectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/activate$/);
  if (req.method === "POST" && activateProjectMatch) {
    try {
      const project = setActiveProject(decodeURIComponent(activateProjectMatch[1]));
      json(res, 200, { project, activeProjectId: project.id });
      kickProductModelDerive(project, project.sharedContext?.repository?.repo || process.cwd());
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Identity + teams. Local-first stays the base: with no signed-in user every request resolves to the
  // founder, so a solo founder sees no login wall. Real multi-user auth rides on Convex in the other
  // lane; these routes only model identity-as-data and membership.

  // The current user and the teams they belong to. The personal team is created lazily so this never
  // returns an empty list for a fresh founder.
  if (req.method === "GET" && url.pathname === "/api/me") {
    try {
      const user = resolveCurrentUser({ request: req });
      ensurePersonalTeam(user, { request: req });
      json(res, 200, { user, teams: teamsForUser(user.userId, { request: req }) });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/teams") {
    try { json(res, 200, { teams: listTeams() }); }
    catch (err) { json(res, 500, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/teams") {
    try {
      const body = await readBody(req);
      const team = createTeam({ ...body, owner: body.owner ?? resolveCurrentUser({ request: req }) }, { request: req });
      json(res, 201, { team });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const teamMatch = url.pathname.match(/^\/api\/teams\/([^/]+)$/);
  if (req.method === "GET" && teamMatch) {
    try { json(res, 200, { team: getTeam(decodeURIComponent(teamMatch[1])) }); }
    catch (err) { json(res, 404, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  const teamMembersMatch = url.pathname.match(/^\/api\/teams\/([^/]+)\/members$/);
  if (req.method === "GET" && teamMembersMatch) {
    try { json(res, 200, { members: listMembers(decodeURIComponent(teamMembersMatch[1])) }); }
    catch (err) { json(res, 404, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  if (req.method === "POST" && teamMembersMatch) {
    try {
      const body = await readBody(req);
      const team = addMember(decodeURIComponent(teamMembersMatch[1]), body);
      json(res, 201, { team, members: team.members });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Whether a user may clear a founder gate on a team (owner/approver yes, member no). The gate lane
  // reads this; the gate itself still owns the wall.
  const teamApproveMatch = url.pathname.match(/^\/api\/teams\/([^/]+)\/can-approve\/([^/]+)$/);
  if (req.method === "GET" && teamApproveMatch) {
    try {
      const teamId = decodeURIComponent(teamApproveMatch[1]);
      const userId = decodeURIComponent(teamApproveMatch[2]);
      json(res, 200, { teamId, userId, canApprove: canApprove(teamId, userId) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Fold duplicate projects into one (one project per repo). Records move; sources are dropped.
  if (req.method === "POST" && url.pathname === "/api/projects/merge") {
    try {
      const body = await readBody(req);
      const sourceIds = Array.isArray(body.sourceIds) ? body.sourceIds : [body.sourceId].filter(Boolean);
      mergeProjects(sourceIds, body.targetId, { projectId: body.targetId });
      json(res, 200, listProjects());
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Remove a project and purge its per-project stores. The last project can't be deleted.
  const deleteProjectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === "DELETE" && deleteProjectMatch) {
    try {
      deleteProject(decodeURIComponent(deleteProjectMatch[1]));
      json(res, 200, listProjects());
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // People — the keystone object, promoted from real run entrants. Read-only: the canvas reads
  // appearances, dedup, and fatigue from here; nothing here writes or sends.
  const projectPeopleMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/people$/);
  if (req.method === "GET" && projectPeopleMatch) {
    try {
      const projectId = decodeURIComponent(projectPeopleMatch[1]);
      json(res, 200, { projectId, people: listPeople(projectId) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const projectPersonMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/people\/([^/]+)$/);
  if (req.method === "GET" && projectPersonMatch) {
    try {
      const projectId = decodeURIComponent(projectPersonMatch[1]);
      const personId = decodeURIComponent(projectPersonMatch[2]);
      const person = getPerson(projectId, personId);
      if (!person) { json(res, 404, { error: `Person not found: ${personId}` }); return true; }
      json(res, 200, { projectId, person });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/project") {
    try {
      json(res, 200, { project: getProjectWithChannels() });
    } catch (err) { json(res, 500, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/project/context") {
    const project = loadProject();
    // The `contacts` stub is now backed by the durable Person store. We surface People as a derived,
    // read-only field on shared context (never persisted into the project file, so it can never be
    // seeded) while keeping the legacy `contacts` shape intact for existing readers.
    const people = listPeople(project.id);
    json(res, 200, { sharedContext: { ...project.sharedContext, people } }); return true;
  }

  if (req.method === "POST" && url.pathname === "/api/project/context") {
    try {
      const body = await readBody(req);
      const project = updateSharedContext(body.patch ?? body);
      json(res, 200, { sharedContext: project.sharedContext, updatedAt: project.updatedAt });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/project/active-channel") {
    try {
      const body = await readBody(req);
      const project = setActiveChannel(body.channelId);
      json(res, 200, { activeChannelId: project.activeChannelId });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/project/active-workflow") {
    try {
      const body = await readBody(req);
      const project = setActiveWorkflow(body.workflowId ?? body.channelId);
      json(res, 200, { activeWorkflowId: project.activeChannelId, activeChannelId: project.activeChannelId });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
