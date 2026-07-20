import type { SystemIndexObject } from "@/api";

export type ReturnedEvidence = {
  outcomeRef: string;
  releaseRef: string;
  observationContractRef: string | null;
  from: string | null;
  source: string | null;
  observedAt: string | null;
  attribution: string;
  affectedObjectRefs: string[];
  interpretation: "unresolved";
};

export function returnedEvidence(object: SystemIndexObject): ReturnedEvidence | null {
  const value = object.properties.returnedEvidence;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.outcomeRef !== "string" || typeof record.releaseRef !== "string") return null;
  return {
    outcomeRef: record.outcomeRef,
    releaseRef: record.releaseRef,
    observationContractRef: typeof record.observationContractRef === "string" ? record.observationContractRef : null,
    from: typeof record.from === "string" ? record.from : null,
    source: typeof record.source === "string" ? record.source : null,
    observedAt: typeof record.observedAt === "string" ? record.observedAt : null,
    attribution: typeof record.attribution === "string" ? record.attribution : "unattributed",
    affectedObjectRefs: Array.isArray(record.affectedObjectRefs) ? record.affectedObjectRefs.filter((entry): entry is string => typeof entry === "string") : [],
    interpretation: "unresolved",
  };
}

export function isReturnedEvidence(object: SystemIndexObject | null): object is SystemIndexObject {
  return Boolean(object?.projectionOnly && returnedEvidence(object));
}
