import { useEffect, useMemo, useState } from "react";
import { getCredentials } from "@/api";

export const CANVAS_ITEM_MIME = "application/x-drover-canvas-item";

export type CanvasCapability = {
  id: "product-truth" | "gmail";
  name: string;
  description: string;
  source: string;
  authority: "read" | "wall";
  icon: "database" | "mail";
  connected: boolean;
};

// The two real ports today, rendered as the composite's warm instruments: the bound product
// repository (always connected — it is how the crew reads product truth) and Gmail (connected only
// when the founder has wired the account; shown "not connected" otherwise so the port is visible, not
// hidden). No invented connectors; unavailable stays honestly unavailable (contract §2.6).
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
      name: "Product repository",
      description: "Read the bound repository and cite the evidence behind product claims.",
      source: repository,
      authority: "read",
      icon: "database",
      connected: true,
    },
    {
      id: "gmail",
      name: "Gmail",
      description: "Read replies and prepare sends; delivery still waits for your release.",
      source: gmailConnected ? "Connected account" : "Not connected",
      authority: "wall",
      icon: "mail",
      connected: gmailConnected,
    },
  ], [gmailConnected, repository]);
}
