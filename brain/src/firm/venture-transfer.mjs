// Portable venture transfer contract. The source machine contributes durable venture truth only:
// paths, provider sessions, credentials, live worktrees, and reusable template lessons do not travel.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  exportVenture,
  importVenture,
  listVentures,
  openVenture,
  setVentureDoc,
  VENTURE_COLLECTIONS,
} from "./venture-store.mjs";

export const VENTURE_TRANSFER_FORMAT = "drover-venture-transfer";
export const VENTURE_TRANSFER_VERSION = 1;

const MACHINE_KEYS = new Set([
  "cwd",
  "repo",
  "repository",
  "repositorypath",
  "reporoot",
  "root",
  "runtimesessionid",
  "worktree",
  "worktreepath",
]);

function isMachineKey(key) {
  return MACHINE_KEYS.has(String(key).replace(/[^a-z]/gi, "").toLowerCase());
}

function withoutMachineState(value) {
  if (Array.isArray(value)) return value.map(withoutMachineState);
  if (!value || typeof value !== "object") return value;
  const portable = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isMachineKey(key)) portable[key] = withoutMachineState(entry);
  }
  return portable;
}

function portableBet(bet) {
  const clean = withoutMachineState(bet);
  const work = bet?.work && typeof bet.work === "object"
    ? { ...withoutMachineState(bet.work), providerResume: "cold" }
    : clean.work;
  const staged = (clean.staged ?? []).map((artifact) => artifact?.kind === "product-change"
    ? { ...artifact, transferState: "needs-refork" }
    : artifact);
  return { ...clean, ...(work ? { work } : {}), ...(clean.staged ? { staged } : {}) };
}

function portableProductChange(workspace) {
  const clean = withoutMachineState(workspace);
  const revisions = (workspace?.revisions ?? []).map((revision) => {
    const portable = withoutMachineState(revision);
    const needsRefork = revision?.transferState === "needs-refork"
      || (Boolean(revision?.worktree || revision?.sourceReceiptId)
        && ["proposed", "approved", "applying"].includes(revision?.status));
    return {
      ...portable,
      ...(needsRefork
        ? { status: "needs-refork", transferredStatus: revision.transferredStatus ?? revision.status }
        : {}),
      worktreeStatus: needsRefork ? "needs-refork" : "not-transferred",
      transferState: needsRefork ? "needs-refork" : "history-only",
    };
  });
  return {
    ...clean,
    transferState: revisions.some((revision) => revision.transferState === "needs-refork")
      ? "needs-refork"
      : "history-only",
    revisions,
  };
}

function portableDecision(decision) {
  const clean = withoutMachineState(decision);
  return clean.effect?.kind === "product-change"
    ? { ...clean, effect: { ...clean.effect, transferState: "needs-refork" } }
    : clean;
}

function portableDocuments(documents = {}) {
  return Object.fromEntries(Object.entries(withoutMachineState(documents)).map(([collection, docs]) => {
    if (collection === "bets") return [collection, (docs ?? []).map(portableBet)];
    if (collection === "productChanges") return [collection, (docs ?? []).map(portableProductChange)];
    if (collection === "decisions") return [collection, (docs ?? []).map(portableDecision)];
    return [collection, docs];
  }));
}

export function createVentureTransfer(ventureId, options = {}) {
  if (!openVenture(ventureId, options)) {
    throw transferError(`No such venture: ${ventureId}`, "venture_not_found", 404);
  }
  const bundle = exportVenture(ventureId, options);
  const manifest = withoutMachineState(bundle.manifest);
  return {
    format: VENTURE_TRANSFER_FORMAT,
    version: VENTURE_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    venture: {
      manifest,
      documents: portableDocuments(bundle.documents),
      souls: withoutMachineState(bundle.souls ?? []),
    },
    resume: {
      provider: "cold",
      productChanges: "refork-required",
      destinationRepository: "rebind-required",
    },
  };
}

function transferError(message, code = "venture_transfer_invalid", status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function validateTransfer(file) {
  if (file?.format !== VENTURE_TRANSFER_FORMAT || file?.version !== VENTURE_TRANSFER_VERSION) {
    throw transferError("This is not a supported Drover venture transfer file.");
  }
  const ventureId = String(file?.venture?.manifest?.id ?? "").trim();
  if (!ventureId || !String(file?.venture?.manifest?.name ?? "").trim()) {
    throw transferError("The transfer file is missing its venture identity.");
  }
  if (file.venture.manifest.repository || file.venture.manifest.repo) {
    throw transferError("The transfer file contains a source-machine repository path.");
  }
  const collections = Object.keys(file.venture.documents ?? {});
  const unknownCollection = collections.find((collection) => !VENTURE_COLLECTIONS.includes(collection));
  if (unknownCollection) {
    throw transferError(`Transfer collection ${unknownCollection} is not supported by this version.`);
  }
  for (const [collection, docs] of Object.entries(file.venture.documents ?? {})) {
    if (!Array.isArray(docs)) throw transferError(`Transfer collection ${collection} must be a list.`);
    for (const doc of docs) {
      assertVentureScope(doc, ventureId);
      if (collection === "productChanges" && doc?.id && !String(doc.id).startsWith(`${ventureId}__`)) {
        throw transferError("A product-change workspace belongs to a different venture.", "venture_transfer_cross_scope", 404);
      }
    }
  }
  if (file.venture.souls != null && !Array.isArray(file.venture.souls)) {
    throw transferError("Transferred teammate records must be a list.");
  }
  for (const soul of file.venture.souls ?? []) {
    assertVentureScope(soul, ventureId, { requireVentureId: true });
  }
  validateTransferredArchitecture(file.venture.documents ?? {}, ventureId);
  return ventureId;
}

function validateTransferredArchitecture(documents, ventureId) {
  const atlas = (documents.architecture ?? []).find((entry) => entry?.current);
  if (!atlas) return;
  const current = atlas.current;
  if (current.ventureId !== ventureId) {
    throw transferError("Transferred architecture belongs to a different venture.", "venture_transfer_cross_scope", 404);
  }
  const elements = new Map((current.elements ?? []).map((entry) => [entry.id, entry]));
  const betIds = new Set((documents.bets ?? []).map((entry) => entry.id));
  const outcomeIds = new Set((documents.outcomes ?? []).map((entry) => entry.id));
  const hasArchitectureRef = (ref) => elements.has(String(ref ?? "").replace(/^architecture:/, "").split("#")[0]);
  for (const element of elements.values()) {
    if (element.role === "motion") {
      if ((element.systemIds ?? []).some((id) => elements.get(id)?.role !== "system")) {
        throw transferError("Transferred motion references a missing system.", "venture_transfer_cross_scope", 404);
      }
      if ((element.productRefs ?? []).some((ref) => elements.get(String(ref).split("#")[0])?.role !== "product-loop")) {
        throw transferError("Transferred motion references a missing product loop.", "venture_transfer_cross_scope", 404);
      }
    }
    if (element.role === "campaign") {
      if (elements.get(element.primaryMotionId)?.role !== "motion"
        || !(element.motionIds ?? []).every((id) => elements.get(id)?.role === "motion")
        || !betIds.has(element.governingBetId)
        || !(element.supportingBetIds ?? []).every((id) => betIds.has(id))) {
        throw transferError("Transferred campaign references missing venture records.", "venture_transfer_cross_scope", 404);
      }
    }
  }
  for (const connection of current.connections ?? []) {
    if (!hasArchitectureRef(connection.fromRef) || !hasArchitectureRef(connection.toRef)) {
      throw transferError("Transferred architecture connection has a missing target.", "venture_transfer_cross_scope", 404);
    }
  }
  for (const group of current.groups ?? []) {
    if (!(group.memberRefs ?? []).every(hasArchitectureRef)) {
      throw transferError("Transferred architecture group has a missing target.", "venture_transfer_cross_scope", 404);
    }
  }
  for (const annotation of current.evidenceAnnotations ?? []) {
    const outcomeId = String(annotation.evidenceRef ?? "").replace(/^outcome:/, "");
    const repositoryEvidence = annotation.basis === "repository-citation" && String(annotation.evidenceRef ?? "").startsWith("repository:");
    if (!hasArchitectureRef(annotation.subjectRef) || (!repositoryEvidence && !outcomeIds.has(outcomeId))) {
      throw transferError("Transferred architecture evidence has a missing source.", "venture_transfer_cross_scope", 404);
    }
  }
}

function assertVentureScope(value, ventureId, { requireVentureId = false } = {}) {
  let foundVentureId = false;
  function visit(entry) {
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    if (!entry || typeof entry !== "object") return;
    for (const [key, nested] of Object.entries(entry)) {
      if (key === "ventureId") {
        foundVentureId = true;
        if (nested !== ventureId) {
          throw transferError("A transfer record belongs to a different venture.", "venture_transfer_cross_scope", 404);
        }
      }
      if (key === "workspaceId" && nested && !String(nested).startsWith(`${ventureId}__`)) {
        throw transferError("A product-change workspace belongs to a different venture.", "venture_transfer_cross_scope", 404);
      }
      visit(nested);
    }
  }
  visit(value);
  if (requireVentureId && !foundVentureId) {
    throw transferError("A transferred teammate record is missing its venture identity.", "venture_transfer_cross_scope", 404);
  }
}

function destinationRepository(repository) {
  const requested = String(repository ?? "").trim();
  if (!requested) throw transferError("Choose the destination product repository before importing.", "venture_repository_rebind_required");
  const resolved = path.resolve(requested);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw transferError("The destination product repository does not exist.", "venture_repository_invalid");
  }
  return fs.realpathSync(resolved);
}

function reboundDocuments(documents, repository) {
  const portable = portableDocuments(documents);
  return {
    ...portable,
    productChanges: (portable.productChanges ?? []).map((workspace) => ({
      ...workspace,
      repo: repository,
      transferState: "needs-refork",
    })),
  };
}

export function importVentureTransfer(file, { repository, ...options } = {}) {
  const ventureId = validateTransfer(file);
  const destination = destinationRepository(repository);
  if (openVenture(ventureId, options)) {
    throw transferError("A venture with this identity already exists on this machine.", "venture_transfer_conflict", 409);
  }
  const repositoryOwner = listVentures(options).find((venture) => {
    try { return fs.realpathSync(venture.repository) === destination; } catch { return false; }
  });
  if (repositoryOwner) {
    throw transferError("That product repository is already bound to another venture.", "venture_repository_in_use", 409);
  }

  const documents = reboundDocuments(file.venture.documents, destination);
  const bundle = {
    manifest: { ...withoutMachineState(file.venture.manifest), repository: destination },
    documents,
    souls: withoutMachineState(file.venture.souls ?? []),
  };
  const venture = importVenture(bundle, { ...options, repository: destination });
  const workspaces = (documents.productChanges ?? []).map((workspace) => workspace.id).filter(Boolean);
  const receipt = {
    id: "transfer",
    receiptId: `transfer-${crypto.randomBytes(6).toString("hex")}`,
    importedAt: new Date().toISOString(),
    sourceExportedAt: file.exportedAt ?? null,
    repository: destination,
    providerResume: "cold",
    productChangeWorktrees: workspaces.length ? "refork-required" : "none",
    reforkWorkspaceIds: workspaces,
  };
  setVentureDoc(venture.id, "settings", "transfer", receipt, options);
  return { venture, receipt };
}
