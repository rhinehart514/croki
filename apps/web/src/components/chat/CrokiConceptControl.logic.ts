import type { CrokiApplication } from "@croki/shared/crokiApplication";
import {
  CROKI_CONCEPT_DIRECTORY,
  CROKI_CONCEPT_VERSION,
  type CrokiConceptFile,
} from "@croki/shared/crokiConcepts";

export function createCrokiConcept(
  application: CrokiApplication,
  name: string,
  intent: string,
  existingIds: readonly string[],
): CrokiConceptFile {
  const id = uniqueConceptId(name, existingIds);
  const branch = `croki/concept/${id}`;
  return {
    version: CROKI_CONCEPT_VERSION,
    kind: "concept",
    concept: { id, name: name.trim(), intent: intent.trim(), status: "exploring" },
    parent: {
      application: application.application.name,
      ...(application.released ? { releasedVersion: application.released.version } : {}),
      ...(application.building ? { buildingVersion: application.building.version } : {}),
    },
    scope: { branch },
    inherits: [],
    challenges: [],
    relationships: [],
    evidence: [],
  };
}

export function conceptIdsFromEntries(
  entries: readonly { readonly path: string }[],
): readonly string[] {
  const prefix = `${CROKI_CONCEPT_DIRECTORY}/`;
  return entries.flatMap((entry) => {
    if (!entry.path.startsWith(prefix) || !entry.path.endsWith(".croki")) return [];
    const id = entry.path.slice(prefix.length, -".croki".length);
    return id.includes("/") ? [] : [id];
  });
}

export function conceptThreadOptions(branch: string) {
  return { branch, envMode: "worktree" as const };
}

function uniqueConceptId(name: string, existingIds: readonly string[]): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "concept";
  const ids = new Set(existingIds);
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
