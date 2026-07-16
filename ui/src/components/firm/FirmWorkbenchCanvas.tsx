import type { ReactNode } from "react";
import type { FirmVenture } from "@/api";
import type { FirmArchitectureProjection, FirmLens as FirmLensReadModel } from "@/types";
import type { CanvasSelection } from "./directionTarget";
import { FirmLens } from "@/components/lens/FirmLens";
import { VentureAtlas } from "@/components/atlas/VentureAtlas";

export function FirmWorkbenchCanvas({
  venture,
  lens,
  selection,
  wallOpen,
  stale,
  readOnly,
  capabilityRefreshKey,
  connectionPhase,
  showReturnBand,
  onSelectionChange,
  onWallOpenChange,
  onLensChange,
  onArchitectureChange,
  onRefresh,
  onReturnToConversation,
  onOpenSettings,
}: {
  venture: FirmVenture;
  lens: FirmLensReadModel | null;
  selection: CanvasSelection;
  wallOpen: boolean;
  stale: boolean;
  readOnly: boolean;
  capabilityRefreshKey: number;
  connectionPhase: string;
  showReturnBand: boolean;
  onSelectionChange: (selection: CanvasSelection) => void;
  onWallOpenChange: (open: boolean) => void;
  onLensChange: (lens: FirmLensReadModel) => void;
  onArchitectureChange: (projection: FirmArchitectureProjection | null) => void;
  onRefresh: () => void;
  onReturnToConversation: () => void;
  onOpenSettings: () => void;
}) {
  const compatibleLens = (controlledLens: FirmLensReadModel | null): ReactNode => (
    <FirmLens
      ventureId={venture.id}
      repository={venture.repository}
      lens={controlledLens}
      wallQueue={controlledLens?.wallItems ?? []}
      selection={selection}
      wallOpen={wallOpen}
      onSelectionChange={onSelectionChange}
      onWallOpenChange={onWallOpenChange}
      onLensChange={onLensChange}
      onConversationChange={onRefresh}
      onReturnToConversation={onReturnToConversation}
      onOpenSettings={onOpenSettings}
      capabilityRefreshKey={capabilityRefreshKey}
      stale={stale}
      readOnly={readOnly}
    />
  );
  return (
    <main className="firm-app-canvas" aria-label={`${venture.name} venture canvas`} data-connection={connectionPhase}>
      {lens ? (
        <VentureAtlas
          key={venture.id}
          ventureId={venture.id}
          lens={lens}
          wallQueue={lens.wallItems ?? []}
          selection={selection}
          wallOpen={wallOpen}
          stale={stale}
          readOnly={readOnly}
          showReturnBand={showReturnBand}
          repository={venture.repository}
          capabilityRefreshKey={capabilityRefreshKey}
          onOpenSettings={onOpenSettings}
          onSelectionChange={onSelectionChange}
          onWallOpenChange={onWallOpenChange}
          onLensChange={onLensChange}
          onArchitectureChange={onArchitectureChange}
          onRefresh={onRefresh}
          fallback={compatibleLens(lens)}
        />
      ) : compatibleLens(null)}
    </main>
  );
}
