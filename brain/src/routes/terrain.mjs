// Canonical project-scoped terrain HTTP surface. GET is deterministic and read-only; POST assembles
// only the requested project's existing authorities and hands them to the provider-neutral reader.
import os from "node:os";
import { getTerrainView } from "../operating-view.mjs";
import { createTerrainReader } from "../terrain-read.mjs";
import { loadProjectReadOnly, projectAgents } from "../project-store.mjs";
import { getWorkspace } from "../workspace.mjs";
import { getProductModel } from "../product-model-store.mjs";
import { marketObjectStore, productTruthStore, resultStore } from "../gtm-store.mjs";
import { projectProductImplications } from "../outcome-ingest.mjs";
import { crewRosterStore } from "../crew-roster-store.mjs";
import { listCapabilities } from "../artifact-store.mjs";
import { loadFeedbackLedger } from "../feedback-ledger.mjs";
import { json, readBody } from "./util.mjs";

function optionalRead(fallback, read) {
  try { return read(); } catch { return fallback; }
}

function latestAt(records = []) {
  const values = records.flatMap((record) => [record?.updatedAt, record?.createdAt, record?.observedAt, record?.recordedAt, record?.at])
    .filter(Boolean)
    .map(String)
    .sort();
  return values.at(-1) ?? null;
}

function terrainDecision(decision) {
  if (/terrain/i.test(String(decision?.kind ?? ""))) return true;
  return (decision?.contextRefs ?? []).some((ref) => /terrain/i.test(String(ref?.type ?? ref ?? "")));
}

function citedEvidenceRecords(truths, projectId) {
  return truths.flatMap((truth) => (truth?.evidence ?? []).flatMap((evidence) => {
    const match = String(evidence?.source ?? "").match(/^(.*):(\d+)$/);
    if (!match) return [];
    return [{
      id: truth.id,
      projectId,
      file: match[1],
      line: Number(match[2]),
      text: evidence.claim ?? truth.statement ?? null,
    }];
  }));
}

function projectCrew(projectId, project, options) {
  const used = optionalRead([], () => projectAgents(projectId, { ...options, project }));
  const roster = optionalRead({ members: [] }, () => crewRosterStore.load(projectId, options));
  const byRef = new Map();
  for (const member of [...used, ...(roster.members ?? [])]) {
    const ref = String(member?.ref ?? "").trim();
    if (!ref) continue;
    byRef.set(ref, { ...byRef.get(ref), ...member, id: ref, ref, projectId });
  }
  return [...byRef.values()];
}

// Read-only authority assembly for one project. Missing optional authorities stay null/empty; this
// never substitutes another project's active workspace or creates a terrain lifecycle record.
export function terrainReadInputForProject(projectId, {
  model = null,
  focusRef = null,
  options = {},
  projectReader = loadProjectReadOnly,
  workspaceReader = getWorkspace,
  productModelReader = getProductModel,
  truthReader = (id, scoped) => productTruthStore.list({ ...scoped, projectId: id }),
  marketReader = (id, scoped) => marketObjectStore.list({ ...scoped, projectId: id }),
  outcomeReader = (id, scoped) => resultStore.list({ ...scoped, projectId: id }),
  implicationReader = (id, scoped) => projectProductImplications({ projectId: id }, scoped),
  feedbackReader = loadFeedbackLedger,
  crewReader = projectCrew,
  capabilityReader = listCapabilities,
} = {}) {
  const scoped = { ...options, projectId };
  const project = projectReader(scoped);
  const repository = project.sharedContext?.repository ?? {};
  const workspace = repository.workspaceId
    ? optionalRead(null, () => workspaceReader(repository.workspaceId, scoped))
    : null;
  const scan = workspace?.report ?? null;
  const productModel = optionalRead(null, () => productModelReader(projectId, scoped));
  const productTruths = optionalRead([], () => truthReader(projectId, scoped));
  const marketRecords = optionalRead([], () => marketReader(projectId, scoped));
  const joinedOutcomes = optionalRead([], () => outcomeReader(projectId, scoped));
  const implications = optionalRead([], () => implicationReader(projectId, scoped));
  const feedback = optionalRead({ signals: [], decisions: [] }, () => feedbackReader(projectId, scoped));
  const founderDecisions = Array.isArray(feedback?.decisions) ? feedback.decisions : [];
  const signals = Array.isArray(feedback?.signals) ? feedback.signals : [];
  const crew = optionalRead([], () => crewReader(projectId, project, scoped));
  const availableCapabilities = optionalRead(null, () => capabilityReader(scoped));
  const crewRefs = new Set(crew.map((member) => member.ref));
  const capabilities = availableCapabilities && typeof availableCapabilities === "object"
    ? {
        ...availableCapabilities,
        agents: (availableCapabilities.agents ?? []).filter((agent) => crewRefs.has(agent.ref)),
      }
    : null;
  const terrainDecisions = founderDecisions.filter(terrainDecision);
  const tasteRevision = latestAt([...signals, ...founderDecisions]);

  return {
    projectId,
    model,
    focusRef,
    cwd: workspace?.repo ?? repository.repo ?? os.tmpdir(),
    scan,
    scannedAt: scan?.scannedAt ?? null,
    productModel,
    productModelVersion: productModel?.version ?? productModel?.updatedAt ?? null,
    productRecords: productTruths,
    evidenceRecords: citedEvidenceRecords(productTruths, projectId),
    marketRecords,
    crew,
    capabilities,
    taste: { signals, decisions: founderDecisions, revision: tasteRevision },
    tasteRevision,
    founderDecisions,
    latestFounderTerrainDecisionAt: latestAt(terrainDecisions),
    joinedOutcomes,
    implications,
  };
}

export function createTerrainRoutes({
  projectTerrain = getTerrainView,
  projectionOptionsForProject = () => ({}),
  runTerrainRead = createTerrainReader(),
  terrainReadInput = terrainReadInputForProject,
} = {}) {
  return async function handle({ req, res, url }) {
    const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/terrain(?:\/(read))?$/);
    if (!match) return false;
    const projectId = decodeURIComponent(match[1]);

    if (req.method === "GET" && !match[2]) {
      try {
        // This hook may only return already-materialized projection inputs. It must not invoke a model
        // or write state; generated reads belong to the explicit POST integration below.
        const options = await projectionOptionsForProject(projectId);
        json(res, 200, projectTerrain({ projectId }, options ?? {}));
      } catch (err) {
        json(res, 404, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    if (req.method === "POST" && match[2]) {
      try {
        const body = await readBody(req);
        const input = terrainReadInput(projectId, { model: body.model, focusRef: body.focusRef ?? null });
        const result = await runTerrainRead(input);
        // createTerrainReader returns runtime metadata around the wire contract; injected readers may
        // return TerrainRead directly. The client always receives the TerrainRead itself.
        json(res, 200, result?.terrainRead ?? result);
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    return false;
  };
}

export default createTerrainRoutes;
