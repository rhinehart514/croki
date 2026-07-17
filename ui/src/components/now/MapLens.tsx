// The Map — the structural lens a non-technical founder can't hold in their head: how the venture
// connects, what depends on what. Reuses the existing world engine (projection → layout → camera) as a
// view, not a home. It is deliberately secondary: if the stream tells the founder everything, this can
// be cut. Kept first-class-reachable so that call is made on evidence.
import { ShellStateProvider } from "@/components/immersive/state/ShellStateContext";
import { VentureWorld } from "@/components/immersive/world/VentureWorld";
import type { FirmArchitectureProjection, FirmConversationMessage, FirmLens } from "@/types";

export function MapLens({
  ventureId,
  lens,
  projection,
  capabilities,
  conversation,
}: {
  ventureId: string;
  lens: FirmLens;
  projection: FirmArchitectureProjection | null;
  capabilities: Array<{ id: string; name: string; description: string; authority: "read" | "wall"; connected: boolean }>;
  conversation: FirmConversationMessage[];
}) {
  return (
    <div className="now-map">
      <ShellStateProvider>
        <VentureWorld
          ventureId={ventureId}
          lens={lens}
          projection={projection}
          capabilities={capabilities}
          conversation={conversation}
          onOpenWall={() => undefined}
        />
      </ShellStateProvider>
      <div className="now-map-note">How your venture connects — its work, the ways it reaches people, and what depends on what.</div>
    </div>
  );
}
