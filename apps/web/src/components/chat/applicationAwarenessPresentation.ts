interface ApplicationAwarenessReceipt {
  readonly name: string | null;
  readonly baselineVersion: string | null;
  readonly targetVersion: string | null;
  readonly checkedScreenCount: number;
  readonly evidenceCount: number;
  readonly evidenceStatus: string | null;
}

export function applicationAwarenessToolPreview(toolData: unknown): string | null {
  const call = asRecord(toolData);
  if (call?.tool !== "application_observe") return null;
  const result = applicationAwarenessResult(call.result);
  if (!result) return "Application evidence unavailable";
  const receipt = toReceipt(result);
  const direction =
    receipt.baselineVersion && receipt.targetVersion
      ? `${receipt.baselineVersion} → ${receipt.targetVersion}`
      : (receipt.targetVersion ?? receipt.baselineVersion ?? "direction absent");
  const parts = [receipt.name, direction].filter((part): part is string => Boolean(part));
  parts.push(
    `${receipt.checkedScreenCount} checked ${receipt.checkedScreenCount === 1 ? "screen" : "screens"}`,
    `${receipt.evidenceCount} observed ${receipt.evidenceCount === 1 ? "source" : "sources"}`,
  );
  if (receipt.evidenceStatus) parts.push(`evidence ${receipt.evidenceStatus}`);
  return parts.join(" · ");
}

function applicationAwarenessResult(value: unknown): Record<string, unknown> | null {
  const result = asRecord(value);
  if (!result) return null;
  const structuredContent = asRecord(result.structuredContent);
  if (structuredContent?.version === 1) return structuredContent;
  if (result.version === 1) return result;
  const content = Array.isArray(result.content) ? result.content : [];
  for (const item of content) {
    const block = asRecord(item);
    if (block?.type !== "text" || typeof block.text !== "string") continue;
    try {
      const parsed = asRecord(JSON.parse(block.text));
      if (parsed?.version === 1) return parsed;
    } catch {
      // A provider may include non-JSON text blocks beside structured output.
    }
  }
  return null;
}

function toReceipt(result: Record<string, unknown>): ApplicationAwarenessReceipt {
  const canon = asRecord(result.canon);
  const change = asRecord(result.change);
  const coverage = asRecord(result.coverage);
  return {
    name: typeof canon?.name === "string" ? canon.name : null,
    baselineVersion: typeof change?.baselineVersion === "string" ? change.baselineVersion : null,
    targetVersion: typeof change?.targetVersion === "string" ? change.targetVersion : null,
    checkedScreenCount: Array.isArray(result.checkedScreens) ? result.checkedScreens.length : 0,
    evidenceCount: Array.isArray(result.projectEvidence) ? result.projectEvidence.length : 0,
    evidenceStatus:
      typeof coverage?.projectEvidenceStatus === "string" ? coverage.projectEvidenceStatus : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
