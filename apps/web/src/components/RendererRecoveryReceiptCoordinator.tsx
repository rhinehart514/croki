import { useAtomValue } from "@effect/atom-react";
import { useEffect, useRef, useState } from "react";

import {
  clearRendererRecoveryReceipt,
  readRendererRecoveryReceipt,
  rendererRecoveryDescription,
} from "../rendererRecoveryReceipt";
import { primaryServerWelcomeAtom } from "../state/server";
import { toastManager } from "./ui/toast";

export function RendererRecoveryReceiptCoordinator() {
  const serverWelcome = useAtomValue(primaryServerWelcomeAtom);
  const [receipt] = useState(() => readRendererRecoveryReceipt(new URL(window.location.href)));
  const shownRef = useRef(false);

  useEffect(() => {
    if (!serverWelcome || !receipt || shownRef.current) {
      return;
    }
    shownRef.current = true;
    const cleanUrl = clearRendererRecoveryReceipt(new URL(window.location.href));
    window.history.replaceState(window.history.state, "", cleanUrl);
    toastManager.add({
      type: "info",
      title: "Workspace recovered",
      description: rendererRecoveryDescription(receipt),
      data: {
        hideCopyButton: true,
      },
    });
  }, [receipt, serverWelcome]);

  return null;
}
