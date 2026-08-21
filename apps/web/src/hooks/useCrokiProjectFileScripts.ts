import {
  CROKI_PROJECT_FILE_NAME,
  type EnvironmentId,
  type CrokiProjectFile,
  type CrokiProjectFileScript,
} from "@croki/contracts";
import { parseCrokiProjectFile } from "@croki/shared/crokiProjectFile";
import { useMemo } from "react";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";

const NO_SCRIPTS: ReadonlyArray<CrokiProjectFileScript> = [];

export interface CrokiProjectFileState {
  /**
   * - `valid`: croki.json exists and decoded.
   * - `invalid`: croki.json exists but fails to decode (the server then ignores
   *   the whole file, including `iconPath` and every script).
   * - `missing`: no readable croki.json at the workspace root.
   * - `loading`: the file query has not settled yet.
   */
  status: "loading" | "missing" | "invalid" | "valid";
  /** The decoded file when status is `valid`, null otherwise. */
  file: CrokiProjectFile | null;
  scripts: ReadonlyArray<CrokiProjectFileScript>;
}

/**
 * Decoded state of the project's checked-in `croki.json`, including whether the
 * file exists but is broken — which the runtime otherwise swallows silently.
 */
export function useCrokiProjectFileState(
  environmentId: EnvironmentId,
  cwd: string | null,
): CrokiProjectFileState {
  const query = useProjectFileQuery(
    environmentId,
    cwd ?? "",
    CROKI_PROJECT_FILE_NAME,
    cwd !== null,
  );
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  const isPending = query.isPending;
  return useMemo(() => {
    if (contents === null) {
      return {
        status: isPending ? "loading" : "missing",
        file: null,
        scripts: NO_SCRIPTS,
      } as const;
    }
    const file = parseCrokiProjectFile(contents);
    if (file === null) {
      return { status: "invalid", file: null, scripts: NO_SCRIPTS } as const;
    }
    return { status: "valid", file, scripts: file.scripts ?? NO_SCRIPTS } as const;
  }, [contents, isPending]);
}

/**
 * Scripts declared in the project's checked-in `croki.json`, offered in the
 * scripts menu for import. Missing, truncated, or invalid files resolve to
 * an empty list.
 */
export function useCrokiProjectFileScripts(
  environmentId: EnvironmentId,
  cwd: string | null,
): ReadonlyArray<CrokiProjectFileScript> {
  return useCrokiProjectFileState(environmentId, cwd).scripts;
}
