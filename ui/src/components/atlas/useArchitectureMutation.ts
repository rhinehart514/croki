import { useCallback, useEffect, useRef, useState } from "react";
import { mutateArchitecture, type ArchitectureMutationOperation } from "@/api";

export type ArchitectureMutationReceipt = {
  revision: number;
  reason: string;
  affectedContexts: unknown[];
};

export function useArchitectureMutation({
  ventureId,
  revision,
}: {
  ventureId: string;
  revision: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ArchitectureMutationReceipt | null>(null);
  const revisionRef = useRef(revision);
  useEffect(() => { revisionRef.current = Math.max(revisionRef.current, revision); }, [revision]);
  const getRevision = useCallback(() => revisionRef.current, []);
  const adoptRevision = useCallback((nextRevision: number) => {
    revisionRef.current = Math.max(revisionRef.current, nextRevision);
  }, []);

  const apply = useCallback(async (operations: ArchitectureMutationOperation[], reason: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await mutateArchitecture(ventureId, { baseRevision: revisionRef.current, operations, reason });
      adoptRevision(result.revision);
      setReceipt({ revision: result.revision, reason, affectedContexts: result.affectedContexts });
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Drover could not change the architecture.";
      setError(message);
      throw cause;
    } finally {
      setBusy(false);
    }
  }, [adoptRevision, ventureId]);

  return { apply, busy, error, receipt, getRevision, adoptRevision, clearReceipt: () => setReceipt(null) };
}
