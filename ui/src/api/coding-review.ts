import { guardedPost } from "./transport";
import type { CodingReadiness, CodingWorkspace } from "./work";

export type CodingReviewComment = {
  id: string;
  workspaceId: string;
  threadRef: string;
  messageRef: string | null;
  body: string;
  state: "unresolved" | "addressed-awaiting-review";
  mapping: "exact" | "remapped" | "uncertain";
  mappingNote?: string | null;
  addressedByRunRef?: string | null;
  addressedAt?: string | null;
  anchor: {
    checkpointId: string;
    path: string;
    startLine: number;
    endLine: number;
    selectedText: string | null;
    sourceRef: string;
  };
  currentAnchor?: {
    checkpointId: string;
    path: string;
    startLine: number;
    endLine: number;
    sourceRef: string;
  } | null;
  createdAt: string;
};

export const addCodingReviewComment = (
  ventureId: string,
  id: string,
  comment: {
    checkpointId: string;
    path: string;
    startLine: number;
    endLine: number;
    selectedText?: string | null;
    sourceRef?: string | null;
    body: string;
    messageRef?: string | null;
  },
) => guardedPost<{
  workspace: CodingWorkspace;
  comment: CodingReviewComment;
  readiness: CodingReadiness | null;
}>(
  `/api/ventures/${encodeURIComponent(ventureId)}/coding-workspaces/${encodeURIComponent(id)}/review-comment`,
  comment,
);
