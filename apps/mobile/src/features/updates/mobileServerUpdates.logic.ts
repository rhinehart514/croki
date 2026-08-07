import type { ServerSelfUpdateCapability } from "@croki/contracts";
import { compareSemverVersions, parseSemver } from "@croki/shared/semver";

export type MobileServerUpdatePresentation =
  | {
      readonly kind: "update-client";
      readonly clientVersion: string;
      readonly serverVersion: string;
    }
  | {
      readonly kind: "update-server";
      readonly command: string;
      readonly serverVersion: string;
      readonly selfUpdate: ServerSelfUpdateCapability | null;
      readonly targetVersion: string;
    };

function normalizedVersion(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveMobileServerUpdate(input: {
  readonly clientVersion: string | null | undefined;
  readonly serverVersion: string | null | undefined;
  readonly selfUpdate: ServerSelfUpdateCapability | null | undefined;
}): MobileServerUpdatePresentation | null {
  const clientVersion = normalizedVersion(input.clientVersion);
  const serverVersion = normalizedVersion(input.serverVersion);
  if (
    clientVersion === null ||
    serverVersion === null ||
    parseSemver(clientVersion) === null ||
    parseSemver(serverVersion) === null
  ) {
    return null;
  }
  const comparison = compareSemverVersions(serverVersion, clientVersion);
  if (comparison === 0) return null;

  if (comparison > 0) {
    return {
      kind: "update-client",
      clientVersion,
      serverVersion,
    };
  }

  return {
    kind: "update-server",
    command: `npx croki-server@${clientVersion} serve`,
    serverVersion,
    selfUpdate: input.selfUpdate ?? null,
    targetVersion: clientVersion,
  };
}
