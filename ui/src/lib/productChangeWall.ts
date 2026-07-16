import {
  getProductChangeReadiness,
  reviewProductChange,
  type ProductChangeReadiness,
  type WallQueueItemView,
} from "@/api";

function refs(item: WallQueueItemView): { workspaceId: string; revisionId: string } {
  const workspaceId = typeof item.effect.workspaceId === "string" ? item.effect.workspaceId : "";
  const revisionId = typeof item.effect.revisionId === "string" ? item.effect.revisionId : "";
  if (!workspaceId || !revisionId) throw new Error("This product change is missing its review state.");
  return { workspaceId, revisionId };
}

export async function inspectWallProductChange(
  ventureId: string,
  workspaceId: string,
  revisionId: string,
): Promise<ProductChangeReadiness> {
  const { readiness } = await getProductChangeReadiness(ventureId, workspaceId, revisionId);
  return readiness;
}

export async function approveWallProductChange(
  item: WallQueueItemView,
  note?: string,
): Promise<ProductChangeReadiness> {
  const { workspaceId, revisionId } = refs(item);
  await reviewProductChange(item.ventureId, workspaceId, revisionId, { decision: "approve", note });
  return inspectWallProductChange(item.ventureId, workspaceId, revisionId);
}
