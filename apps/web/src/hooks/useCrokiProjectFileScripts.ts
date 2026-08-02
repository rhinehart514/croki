import {
  CROKI_PROJECT_FILE_NAME,
  type EnvironmentId,
  type CrokiProjectFileScript,
} from "@croki/contracts";
import { CrokiProjectFileFromJson } from "@croki/shared/crokiProjectFile";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { useMemo } from "react";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";

const decodeCrokiProjectFile = Schema.decodeExit(CrokiProjectFileFromJson);

const NO_SCRIPTS: ReadonlyArray<CrokiProjectFileScript> = [];

/**
 * Scripts declared in the project's checked-in `croki.json`, offered in the
 * scripts menu for import. Missing, truncated, or invalid files resolve to
 * an empty list.
 */
export function useCrokiProjectFileScripts(
  environmentId: EnvironmentId,
  cwd: string | null,
): ReadonlyArray<CrokiProjectFileScript> {
  const query = useProjectFileQuery(
    environmentId,
    cwd ?? "",
    CROKI_PROJECT_FILE_NAME,
    cwd !== null,
  );
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  return useMemo(() => {
    if (contents === null) return NO_SCRIPTS;
    const decoded = decodeCrokiProjectFile(contents);
    if (Exit.isFailure(decoded)) return NO_SCRIPTS;
    return decoded.value.scripts ?? NO_SCRIPTS;
  }, [contents]);
}
