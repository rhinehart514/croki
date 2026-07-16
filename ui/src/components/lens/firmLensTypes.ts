import type { WallQueueItemView } from "@/api";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import type { FirmLens } from "@/types";

export type FirmLensProps = {
  ventureId: string;
  repository?: string;
  selection?: CanvasSelection;
  wallOpen?: boolean;
  onSelectionChange?: (selection: CanvasSelection) => void;
  onWallOpenChange?: (open: boolean) => void;
  onLensChange?: (lens: FirmLens) => void;
  onConversationChange?: () => void;
  onReturnToConversation?: () => void;
  onOpenSettings?: () => void;
  capabilityRefreshKey?: number;
  lens?: FirmLens | null;
  wallQueue?: WallQueueItemView[] | null;
  stale?: boolean;
  readOnly?: boolean;
};
