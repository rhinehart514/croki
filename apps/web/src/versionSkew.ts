import type { EnvironmentId, ServerConfig, ServerSelfUpdateCapability } from "@croki/contracts";
import { compareSemverVersions, parseSemver } from "@croki/shared/semver";
import * as Schema from "effect/Schema";

import { APP_VERSION } from "./branding";
import { getLocalStorageItem, setLocalStorageItem } from "./hooks/useLocalStorage";

export interface VersionMismatch {
  readonly clientVersion: string;
  readonly serverVersion: string;
  readonly updateTarget: "client" | "server" | null;
  readonly hint: string;
}

export const VERSION_MISMATCH_DISMISSALS_STORAGE_KEY = "croki:version-mismatch-dismissals:v1";

export function resolveServerPackageUpdatesAvailable(
  configured: string | undefined,
  development: boolean,
): boolean {
  const normalized = configured?.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return development;
}

export const SERVER_PACKAGE_UPDATES_AVAILABLE = resolveServerPackageUpdatesAvailable(
  import.meta.env.VITE_CROKI_SERVER_PACKAGE_UPDATES_AVAILABLE,
  import.meta.env.DEV,
);

const VersionMismatchDismissalsSchema = Schema.Struct({
  keys: Schema.Array(Schema.String),
});

type VersionMismatchDismissals = typeof VersionMismatchDismissalsSchema.Type;

function normalizeVersion(version: string | null | undefined): string | null {
  const trimmed = version?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function resolveVersionMismatch(
  serverVersion: string | null | undefined,
): VersionMismatch | null {
  const normalizedClientVersion = normalizeVersion(APP_VERSION);
  const normalizedServerVersion = normalizeVersion(serverVersion);
  if (
    !normalizedClientVersion ||
    !normalizedServerVersion ||
    normalizedClientVersion === normalizedServerVersion
  ) {
    return null;
  }

  const versionsAreComparable =
    parseSemver(normalizedClientVersion) !== null && parseSemver(normalizedServerVersion) !== null;
  const comparison = versionsAreComparable
    ? compareSemverVersions(normalizedServerVersion, normalizedClientVersion)
    : 0;
  if (versionsAreComparable && comparison === 0) return null;
  const updateTarget = !versionsAreComparable ? null : comparison > 0 ? "client" : "server";
  const hint =
    updateTarget === "client"
      ? "This server is newer than this Croki client. Update Croki on this device to match it."
      : updateTarget === "server"
        ? "This server is older than this Croki client. Update the server to match it."
        : "Version mismatch. Sync this Croki client and server to the same version.";

  return {
    clientVersion: normalizedClientVersion,
    serverVersion: normalizedServerVersion,
    updateTarget,
    hint,
  };
}

export function resolveServerConfigVersionMismatch(
  serverConfig: Pick<ServerConfig, "environment"> | null | undefined,
): VersionMismatch | null {
  return resolveVersionMismatch(serverConfig?.environment.serverVersion);
}

/** The update path the connected server offers, or null when it only
    supports a manual relaunch (older servers, dev checkouts, Windows). */
export function resolveServerSelfUpdateCapability(
  serverConfig: Pick<ServerConfig, "environment"> | null | undefined,
): ServerSelfUpdateCapability | null {
  return serverConfig?.environment.capabilities.serverSelfUpdate ?? null;
}

/** Desktop-managed servers update with their owning app. Every other server
    path installs the exact croki-server package and must only be offered when
    that release destination was enabled for this client build. */
export function serverUpdatePathAvailable(
  capability: ServerSelfUpdateCapability | null,
  serverPackageUpdatesAvailable = SERVER_PACKAGE_UPDATES_AVAILABLE,
): boolean {
  return capability === "desktop-managed" || serverPackageUpdatesAvailable;
}

/** The command to hand users whose server cannot update itself. */
export function manualServerUpdateCommand(targetVersion: string): string {
  return `npx croki-server@${targetVersion}`;
}

/** One sentence telling the user how to resolve version skew for a server,
    matched to the update path it offers. */
export function serverUpdateGuidance(
  capability: ServerSelfUpdateCapability | null,
  serverLabel: string,
): string {
  switch (capability) {
    case "boot-service":
    case "respawn":
      return `Update the ${serverLabel} so they stay in sync.`;
    case "desktop-managed":
      return `The ${serverLabel} is run by the Croki desktop app on its machine — update the desktop app there to sync them.`;
    default:
      return `Relaunch the ${serverLabel} with the copied command to sync them.`;
  }
}

export function buildVersionMismatchDismissalKey(
  environmentId: EnvironmentId,
  mismatch: Pick<VersionMismatch, "clientVersion" | "serverVersion">,
): string {
  return `${environmentId}:${mismatch.clientVersion}:${mismatch.serverVersion}`;
}

function readVersionMismatchDismissals(): VersionMismatchDismissals {
  try {
    return (
      getLocalStorageItem(
        VERSION_MISMATCH_DISMISSALS_STORAGE_KEY,
        VersionMismatchDismissalsSchema,
      ) ?? { keys: [] }
    );
  } catch (error) {
    console.error("Could not read version-mismatch dismissals.", error);
    return { keys: [] };
  }
}

function writeVersionMismatchDismissals(document: VersionMismatchDismissals): void {
  try {
    setLocalStorageItem(
      VERSION_MISMATCH_DISMISSALS_STORAGE_KEY,
      document,
      VersionMismatchDismissalsSchema,
    );
  } catch (error) {
    console.error("Could not persist version-mismatch dismissals.", error);
  }
}

export function isVersionMismatchDismissed(dismissalKey: string | null | undefined): boolean {
  if (!dismissalKey) {
    return false;
  }
  return readVersionMismatchDismissals().keys.includes(dismissalKey);
}

export function dismissVersionMismatch(dismissalKey: string | null | undefined): void {
  if (!dismissalKey) {
    return;
  }
  const document = readVersionMismatchDismissals();
  if (document.keys.includes(dismissalKey)) {
    return;
  }
  writeVersionMismatchDismissals({
    keys: [...document.keys, dismissalKey],
  });
}

export function appendVersionMismatchHint(
  message: string | null | undefined,
  mismatch: VersionMismatch | null | undefined,
): string | null {
  const normalizedMessage = normalizeVersion(message);
  if (!normalizedMessage) {
    return mismatch?.hint ?? null;
  }
  if (!mismatch) {
    return normalizedMessage;
  }
  return `${normalizedMessage} Hint: ${mismatch.hint}`;
}
