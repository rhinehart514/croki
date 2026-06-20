import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compactAgentError } from "./build.mjs";
import { scanRepo } from "./scan.mjs";

const SCHEMA_VERSION = 1;

function now() {
  return new Date().toISOString();
}

function stateRoot(options = {}) {
  return options.root || process.env.GTM_IDE_HOME || path.join(os.homedir(), ".gtm-ide");
}

function workspaceDir(options = {}) {
  return path.join(stateRoot(options), "workspaces");
}

function workspaceId(repo, outcome) {
  return crypto
    .createHash("sha256")
    .update(`${path.resolve(repo)}\0${outcome.trim()}`)
    .digest("hex")
    .slice(0, 16);
}

function workspaceFile(id, options = {}) {
  return path.join(workspaceDir(options), `${id}.json`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function summarizeRevision(revision) {
  return {
    id: revision.id,
    createdAt: revision.createdAt,
    updatedAt: revision.updatedAt,
    status: revision.status,
    branch: revision.branch,
    worktree: revision.worktree,
    diffStat: revision.diffStat,
    summary: revision.summary,
    error: revision.error,
    appliedAt: revision.appliedAt,
    revertedAt: revision.revertedAt,
  };
}

export function buildWorkspaceWorkflow(workspace) {
  const report = workspace.report;
  const gap = report?.gaps?.[0] ?? null;
  const latest = workspace.revisions.at(-1) ?? null;
  const verified = workspace.runs.findLast?.((run) => run.type === "verification")
    ?? [...workspace.runs].reverse().find((run) => run.type === "verification");

  return [
    {
      id: "inspect",
      label: "Inspect repository",
      status: report ? "complete" : "ready",
      description: report
        ? `${report.filesScanned.toLocaleString()} production files inspected.`
        : "Read production code and locate measurable GTM evidence.",
    },
    {
      id: "diagnose",
      label: "Diagnose outcome",
      status: gap ? (gap.status === "blind" ? "blocked" : "complete") : report ? "complete" : "waiting",
      description: gap?.summary ?? report?.headline ?? "Waiting for repository evidence.",
    },
    {
      id: "propose",
      label: "Create change set",
      status: latest
        ? latest.status === "failed" ? "failed" : "complete"
        : gap?.status === "proven" ? "ready" : "waiting",
      description: latest?.summary ?? "Create a narrow repair in an isolated branch and worktree.",
    },
    {
      id: "review",
      label: "Review diff",
      status: !latest
        ? "waiting"
        : latest.status === "proposed" ? "ready"
          : ["approved", "applied", "reverted"].includes(latest.status) ? "complete"
            : latest.status === "rejected" ? "blocked" : "waiting",
      description: latest
        ? `${latest.diffStat || "No file changes"} · ${latest.status}`
        : "Evidence, patch, tests, and uncertainty stay together.",
    },
    {
      id: "apply",
      label: "Apply safely",
      status: !latest ? "waiting"
        : latest.status === "approved" ? "ready"
          : latest.status === "applied" ? "complete"
            : latest.status === "reverted" ? "blocked" : "waiting",
      description: latest?.status === "applied"
        ? "The approved patch is applied to the source repository."
        : "Continue in the isolated branch or apply the approved patch locally.",
    },
    {
      id: "verify",
      label: "Verify outcome",
      status: verified ? "complete" : latest?.status === "applied" ? "ready" : "waiting",
      description: verified?.headline ?? "Rerun the repository proof after the change.",
    },
  ];
}

function hydrate(workspace) {
  const revisions = workspace.revisions.map((revision) => {
    if (revision.status !== "failed") return revision;
    return {
      ...revision,
      error: compactAgentError(revision.error)
        || "The agent stopped without producing a reviewable change.",
    };
  });
  const hydrated = { ...workspace, revisions };
  return {
    ...hydrated,
    workflow: buildWorkspaceWorkflow(hydrated),
    revisionSummaries: revisions.map(summarizeRevision),
  };
}

export function listWorkspaces(options = {}) {
  const dir = workspaceDir(options);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      try {
        const workspace = readJson(path.join(dir, name));
        return [{
          id: workspace.id,
          name: workspace.name,
          repo: workspace.repo,
          outcome: workspace.outcome,
          updatedAt: workspace.updatedAt,
          headline: workspace.report?.headline ?? "Not inspected",
          revisionCount: workspace.revisions?.length ?? 0,
        }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getWorkspace(id, options = {}) {
  const file = workspaceFile(id, options);
  if (!fs.existsSync(file)) throw new Error(`Workspace not found: ${id}`);
  return hydrate(readJson(file));
}

export function saveWorkspace(workspace, options = {}) {
  const { workflow: _workflow, revisionSummaries: _revisionSummaries, ...durable } = workspace;
  const updated = { ...durable, updatedAt: now() };
  writeJson(workspaceFile(updated.id, options), updated);
  return hydrate(updated);
}

export function openWorkspace(repoInput, outcomeInput, options = {}) {
  const repo = path.resolve(repoInput);
  const outcome = String(outcomeInput || "").trim();
  if (!outcome) throw new Error("A GTM outcome event is required.");

  const id = workspaceId(repo, outcome);
  const file = workspaceFile(id, options);
  if (fs.existsSync(file)) return hydrate(readJson(file));

  const report = scanRepo(repo, { winEvent: outcome });
  const createdAt = now();
  const workspace = {
    schemaVersion: SCHEMA_VERSION,
    id,
    name: `${path.basename(repo)} · ${outcome}`,
    repo,
    outcome,
    createdAt,
    updatedAt: createdAt,
    report,
    revisions: [],
    decisions: [],
    runs: [{
      id: `scan-${Date.now()}`,
      type: "inspection",
      createdAt,
      headline: report.headline,
      report,
    }],
  };
  return saveWorkspace(workspace, options);
}

export function rescanWorkspace(id, options = {}) {
  const workspace = getWorkspace(id, options);
  const report = scanRepo(workspace.repo, { winEvent: workspace.outcome });
  const run = {
    id: `verify-${Date.now()}`,
    type: "verification",
    createdAt: now(),
    headline: report.headline,
    report,
  };
  return saveWorkspace({
    ...workspace,
    report,
    runs: [...workspace.runs, run],
  }, options);
}

export function addRevision(id, revision, options = {}) {
  const workspace = getWorkspace(id, options);
  return saveWorkspace({
    ...workspace,
    revisions: [...workspace.revisions, revision],
  }, options);
}

export function updateRevision(id, revisionId, updater, options = {}) {
  const workspace = getWorkspace(id, options);
  let found = false;
  const revisions = workspace.revisions.map((revision) => {
    if (revision.id !== revisionId) return revision;
    found = true;
    return { ...updater(revision), updatedAt: now() };
  });
  if (!found) throw new Error(`Revision not found: ${revisionId}`);
  return saveWorkspace({ ...workspace, revisions }, options);
}

export function addDecision(id, decision, options = {}) {
  const workspace = getWorkspace(id, options);
  const entry = {
    id: decision.id || `decision-${Date.now()}`,
    createdAt: decision.createdAt || now(),
    ...decision,
  };
  return saveWorkspace({
    ...workspace,
    decisions: [...workspace.decisions, entry],
  }, options);
}

export function getWorkspaceOptions(options = {}) {
  return { root: stateRoot(options) };
}
