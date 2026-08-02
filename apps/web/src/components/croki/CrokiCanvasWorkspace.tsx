import type {
  CrokiContext,
  CrokiContextEdge,
  CrokiContextReference,
} from "@croki/shared/crokiContext";

import type { ActivePlanState } from "~/session-logic";
import { Button } from "../ui/button";
import { CrokiCanvasField } from "./CrokiCanvasField";
import type { CrokiCanvasView } from "./crokiCanvasLanguage";

interface CrokiCanvasWorkspaceProps {
  readonly activePlan: ActivePlanState | null;
  readonly context: CrokiContext;
  readonly focusIds: readonly string[];
  readonly layoutKey: string;
  readonly onBuildFromRepository?: () => void;
  readonly onClearSelection: () => void;
  readonly onConnect: (connection: {
    readonly from: string;
    readonly to: string;
  }) => CrokiContextEdge | null;
  readonly onDisconnect: (edge: CrokiContextEdge) => void;
  readonly onReplaceEdge: (
    previous: CrokiContextEdge,
    next: CrokiContextEdge,
  ) => CrokiContextEdge | null;
  readonly onPrepareGtm?: () => void;
  readonly onOpenPlan?: () => void;
  readonly onOpenReference?: (reference: CrokiContextReference) => void;
  readonly onSelect: (id: string) => void;
  readonly selectedId?: string | null;
  readonly view: CrokiCanvasView;
}

export function CrokiCanvasWorkspace(props: CrokiCanvasWorkspaceProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CrokiCanvasField
        activePlan={props.activePlan}
        context={props.context}
        focusIds={props.focusIds}
        layoutKey={props.layoutKey}
        view={props.view}
        onClearSelection={props.onClearSelection}
        onConnect={props.onConnect}
        onDisconnect={props.onDisconnect}
        onReplaceEdge={props.onReplaceEdge}
        {...(props.onOpenPlan ? { onOpenPlan: props.onOpenPlan } : {})}
        {...(props.onOpenReference ? { onOpenReference: props.onOpenReference } : {})}
        onSelect={props.onSelect}
        {...(props.selectedId !== undefined ? { selectedId: props.selectedId } : {})}
        {...(props.onBuildFromRepository
          ? { onBuildFromRepository: props.onBuildFromRepository }
          : {})}
      />

      {props.view === "gtm" && props.onPrepareGtm ? (
        <Button
          className="h-8 shrink-0 rounded-none border-x-0 border-b-0 text-[10px]"
          size="sm"
          variant="outline"
          onClick={props.onPrepareGtm}
        >
          Explore market evidence in Thread
        </Button>
      ) : null}
    </div>
  );
}
