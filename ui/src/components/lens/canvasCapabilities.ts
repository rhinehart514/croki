import { useEffect, useMemo, useState } from "react";
import { getCredentials } from "@/api";

export const CANVAS_ITEM_MIME = "application/x-drover-canvas-item";

export type CanvasCapability = {
  id: "product-truth" | "product-change" | "gmail";
  name: string;
  description: string;
  source: string;
  authority: "read" | "wall";
  icon: "database" | "git" | "mail";
};

export function useCanvasCapabilities(repository = "Product repository", refreshKey = 0) {
  const [gmailConnected, setGmailConnected] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => getCredentials())
      .then(({ credentials }) => {
        if (live) setGmailConnected(credentials.some((credential) => credential.provider === "gmail"));
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [refreshKey]);

  return useMemo<CanvasCapability[]>(() => [
    {
      id: "product-truth",
      name: "Product truth",
      description: "Read the bound repository and cite the evidence behind product claims.",
      source: repository,
      authority: "read",
      icon: "database",
    },
    {
      id: "product-change",
      name: "Product changes",
      description: "Prepare isolated local changes; applying them still waits for your review.",
      source: repository,
      authority: "wall",
      icon: "git",
    },
    ...(gmailConnected ? [{
      id: "gmail" as const,
      name: "Gmail",
      description: "Read replies and prepare sends; delivery still waits for your release.",
      source: "Connected account",
      authority: "wall" as const,
      icon: "mail" as const,
    }] : []),
  ], [gmailConnected, repository]);
}
