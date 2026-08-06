import type { ServerSelfUpdateCapability } from "@croki/contracts";

export interface MobileServerUpdatePresentation {
  readonly command: string;
  readonly serverVersion: string;
  readonly selfUpdate: ServerSelfUpdateCapability | null;
  readonly targetVersion: string;
}

function normalizedVersion(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveMobileServerUpdate(input: {
  readonly clientVersion: string | null | undefined;
  readonly serverVersion: string | null | undefined;
  readonly selfUpdate: ServerSelfUpdateCapability | null | undefined;
}): MobileServerUpdatePresentation | null {
  const targetVersion = normalizedVersion(input.clientVersion);
  const serverVersion = normalizedVersion(input.serverVersion);
  if (targetVersion === null || serverVersion === null || targetVersion === serverVersion) {
    return null;
  }

  return {
    command: `npx croki-server@${targetVersion} serve`,
    serverVersion,
    selfUpdate: input.selfUpdate ?? null,
    targetVersion,
  };
}
