import { guardedDelete, guardedPut } from "./transport";

export type QueuedFounderTurn = {
  id: string;
  text: string;
  fromMessageId: string | null;
  state: "queued";
  queuedAt: string;
  updatedAt: string;
};

export const editQueuedFounderTurn = (
  ventureId: string,
  threadRef: string,
  betId: string,
  turnId: string,
  text: string,
) => guardedPut<{ turn: QueuedFounderTurn }>(
  `/api/ventures/${encodeURIComponent(ventureId)}/threads/${encodeURIComponent(threadRef.replace(/^thread:/, ""))}/follow-ups/${encodeURIComponent(turnId)}`,
  { betId, text },
);

export const removeQueuedFounderTurn = (
  ventureId: string,
  threadRef: string,
  betId: string,
  turnId: string,
) => guardedDelete<{ turn: QueuedFounderTurn }>(
  `/api/ventures/${encodeURIComponent(ventureId)}/threads/${encodeURIComponent(threadRef.replace(/^thread:/, ""))}/follow-ups/${encodeURIComponent(turnId)}?betId=${encodeURIComponent(betId)}`,
);
