export const RENDERER_RECOVERY_QUERY_KEY = "croki-recovery";
export const RENDERER_RECOVERY_REASON_QUERY_KEY = "croki-recovery-reason";
export const RENDERER_RECOVERY_LOCATION_QUERY_KEY = "croki-recovery-location";

const RENDERER_RECOVERY_REASONS = ["abnormal-exit", "crashed", "oom"] as const;
type RendererRecoveryReason = (typeof RENDERER_RECOVERY_REASONS)[number];

function isRendererRecoveryReason(value: string | null): value is RendererRecoveryReason {
  return value !== null && (RENDERER_RECOVERY_REASONS as readonly string[]).includes(value);
}

export interface RendererRecoveryReceipt {
  readonly reason: RendererRecoveryReason;
  readonly location: "reset" | "restored";
}

export function readRendererRecoveryReceipt(url: URL): RendererRecoveryReceipt | null {
  if (url.searchParams.get(RENDERER_RECOVERY_QUERY_KEY) !== "renderer") {
    return null;
  }
  const reason = url.searchParams.get(RENDERER_RECOVERY_REASON_QUERY_KEY);
  const location = url.searchParams.get(RENDERER_RECOVERY_LOCATION_QUERY_KEY);
  if (!isRendererRecoveryReason(reason) || (location !== "reset" && location !== "restored")) {
    return null;
  }
  return { reason, location };
}

export function clearRendererRecoveryReceipt(url: URL): URL {
  const next = new URL(url);
  next.searchParams.delete(RENDERER_RECOVERY_QUERY_KEY);
  next.searchParams.delete(RENDERER_RECOVERY_REASON_QUERY_KEY);
  next.searchParams.delete(RENDERER_RECOVERY_LOCATION_QUERY_KEY);
  return next;
}

function recoveryCause(reason: RendererRecoveryReason): string {
  switch (reason) {
    case "oom":
      return "The workspace ran out of memory";
    case "crashed":
      return "The workspace crashed";
    case "abnormal-exit":
      return "The workspace stopped unexpectedly";
  }
}

export function rendererRecoveryDescription(receipt: RendererRecoveryReceipt): string {
  const cause = recoveryCause(receipt.reason);
  if (receipt.location === "restored") {
    return `${cause}, so Croki reopened this screen. Agent and terminal work stayed attached to the server, and saved drafts remain available. Unsaved browser-only state was reset.`;
  }
  return `${cause}. Agent and terminal work stayed attached to the server, and saved drafts remain available. The previous screen and unsaved browser-only state could not be restored.`;
}
