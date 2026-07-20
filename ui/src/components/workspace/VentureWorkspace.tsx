// The shipped desktop frame is chat-first. This compatibility export keeps the app entry stable while
// the feature-local ThreadShell owns rail, conversation, and optional visual-stage presentation state.
import type { FirmVenture } from "@/api";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

export function VentureWorkspace({ venture, onOpenVenture }: { venture: FirmVenture; onOpenVenture: (venture: FirmVenture) => void }) {
  return <WorkspaceShell venture={venture} onOpenVenture={onOpenVenture} />;
}
