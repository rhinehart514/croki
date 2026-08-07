import type { ExpoConfig } from "expo/config";

export const INHERITED_T3_EAS_PROJECT_ID = "d763fcb8-d37c-41ea-a773-b54a0ab4a454";

const EAS_PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveCrokiEasUpdates(value: string | undefined): {
  readonly projectId: string | null;
  readonly updates: NonNullable<ExpoConfig["updates"]>;
} {
  const projectId = value?.trim() || null;
  if (projectId === INHERITED_T3_EAS_PROJECT_ID) {
    throw new Error(
      "CROKI_EAS_PROJECT_ID must identify a Croki-owned EAS project, not the inherited T3 project.",
    );
  }
  if (projectId !== null && !EAS_PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error("CROKI_EAS_PROJECT_ID must be a valid EAS project UUID.");
  }

  return {
    projectId,
    updates: {
      enabled: projectId !== null,
      ...(projectId === null ? {} : { url: `https://u.expo.dev/${projectId}` }),
      checkAutomatically: projectId === null ? "NEVER" : "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
  };
}
