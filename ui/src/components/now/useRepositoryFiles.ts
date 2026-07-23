import { useEffect, useState } from "react";
import { getRepositoryFiles } from "@/api";

// The venture's repo-relative file list, loaded once per venture for Work code-mode `@`-file scoping.
// Fail-open: a blind or non-git venture yields an empty list, so the composer simply shows no file
// matches rather than an error. Disabled outside code mode, where files are not a scope.
export function useRepositoryFiles(ventureId: string, enabled: boolean) {
  const [files, setFiles] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    getRepositoryFiles(ventureId)
      .then((result) => { if (live) setFiles(result.files); })
      .catch(() => { if (live) setFiles([]); });
    return () => { live = false; };
  }, [ventureId, enabled]);
  // Return an empty list while disabled rather than clearing state synchronously in the effect, which
  // would trigger cascading renders. Re-enabling refetches through the effect above.
  return enabled ? files : [];
}
