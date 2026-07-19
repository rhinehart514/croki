// The shipped desktop frame is chat-first. This compatibility export keeps the app entry stable while
// the feature-local ThreadShell owns rail, conversation, and optional visual-stage presentation state.
import type { FirmVenture } from "@/api";
import { ThreadShell } from "@/components/thread/ThreadShell";

export function VentureWorkspace({ venture, onOpenVenture }: { venture: FirmVenture; onOpenVenture: (venture: FirmVenture) => void }) {
  return <ThreadShell venture={venture} onOpenVenture={onOpenVenture} />;
}
