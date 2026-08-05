import type { CrokiApplication } from "@croki/shared/crokiApplication";

export interface ApplicationManifestEvidence {
  readonly path: string;
  readonly name: string | null;
  readonly version: string | null;
  readonly description: string | null;
}

export interface ApplicationLineageDraft {
  readonly name: string;
  readonly releasedVersion: string;
  readonly releasedSummary: string;
  readonly buildingVersion: string;
  readonly buildingIntent: string;
}

export interface ApplicationLineageDraftErrors {
  name?: string;
  releasedSummary?: string;
  buildingIntent?: string;
  versions?: string;
}

export function discoverApplicationManifest(input: {
  readonly packageJson?: string | null | undefined;
  readonly pyprojectToml?: string | null | undefined;
  readonly cargoToml?: string | null | undefined;
}): ApplicationManifestEvidence | null {
  const packageEvidence = parsePackageJson(input.packageJson);
  if (packageEvidence) return packageEvidence;

  const pyprojectEvidence = parseTomlSection(input.pyprojectToml, "project", "pyproject.toml");
  if (pyprojectEvidence) return pyprojectEvidence;

  return parseTomlSection(input.cargoToml, "package", "Cargo.toml");
}

export function initialApplicationLineageDraft(
  workspaceName: string,
  evidence: ApplicationManifestEvidence | null,
  projectThreadTitles: readonly string[] = [],
): ApplicationLineageDraft {
  const name = evidence?.name ?? workspaceName;
  return {
    name,
    releasedVersion: "",
    releasedSummary: "",
    buildingVersion: evidence?.version ?? "",
    buildingIntent:
      evidence?.description ??
      proposedBuildingIntent(name, projectThreadTitles) ??
      (evidence?.version
        ? `Carry the project's current work into ${name} ${evidence.version}.`
        : ""),
  };
}

export function applicationLineageDraft(application: CrokiApplication): ApplicationLineageDraft {
  return {
    name: application.application.name,
    releasedVersion: application.released?.version ?? "",
    releasedSummary: application.released?.summary ?? "",
    buildingVersion: application.building?.version ?? "",
    buildingIntent: application.building?.intent ?? "",
  };
}

function proposedBuildingIntent(
  applicationName: string,
  projectThreadTitles: readonly string[],
): string | null {
  const titles = projectThreadTitles
    .map((title) => title.trim())
    .filter((title) => title.length > 0 && title.toLowerCase() !== "new thread")
    .slice(0, 3);
  if (titles.length === 0) return null;
  return `Bring ${applicationName} forward through the current project work: ${titles.join("; ")}.`;
}

export function validateApplicationLineageDraft(
  draft: ApplicationLineageDraft,
): ApplicationLineageDraftErrors {
  const name = draft.name.trim();
  const releasedVersion = draft.releasedVersion.trim();
  const buildingVersion = draft.buildingVersion.trim();
  const errors: ApplicationLineageDraftErrors = {};

  if (!name) errors.name = "Name the application.";
  if (!releasedVersion && !buildingVersion) {
    errors.versions = "Add a released or building version.";
  }
  if (releasedVersion && !draft.releasedSummary.trim()) {
    errors.releasedSummary = "Describe what users can already rely on.";
  }
  if (buildingVersion && !draft.buildingIntent.trim()) {
    errors.buildingIntent = "Describe what this version should change.";
  }
  return errors;
}

export function buildApplicationLineage(draft: ApplicationLineageDraft): CrokiApplication | null {
  if (Object.keys(validateApplicationLineageDraft(draft)).length > 0) return null;

  const releasedVersion = draft.releasedVersion.trim();
  const buildingVersion = draft.buildingVersion.trim();
  return {
    version: 1,
    application: { name: draft.name.trim() },
    ...(releasedVersion
      ? {
          released: {
            version: releasedVersion,
            summary: draft.releasedSummary.trim(),
            product: [],
            gtm: [],
            learnings: [],
            sources: [],
          },
        }
      : {}),
    ...(buildingVersion
      ? {
          building: {
            version: buildingVersion,
            intent: draft.buildingIntent.trim(),
            product: [],
            gtm: [],
            successSignals: [],
          },
        }
      : {}),
  };
}

export function serializeApplicationLineage(application: CrokiApplication): string {
  return `${JSON.stringify(application, null, 2)}\n`;
}

function parsePackageJson(source: string | null | undefined): ApplicationManifestEvidence | null {
  if (!source) return null;
  try {
    const value: unknown = JSON.parse(source);
    if (!isRecord(value)) return null;
    const name = stringValue(value.name);
    const version = stringValue(value.version);
    const description = stringValue(value.description);
    if (!name && !version && !description) return null;
    return { path: "package.json", name, version, description };
  } catch {
    return null;
  }
}

function parseTomlSection(
  source: string | null | undefined,
  section: string,
  path: string,
): ApplicationManifestEvidence | null {
  if (!source) return null;
  const sectionMatch = new RegExp(
    `(?:^|\\n)\\s*\\[${section}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\s*\\[|$)`,
  ).exec(source);
  if (!sectionMatch?.[1]) return null;
  const name = tomlString(sectionMatch[1], "name");
  const version = tomlString(sectionMatch[1], "version");
  const description = tomlString(sectionMatch[1], "description");
  return name || version || description ? { path, name, version, description } : null;
}

function tomlString(section: string, key: string): string | null {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, "m").exec(section);
  return match?.[1]?.trim() || null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
